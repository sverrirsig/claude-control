const { app, BrowserWindow, screen, shell, utilityProcess, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
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
// Augment it so child processes can find tools like `gh` installed via Homebrew or other managers.
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

    nextProcess = utilityProcess.fork(serverPath, [], {
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: "localhost",
        NODE_ENV: "production",
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

ipcMain.handle("pty:spawn", (_event, { cols, rows, cwd, tmuxSession, command }) => {
  if (!pty) throw new Error("node-pty is not available");
  const id = ++ptyIdCounter;
  let shell, args;
  if (tmuxSession) {
    shell = "tmux";
    args = ["attach-session", "-t", tmuxSession];
  } else if (command) {
    shell = process.env.SHELL || "/bin/zsh";
    args = ["-c", command];
  } else {
    shell = process.env.SHELL || "/bin/zsh";
    args = [];
  }
  const ptyProc = pty.spawn(shell, args, {
    name: "xterm-256color",
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || process.env.HOME,
    env: { ...process.env },
  });
  ptyProcesses.set(id, ptyProc);
  ptyProc.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("pty:data", id, data);
    }
  });
  ptyProc.onExit(({ exitCode, signal }) => {
    ptyProcesses.delete(id);
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

ipcMain.handle("pty:kill", async (_event, { ptyId }) => {
  const proc = ptyProcesses.get(ptyId);
  if (proc) {
    const rootPid = proc.pid;
    killProcessTree(rootPid);
    proc.kill();
    ptyProcesses.delete(ptyId);
    // Force-kill any survivors after a short delay
    setTimeout(() => {
      try {
        process.kill(rootPid, 0); // throws if dead
        process.kill(rootPid, "SIGKILL");
      } catch {
        // Already dead — good
      }
    }, 1000);
  }
});

function killAllPtys() {
  for (const [id, proc] of ptyProcesses) {
    try { killProcessTree(proc.pid); } catch {}
    try { proc.kill(); } catch {}
    ptyProcesses.delete(id);
  }
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
