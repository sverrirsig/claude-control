const { app, BrowserWindow, screen, shell, utilityProcess, dialog, ipcMain } = require("electron");
const { spawn, execFileSync } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(require("child_process").execFile);
const crypto = require("crypto");
const path = require("path");
const net = require("net");
const http = require("http");
const fs = require("fs");

let pty;
try {
  pty = require("node-pty");
} catch (err) {
  console.warn("node-pty not available:", err.message);
}

const PORT = 3200;
let nextProcess = null;
let ptyIdCounter = 0;
const ptyProcesses = new Map();
const ptyBuffers = new Map(); // ptyId → string (scrollback buffer for reattach)
const ptyTmuxNames = new Map(); // ptyId → tmux session name (or null)
const PTY_BUFFER_LIMIT = 100_000; // ~100KB per terminal

function inlineTmuxName(cwd) {
  const hash = crypto.createHash("md5").update(cwd).digest("hex").slice(0, 8);
  return `claudio-inline-${hash}`;
}

// Manifest file for persisting tmux session → original cwd mapping
function getInlineTmuxManifestPath() {
  return path.join(app.getPath("userData"), "inline-tmux-sessions.json");
}

function loadInlineTmuxManifest() {
  try {
    return JSON.parse(fs.readFileSync(getInlineTmuxManifestPath(), "utf-8"));
  } catch {
    return {};
  }
}

function saveInlineTmuxManifest(manifest) {
  fs.writeFileSync(getInlineTmuxManifestPath(), JSON.stringify(manifest, null, 2));
}

function addToInlineTmuxManifest(sessionName, cwd) {
  const manifest = loadInlineTmuxManifest();
  manifest[sessionName] = cwd;
  saveInlineTmuxManifest(manifest);
}

function removeFromInlineTmuxManifest(sessionName) {
  const manifest = loadInlineTmuxManifest();
  delete manifest[sessionName];
  saveInlineTmuxManifest(manifest);
}

// Recursively kill a process and all its descendants (depth-first)
function killProcessTree(pid) {
  try {
    const { execFileSync } = require("child_process");
    const stdout = execFileSync("pgrep", ["-P", String(pid)], { timeout: 3000, encoding: "utf-8" });
    const childPids = stdout.trim().split("\n").filter(Boolean);
    for (const cpid of childPids) {
      killProcessTree(Number(cpid));
    }
  } catch {
    // pgrep returns exit code 1 if no children found
  }
  try { process.kill(pid, "SIGTERM"); } catch {}
}

// Electron apps launched from Finder/dock get a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin).
// Load the user's full shell environment so child processes (tmux, claude, etc.) work correctly.
// This runs the login shell to capture all env vars from .zshrc/.zprofile/etc.
let shellEnvLoaded = false;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
try {
  const loginShell = process.env.SHELL || "/bin/zsh";
  // Use -ilc to load both .zprofile (PATH) and .zshrc (NVM, etc.)
  const envOutput = execFileSync(loginShell, ["-ilc", "env"], {
    timeout: 5000,
    encoding: "utf-8",
    env: { ...process.env },
    stdio: ["ignore", "pipe", "ignore"], // suppress stderr noise from shell init
  });
  for (const line of envOutput.split("\n")) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq);
    if (!ENV_KEY_RE.test(key)) continue; // skip malformed lines (e.g. shell motd)
    const value = line.slice(eq + 1);
    // Don't overwrite Electron-specific vars
    if (!key.startsWith("ELECTRON_") && key !== "_" && key !== "SHLVL" && key !== "PWD") {
      process.env[key] = value;
    }
  }
  shellEnvLoaded = true;
  console.log("[env] Loaded full shell environment from login shell");
} catch (err) {
  console.warn("[env] Failed to load shell environment:", err.message);
}
// Fallback: ensure essential tool paths are in PATH even if login shell failed
const EXTRA_PATHS = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/homebrew/sbin"];
if (process.env.PATH) {
  const existing = process.env.PATH.split(":");
  for (const p of EXTRA_PATHS) {
    if (!existing.includes(p)) existing.push(p);
  }
  process.env.PATH = existing.join(":");
} else {
  process.env.PATH = ["/usr/bin", "/bin", "/usr/sbin", "/sbin", ...EXTRA_PATHS].join(":");
}

// Ensure critical env vars are present even if shell env loading failed
if (!process.env.HOME) {
  process.env.HOME = require("os").homedir();
  console.warn(`[env] HOME was missing, set to ${process.env.HOME}`);
}
if (!process.env.USER) {
  try { process.env.USER = require("os").userInfo().username; } catch {}
}
if (!process.env.LANG) {
  process.env.LANG = "en_US.UTF-8";
}

// Snapshot the user's environment BEFORE Electron/Next.js add anything app-specific.
// This is what PTY terminals get — it should match the user's normal shell, not the app's.
const STRIP_FROM_TERMINAL_ENV = [
  "NODE_ENV", "PORT", "HOSTNAME", "TMUX_PATH",
  // Electron internals that shouldn't leak into user shells
  ...Object.keys(process.env).filter((k) => k.startsWith("ELECTRON_")),
];

function cleanEnvForTerminal() {
  const env = { ...process.env };
  for (const key of STRIP_FROM_TERMINAL_ENV) {
    delete env[key];
  }
  return env;
}

// Resolve tmux binary path once at startup for reliable execution
let tmuxPath = "tmux";
try {
  tmuxPath = execFileSync("which", ["tmux"], { timeout: 3000, encoding: "utf-8" }).trim() || "tmux";
  console.log(`[env] tmux found at: ${tmuxPath}`);
} catch {
  console.warn("[env] tmux not found in PATH — tmux features will be unavailable");
}
let mainWindow = null;
let isQuitting = false;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function getNextAppDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "next-app");
  }
  return path.join(__dirname, "..");
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

function checkServerReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startNextServer() {
  const appDir = getNextAppDir();

  if (app.isPackaged) {
    // Use Electron's bundled Node.js via utilityProcess — no system Node required
    const serverPath = path.join(appDir, "server.js");
    console.log(`Starting standalone server via utilityProcess: ${serverPath}`);

    // NOTE: If you add/change env vars here, also update SERVER_INTERNAL_ENV_VARS
    // in src/lib/terminal/adapters/shared.ts so they don't leak into user terminals.
    nextProcess = utilityProcess.fork(serverPath, [], {
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: "localhost",
        NODE_ENV: "production",
        TMUX_PATH: tmuxPath,
      },
      stdio: "pipe",
    });

    nextProcess.stdout?.on("data", (data) => {
      try {
        process.stdout.write(`[next] ${data}`);
      } catch {
        /* ignore EPIPE */
      }
    });

    nextProcess.stderr?.on("data", (data) => {
      try {
        process.stderr.write(`[next] ${data}`);
      } catch {
        /* ignore EPIPE */
      }
    });

    nextProcess.on("exit", (code) => {
      nextProcess = null;
      if (!isQuitting) {
        console.error(`Next.js server exited with code ${code}`);
      }
    });
  } else {
    const nextBin = path.join(appDir, "node_modules", ".bin", "next");
    nextProcess = spawn(nextBin, ["dev", "-p", String(PORT)], {
      cwd: appDir,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    nextProcess.stdout?.on("data", (data) => {
      try {
        process.stdout.write(`[next] ${data}`);
      } catch {
        /* ignore EPIPE */
      }
    });

    nextProcess.stderr?.on("data", (data) => {
      try {
        process.stderr.write(`[next] ${data}`);
      } catch {
        /* ignore EPIPE */
      }
    });

    nextProcess.on("error", (err) => {
      console.error("Failed to start Next.js server:", err.message);
    });

    nextProcess.on("close", (code) => {
      nextProcess = null;
      if (!isQuitting) {
        console.error(`Next.js server exited with code ${code}`);
      }
    });
  }
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const ready = await checkServerReady(PORT);
    if (ready) return true;
    // If the process died, don't keep waiting
    if (nextProcess === null) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

ipcMain.handle("dialog:pickFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select your code directory",
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true };
  }
  return { path: result.filePaths[0] };
});

// ── PTY IPC handlers ──

ipcMain.handle("pty:spawn", (_event, { cols, rows, cwd, tmuxSession, command, wrapInTmux }) => {
  if (!pty) throw new Error("node-pty is not available");
  const id = ++ptyIdCounter;
  console.log(`[pty:spawn] id=${id} wrapInTmux=${wrapInTmux} tmuxSession=${tmuxSession} command=${command ? command.slice(0, 50) : "none"}`);
  let shell, args;
  if (tmuxSession) {
    // Reattach to an existing named tmux session (external or recovered inline)
    // Verify the session still exists before trying to attach
    let sessionAlive = false;
    try {
      execFileSync(tmuxPath, ["has-session", "-t", tmuxSession], { timeout: 3000 });
      sessionAlive = true;
    } catch {
      console.warn(`[pty:spawn] tmux session "${tmuxSession}" no longer exists`);
    }
    if (sessionAlive) {
      shell = tmuxPath;
      args = ["attach-session", "-t", tmuxSession];
      ptyTmuxNames.set(id, tmuxSession);
    } else {
      // Session is gone — fall back to a plain shell so the terminal opens
      shell = process.env.SHELL || "/bin/zsh";
      args = [];
    }
  } else if (command && wrapInTmux) {
    // Inline terminal with tmux wrapping (terminalUseTmux is ON)
    // Step 1: Create the tmux session DETACHED so it's fully independent.
    // tmux runs the command in its default shell, so we just pass the full string.
    const sessionName = inlineTmuxName(cwd || process.env.HOME);
    const nvmInit = '. ~/.nvm/nvm.sh 2>/dev/null; ';
    const innerCmd = nvmInit + command;
    // Check if session already exists (e.g. recovery); if not, create it detached
    let sessionExists = false;
    try {
      execFileSync(tmuxPath, ["has-session", "-t", sessionName], { timeout: 3000 });
      sessionExists = true;
      console.log(`[pty:spawn] tmux session ${sessionName} already exists, attaching`);
    } catch {
      console.log(`[pty:spawn] tmux session ${sessionName} does not exist`);
    }
    let tmuxReady = sessionExists;
    if (!sessionExists) {
      try {
        console.log(`[pty:spawn] creating detached tmux session: ${sessionName}`);
        console.log(`[pty:spawn] cwd=${cwd} innerCmd=${innerCmd}`);
        console.log(`[pty:spawn] tmuxPath=${tmuxPath} PATH=${process.env.PATH}`);
        execFileSync(tmuxPath, [
          "new-session", "-d", "-s", sessionName,
          "-x", String(cols || 80), "-y", String(rows || 24),
          "-c", cwd || process.env.HOME,
          innerCmd,
        ], { timeout: 5000, encoding: "utf-8", env: cleanEnvForTerminal() });
        console.log(`[pty:spawn] tmux session created successfully`);
        tmuxReady = true;
      } catch (err) {
        console.error(`[pty:spawn] FAILED to create tmux session:`, err.message);
        console.error(`[pty:spawn] tmux exit status:`, err.status, `stderr:`, err.stderr?.toString());
        console.error(`[pty:spawn] PATH=${process.env.PATH} HOME=${process.env.HOME}`);
      }
    }
    if (tmuxReady) {
      // Step 2: Attach as a client via node-pty (this is the process we control)
      shell = tmuxPath;
      args = ["attach-session", "-t", sessionName];
      ptyTmuxNames.set(id, sessionName);
      addToInlineTmuxManifest(sessionName, cwd || process.env.HOME);
    } else {
      // Fallback: tmux failed, run command in a raw PTY so the terminal still works
      console.warn(`[pty:spawn] tmux unavailable, falling back to raw PTY for command`);
      shell = process.env.SHELL || "/bin/zsh";
      args = ["-c", nvmInit + command];
    }
  } else if (command) {
    // Raw PTY inline terminal (tmux setting OFF)
    shell = process.env.SHELL || "/bin/zsh";
    const nvmInit = '. ~/.nvm/nvm.sh 2>/dev/null; ';
    args = ["-c", nvmInit + command];
  } else {
    shell = process.env.SHELL || "/bin/zsh";
    args = [];
  }
  const ptyProc = pty.spawn(shell, args, {
    name: "xterm-256color",
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || process.env.HOME,
    env: cleanEnvForTerminal(),
  });
  ptyProcesses.set(id, ptyProc);
  ptyBuffers.set(id, "");
  ptyProc.onData((data) => {
    // Append to scrollback buffer (for reattach after route changes)
    let buf = (ptyBuffers.get(id) || "") + data;
    if (buf.length > PTY_BUFFER_LIMIT) buf = buf.slice(buf.length - PTY_BUFFER_LIMIT);
    ptyBuffers.set(id, buf);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("pty:data", id, data);
    }
  });
  ptyProc.onExit(({ exitCode, signal }) => {
    ptyProcesses.delete(id);
    ptyBuffers.delete(id);
    ptyTmuxNames.delete(id);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("pty:exit", id, { exitCode, signal });
    }
  });
  return { ptyId: id };
});

ipcMain.on("pty:write", (_event, { ptyId, data }) => {
  const proc = ptyProcesses.get(ptyId);
  if (proc) proc.write(data);
});

ipcMain.on("pty:resize", (_event, { ptyId, cols, rows }) => {
  const proc = ptyProcesses.get(ptyId);
  if (proc) proc.resize(cols, rows);
});

ipcMain.handle("pty:reattach", (_event, { ptyId }) => {
  const proc = ptyProcesses.get(ptyId);
  if (proc) {
    return { alive: true, buffer: ptyBuffers.get(ptyId) || "" };
  }
  return { alive: false, buffer: "" };
});

ipcMain.handle("pty:kill", async (_event, { ptyId, killTmuxSession }) => {
  const proc = ptyProcesses.get(ptyId);
  const tmuxName = ptyTmuxNames.get(ptyId);

  // Only kill the tmux session when explicitly requested (user clicked X).
  // React strict mode and other cleanup paths should only kill the client.
  if (tmuxName && killTmuxSession) {
    try { execFileSync(tmuxPath, ["kill-session", "-t", tmuxName], { timeout: 5000 }); } catch {}
    removeFromInlineTmuxManifest(tmuxName);
  }
  ptyTmuxNames.delete(ptyId);

  if (proc) {
    const rootPid = proc.pid;
    if (tmuxName) {
      // Tmux client: just kill the client, don't kill the process tree
      try { proc.kill(); } catch {}
    } else {
      killProcessTree(rootPid);
      proc.kill();
    }
    ptyProcesses.delete(ptyId);
    ptyBuffers.delete(ptyId);
    if (!tmuxName) {
      // Force-kill any survivors after a short delay (only for non-tmux)
      setTimeout(() => {
        try {
          process.kill(rootPid, 0); // throws if dead
          process.kill(rootPid, "SIGKILL");
        } catch {
          // Already dead — good
        }
      }, 1000);
    }
  }
});

ipcMain.handle("pty:listInlineTmux", async () => {
  try {
    const manifest = loadInlineTmuxManifest();
    const { stdout } = await execFileAsync(tmuxPath, [
      "list-sessions", "-F", "#{session_name}\t#{pane_dead}",
    ], { timeout: 5000 });
    const liveSessions = stdout.trim().split("\n").filter(Boolean)
      .map((line) => {
        const [name, dead] = line.split("\t");
        return { name, dead: dead === "1" };
      })
      .filter((s) => s.name.startsWith("claudio-inline-") && !s.dead);

    // Use manifest to get original cwd; skip sessions without a manifest entry
    const result = [];
    for (const s of liveSessions) {
      const cwd = manifest[s.name];
      if (cwd) result.push({ name: s.name, cwd });
    }
    // Clean up manifest entries for sessions that no longer exist
    const liveNames = new Set(liveSessions.map((s) => s.name));
    let cleaned = false;
    for (const key of Object.keys(manifest)) {
      if (!liveNames.has(key)) {
        delete manifest[key];
        cleaned = true;
      }
    }
    if (cleaned) saveInlineTmuxManifest(manifest);

    return result;
  } catch {
    return []; // tmux not running or no sessions
  }
});

function killAllPtys() {
  for (const [id, proc] of ptyProcesses) {
    const tmuxName = ptyTmuxNames.get(id);
    console.log(`[killAllPtys] id=${id} tmuxName=${tmuxName}`);
    if (tmuxName) {
      // Tmux-backed: detach the client cleanly so the session survives.
      // Using `tmux detach-client` is cleaner than killing the process,
      // which sends SIGHUP that can propagate to the session.
      try { execFileSync(tmuxPath, ["detach-client", "-s", tmuxName], { timeout: 3000 }); } catch {}
    } else {
      // Raw PTY: kill the entire process tree
      try { killProcessTree(proc.pid); } catch {}
      try { proc.kill(); } catch {}
    }
    ptyProcesses.delete(id);
  }
  ptyTmuxNames.clear();
}

function getWindowStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(getWindowStatePath(), "utf-8"));
  } catch {
    return null;
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;

  const isMaximized = win.isMaximized();
  const isFullScreen = win.isFullScreen();

  // Get the display the window is currently on
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);

  // Save normal (non-maximized) bounds so we can restore properly
  const normalBounds = win.getNormalBounds();

  const state = {
    x: normalBounds.x,
    y: normalBounds.y,
    width: normalBounds.width,
    height: normalBounds.height,
    isMaximized,
    isFullScreen,
    displayId: display.id,
    displayBounds: display.bounds,
  };

  fs.promises.writeFile(getWindowStatePath(), JSON.stringify(state, null, 2)).catch(() => {});
}

function findMatchingDisplay(savedState) {
  if (!savedState) return null;
  const displays = screen.getAllDisplays();

  // Try to find the exact display by ID
  const byId = displays.find((d) => d.id === savedState.displayId);
  if (byId) return byId;

  // Fall back: find a display at the same position (DisplayLink can reassign IDs)
  if (savedState.displayBounds) {
    const sb = savedState.displayBounds;
    const byBounds = displays.find(
      (d) => d.bounds.x === sb.x && d.bounds.y === sb.y && d.bounds.width === sb.width && d.bounds.height === sb.height,
    );
    if (byBounds) return byBounds;
  }

  return null;
}

function createWindow() {
  const savedState = loadWindowState();
  const targetDisplay = findMatchingDisplay(savedState);

  let windowOpts = { width: 1400, height: 900 };

  if (savedState && targetDisplay) {
    // Restore size, position on the correct display
    windowOpts = {
      x: savedState.x,
      y: savedState.y,
      width: savedState.width,
      height: savedState.height,
    };
  } else if (savedState) {
    // Display gone — use saved size, let OS pick position
    windowOpts = {
      width: savedState.width,
      height: savedState.height,
    };
  }

  mainWindow = new BrowserWindow({
    ...windowOpts,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#050508",
    icon: path.join(__dirname, "..", "public", "logo.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
    },
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once("ready-to-show", () => {
    // Restore maximized/fullscreen after the window is on the correct display
    if (savedState?.isFullScreen) {
      mainWindow.setFullScreen(true);
    } else if (savedState?.isMaximized && targetDisplay) {
      mainWindow.maximize();
    }
    mainWindow.show();

    // Start tracking state only after the window is fully shown
    // to avoid spurious saves during initial positioning
    let saveTimeout;
    const debouncedSave = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => saveWindowState(mainWindow), 1000);
    };

    mainWindow.on("resize", debouncedSave);
    mainWindow.on("move", debouncedSave);
    mainWindow.on("maximize", debouncedSave);
    mainWindow.on("unmaximize", debouncedSave);
    mainWindow.on("enter-full-screen", debouncedSave);
    mainWindow.on("leave-full-screen", debouncedSave);
    mainWindow.on("close", () => saveWindowState(mainWindow));
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    killAllPtys();
    mainWindow = null;
  });
}

app.on("ready", async () => {
  // Check if server is already running
  const alreadyRunning = await checkServerReady(PORT);

  if (!alreadyRunning) {
    await startNextServer();
    console.log("Waiting for Next.js server to be ready...");
    const ready = await waitForServer();
    if (!ready) {
      console.error("Next.js server failed to start. Quitting.");
      app.quit();
      return;
    }
    console.log("Next.js server is ready.");
  }

  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  killAllPtys();
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
