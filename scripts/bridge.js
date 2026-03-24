#!/usr/bin/env node
/**
 * Claude Control bridge
 *
 * Run this natively on macOS alongside a containerized claude-control instance.
 * It does two things:
 *
 * 1. Process discovery (always on when bridge is running):
 *    Polls `ps` and `lsof` for running Claude Code processes, then writes
 *    ~/.claude-control/processes.json — a path mounted into the container —
 *    so the container can discover sessions without host PID namespace access.
 *
 * 2. Action proxy (when actionBridge.enabled = true in config):
 *    Listens on actionBridge.port (default 27184) for HTTP POST /action
 *    requests from the container and executes the corresponding macOS desktop
 *    operations (open Finder, focus terminal, launch editor, etc.).
 *
 * Configuration (all optional, read from ~/.claude-control/config.json):
 *   processBridge.enabled    — must be true for process discovery output (default: false)
 *   processBridge.intervalMs — poll frequency in ms (default: 1000)
 *   actionBridge.enabled     — enable the action HTTP server (default: false)
 *   actionBridge.port        — port the action server listens on (default: 27184)
 *
 * Usage:
 *   npm run bridge          (foreground)
 *   npm run bridge:start    (background daemon via bridge-ctl.sh)
 */

const { execFile, exec } = require("child_process");
const { promisify } = require("util");
const { readFile, writeFile, mkdir } = require("fs/promises");
const { createServer } = require("http");
const { join } = require("path");
const { homedir } = require("os");

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const CONFIG_DIR = join(homedir(), ".claude-control");
const PROCESSES_FILE = join(CONFIG_DIR, "processes.json");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const PROCESS_TIMEOUT_MS = 5000;
const ACTION_TIMEOUT_MS = 10000;
const DEFAULT_PROCESS_INTERVAL_MS = 1000;
const DEFAULT_ACTION_PORT = 27184;

// ─── Config ──────────────────────────────────────────────────────────────────

async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ─── Process discovery ────────────────────────────────────────────────────────

async function findClaudePids() {
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-eo", "pid,ppid,%cpu,comm"],
      { timeout: PROCESS_TIMEOUT_MS }
    );
    const pids = [];
    for (const line of stdout.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.,]+)\s+(.+)$/);
      if (match && match[4].trim() === "claude") {
        pids.push({
          pid: parseInt(match[1], 10),
          cpuPercent: parseFloat(match[3].replace(",", ".")) || 0,
        });
      }
    }
    return pids;
  } catch {
    return [];
  }
}

async function getCwds(pids) {
  if (pids.length === 0) return new Map();
  try {
    const pidList = pids.map((p) => p.pid).join(",");
    const { stdout } = await execFileAsync(
      "lsof",
      ["-p", pidList, "-Fpn", "-d", "cwd"],
      { timeout: PROCESS_TIMEOUT_MS }
    );
    const cwds = new Map();
    let currentPid = null;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("p")) {
        currentPid = parseInt(line.slice(1), 10);
      } else if (line.startsWith("n") && currentPid !== null) {
        cwds.set(currentPid, line.slice(1));
        currentPid = null;
      }
    }
    return cwds;
  } catch {
    return new Map();
  }
}

async function pollProcesses(processBridgeConfig) {
  if (processBridgeConfig.enabled === false) return;
  const pids = await findClaudePids();
  const cwds = await getCwds(pids);
  const processes = pids
    .map(({ pid, cpuPercent }) => ({ pid, cwd: cwds.get(pid) ?? null, cpuPercent }))
    .filter((p) => p.cwd !== null);
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(PROCESSES_FILE, JSON.stringify({ timestamp: Date.now(), processes }));
}

// ─── Terminal detection ───────────────────────────────────────────────────────

function normalizeTty(tty) {
  return tty.startsWith("/dev/") ? tty : `/dev/${tty}`;
}

const KNOWN_TERMINALS = {
  iterm2: { app: "iterm", appName: "iTerm2", processName: "iTerm2" },
  terminal: { app: "terminal-app", appName: "Terminal", processName: "Terminal" },
  ghostty: { app: "ghostty", appName: "Ghostty", processName: "ghostty" },
  kitty: { app: "kitty", appName: "kitty", processName: "kitty" },
  "wezterm-gui": { app: "wezterm", appName: "WezTerm", processName: "wezterm-gui" },
  wezterm: { app: "wezterm", appName: "WezTerm", processName: "WezTerm" },
  alacritty: { app: "alacritty", appName: "Alacritty", processName: "alacritty" },
};

function matchTerminal(comm) {
  const basename = comm.includes("/") ? comm.split("/").pop() : comm;
  const lower = basename.toLowerCase();
  if (KNOWN_TERMINALS[lower]) return KNOWN_TERMINALS[lower];
  for (const [key, value] of Object.entries(KNOWN_TERMINALS)) {
    if (lower.startsWith(key) || lower.includes(key)) return value;
  }
  const lowerComm = comm.toLowerCase();
  if (lowerComm.includes("iterm")) return KNOWN_TERMINALS["iterm2"];
  if (lowerComm.includes("ghostty")) return KNOWN_TERMINALS["ghostty"];
  if (lowerComm.includes("kitty")) return KNOWN_TERMINALS["kitty"];
  if (lowerComm.includes("wezterm")) return KNOWN_TERMINALS["wezterm-gui"] || KNOWN_TERMINALS["wezterm"];
  if (lowerComm.includes("alacritty")) return KNOWN_TERMINALS["alacritty"];
  return null;
}

async function buildProcessTree() {
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid,ppid,%cpu,comm"], { timeout: PROCESS_TIMEOUT_MS });
    const tree = new Map();
    for (const line of stdout.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.,]+)\s+(.+)$/);
      if (match) {
        tree.set(parseInt(match[1], 10), { ppid: parseInt(match[2], 10), comm: match[4].trim() });
      }
    }
    return tree;
  } catch {
    return new Map();
  }
}

function findTerminalInTree(startPid, processTree) {
  let currentPid = startPid;
  const visited = new Set();
  while (currentPid > 1 && !visited.has(currentPid)) {
    visited.add(currentPid);
    const entry = processTree.get(currentPid);
    if (!entry) break;
    const matched = matchTerminal(entry.comm);
    if (matched) return matched;
    currentPid = entry.ppid;
  }
  return null;
}

async function getTtyForPid(pid) {
  const { stdout } = await execFileAsync("ps", ["-o", "tty=", "-p", String(pid)], { timeout: PROCESS_TIMEOUT_MS });
  const tty = stdout.trim();
  if (!tty || tty === "?" || tty === "??") throw new Error(`No TTY for PID ${pid}`);
  return normalizeTty(tty);
}

async function detectAllTmuxPanes() {
  try {
    const { stdout } = await execFileAsync(
      "tmux",
      ["list-panes", "-a", "-F", "#{pane_tty}\t#{pane_id}\t#{session_name}\t#{window_index}\t#{pane_index}"],
      { timeout: 5000 }
    );
    const panes = new Map();
    for (const line of stdout.split("\n")) {
      const parts = line.trim().split("\t");
      if (parts.length < 5) continue;
      const [rawTty, paneId, sessionName, winIdx, paneIdx] = parts;
      const tty = normalizeTty(rawTty);
      panes.set(tty, {
        tty, paneId, sessionName,
        windowIndex: parseInt(winIdx, 10),
        paneIndex: parseInt(paneIdx, 10),
        target: `${sessionName}:${winIdx}.${paneIdx}`,
      });
    }
    return panes;
  } catch {
    return new Map();
  }
}

async function detectTmuxClients() {
  try {
    const { stdout } = await execFileAsync(
      "tmux",
      ["list-clients", "-F", "#{client_tty}\t#{client_pid}\t#{client_session}"],
      { timeout: 5000 }
    );
    const clients = [];
    for (const line of stdout.split("\n")) {
      const parts = line.trim().split("\t");
      if (parts.length < 3) continue;
      const pid = parseInt(parts[1], 10);
      if (!isNaN(pid)) clients.push({ tty: normalizeTty(parts[0]), pid, sessionName: parts[2] });
    }
    return clients;
  } catch {
    return [];
  }
}

async function detectTerminal(pid) {
  const [tree, panes] = await Promise.all([buildProcessTree(), detectAllTmuxPanes()]);
  const tty = await getTtyForPid(pid);
  const paneInfo = panes.get(tty);
  const inTmux = paneInfo !== undefined;

  let termApp = null;
  let tmuxInfo;

  if (inTmux && paneInfo) {
    const clients = await detectTmuxClients();
    const sessionClient = clients.find((c) => c.sessionName === paneInfo.sessionName);
    tmuxInfo = {
      paneId: paneInfo.paneId,
      sessionName: paneInfo.sessionName,
      windowIndex: paneInfo.windowIndex,
      clientTty: sessionClient ? sessionClient.tty : "",
    };
    termApp = sessionClient && sessionClient.pid > 0
      ? findTerminalInTree(sessionClient.pid, tree)
      : null;
  } else {
    termApp = findTerminalInTree(pid, tree);
  }

  return {
    app: termApp ? termApp.app : "unknown",
    appName: termApp ? termApp.appName : "Unknown",
    processName: termApp ? termApp.processName : "unknown",
    inTmux,
    tty,
    tmux: tmuxInfo,
  };
}

// ─── AppleScript helpers ──────────────────────────────────────────────────────

function escapeAS(text) {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function iTermFocusScript(tty) {
  return `tell application "iTerm"
  activate
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${escapeAS(tty)}" then
          select aWindow
          select aTab
          select aSession
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;
}

function terminalFocusScript(tty) {
  return `tell application "Terminal"
  activate
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      if tty of aTab is "${escapeAS(tty)}" then
        set selected tab of aWindow to aTab
        set index of aWindow to 1
        return
      end if
    end repeat
  end repeat
end tell`;
}

async function runScript(script) {
  await execFileAsync("osascript", ["-e", script], { timeout: ACTION_TIMEOUT_MS });
}

// ─── Desktop actions ──────────────────────────────────────────────────────────

async function actionFocus(pid) {
  const info = await detectTerminal(pid);

  if (info.inTmux && info.tmux) {
    await execFileAsync("tmux", ["select-window", "-t", `${info.tmux.sessionName}:${info.tmux.windowIndex}`], { timeout: PROCESS_TIMEOUT_MS });
    await execFileAsync("tmux", ["select-pane", "-t", info.tmux.paneId], { timeout: PROCESS_TIMEOUT_MS });
  }

  const tty = info.inTmux && info.tmux && info.tmux.clientTty ? info.tmux.clientTty : info.tty;

  if (info.app === "iterm") {
    await runScript(iTermFocusScript(tty));
  } else if (info.app === "terminal-app") {
    await runScript(terminalFocusScript(tty));
  } else if (info.appName && info.appName !== "Unknown") {
    await execFileAsync("open", ["-a", info.appName], { timeout: ACTION_TIMEOUT_MS });
  } else {
    throw new Error("Cannot focus unknown terminal");
  }
}

async function actionSendMessage(pid, message) {
  const info = await detectTerminal(pid);

  if (info.inTmux && info.tmux) {
    await execFileAsync("tmux", ["send-keys", "-t", info.tmux.paneId, message, "Enter"], { timeout: PROCESS_TIMEOUT_MS });
    return;
  }

  const escaped = escapeAS(message);

  if (info.app === "iterm") {
    await runScript(`tell application "iTerm"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${escapeAS(info.tty)}" then
          tell aSession
            write text "${escaped}"
          end tell
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`);
  } else {
    const focusScript = info.app === "terminal-app"
      ? terminalFocusScript(info.tty)
      : `tell application "${info.appName}" to activate`;
    const procName = info.app === "terminal-app" ? "Terminal" : info.processName;
    await runScript(`${focusScript}
delay 0.2
tell application "System Events"
  tell process "${procName}"
    keystroke "${escaped}"
    keystroke return
  end tell
end tell`);
  }
}

async function actionSendKeystroke(pid, keystroke) {
  const info = await detectTerminal(pid);

  if (info.inTmux && info.tmux) {
    const tmuxKeyMap = { return: "Enter", escape: "Escape", up: "Up", down: "Down", tab: "Tab", space: "Space" };
    await execFileAsync("tmux", ["send-keys", "-t", info.tmux.paneId, tmuxKeyMap[keystroke] || keystroke], { timeout: PROCESS_TIMEOUT_MS });
    return;
  }

  const asKeystroke = { return: "keystroke return", escape: "key code 53", up: "key code 126", down: "key code 125", tab: "key code 48", space: `keystroke " "` }[keystroke]
    || `keystroke "${keystroke}"`;

  let focusScript, procName;
  if (info.app === "iterm") {
    focusScript = iTermFocusScript(info.tty);
    procName = "iTerm2";
  } else if (info.app === "terminal-app") {
    focusScript = terminalFocusScript(info.tty);
    procName = "Terminal";
  } else {
    focusScript = `tell application "${info.appName}" to activate`;
    procName = info.processName;
  }

  await runScript(`${focusScript}
delay 0.2
tell application "System Events"
  tell process "${procName}"
    ${asKeystroke}
  end tell
end tell`);
}

async function moveAppToScreen(appName, screenIndex) {
  const script = `use framework "AppKit"
set screens to current application's NSScreen's screens()
set screenCount to count of screens
if ${screenIndex} >= screenCount then return "no screen"
set targetScreen to item (${screenIndex} + 1) of screens
set f to targetScreen's frame()
set sx to item 1 of item 1 of f as integer
set sy to item 2 of item 1 of f as integer
set sw to item 1 of item 2 of f as integer
set sh to item 2 of item 2 of f as integer
set pf to (item 1 of screens)'s frame()
set primaryHeight to item 2 of item 2 of pf as integer
set asY to primaryHeight - sy - sh
tell application "${appName}"
  if (count of windows) > 0 then
    set bounds of front window to {sx + 50, asY + 50, sx + sw - 50, asY + sh - 50}
  end if
end tell
return "ok"`;
  try {
    await execAsync(`osascript -l AppleScript -e '${script.replace(/'/g, "'\"'\"'")}'`, { timeout: 5000 });
  } catch {
    // best-effort screen placement
  }
}

const EDITOR_COMMANDS = {
  vscode: { command: "code", processName: "Code" },
  cursor: { command: "cursor", processName: "Cursor" },
  zed: { command: "zed", processName: "Zed" },
  sublime: { command: "subl", processName: "Sublime Text" },
  webstorm: { command: "webstorm", processName: "WebStorm" },
  intellij: { command: "idea", processName: "IntelliJ IDEA" },
};

const GIT_GUI_APPS = {
  fork: "Fork",
  "sublime-merge": "Sublime Merge",
  gitkraken: "GitKraken",
  tower: "Tower",
  sourcetree: "Sourcetree",
};

const BROWSER_APPS = {
  safari: "Safari",
  chrome: "Google Chrome",
  arc: "Arc",
  firefox: "Firefox",
  brave: "Brave Browser",
  edge: "Microsoft Edge",
};

const CHROMIUM_BROWSERS = new Set(["Google Chrome", "Arc", "Brave Browser", "Microsoft Edge"]);

async function handleAction(action, body, config) {
  const { path, pid, targetScreen, message, url, keystroke } = body;

  switch (action) {
    case "focus":
      if (!pid) throw new Error("Missing pid");
      await actionFocus(pid);
      break;

    case "finder":
      if (!path) throw new Error("Missing path");
      await execFileAsync("open", [path], { timeout: ACTION_TIMEOUT_MS });
      if (targetScreen !== undefined) {
        await new Promise((r) => setTimeout(r, 500));
        await moveAppToScreen("Finder", targetScreen);
      }
      break;

    case "editor": {
      if (!path) throw new Error("Missing path");
      const editorDef = EDITOR_COMMANDS[config.editor];
      if (!editorDef) throw new Error("No editor configured");
      await execFileAsync(editorDef.command, [path], { timeout: ACTION_TIMEOUT_MS });
      if (targetScreen !== undefined) {
        await new Promise((r) => setTimeout(r, 800));
        await moveAppToScreen(editorDef.processName, targetScreen);
      }
      break;
    }

    case "git-gui": {
      if (!path) throw new Error("Missing path");
      const appName = GIT_GUI_APPS[config.gitGui];
      if (!appName) throw new Error("No git GUI configured");
      await execFileAsync("open", ["-a", appName, path], { timeout: ACTION_TIMEOUT_MS });
      if (targetScreen !== undefined) {
        await new Promise((r) => setTimeout(r, 800));
        await moveAppToScreen(appName, targetScreen);
      }
      break;
    }

    case "open-url": {
      if (!url) throw new Error("Missing url");
      const browserName = BROWSER_APPS[config.browser] || "Safari";
      if (CHROMIUM_BROWSERS.has(browserName)) {
        const escapedUrl = url.replace(/"/g, '\\"');
        const script = `tell application "${browserName}"
  set found to false
  repeat with aWindow in windows
    set tabIndex to 0
    repeat with aTab in tabs of aWindow
      set tabIndex to tabIndex + 1
      if URL of aTab starts with "${escapedUrl}" then
        set active tab index of aWindow to tabIndex
        set index of aWindow to 1
        activate
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat
  if not found then
    activate
    open location "${escapedUrl}"
  end if
end tell`;
        try {
          await runScript(script);
        } catch {
          await execFileAsync("open", ["-a", browserName, url]);
        }
      } else {
        await execFileAsync("open", ["-a", browserName, url]);
      }
      break;
    }

    case "send-message":
      if (!pid) throw new Error("Missing pid");
      if (!message) throw new Error("Missing message");
      await actionSendMessage(pid, message);
      break;

    case "send-keystroke":
      if (!pid) throw new Error("Missing pid");
      if (!keystroke) throw new Error("Missing keystroke");
      await actionSendKeystroke(pid, keystroke);
      break;

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ─── Action HTTP server ───────────────────────────────────────────────────────

function startActionServer(port) {
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== "POST" || req.url !== "/action") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    let rawBody = "";
    for await (const chunk of req) rawBody += chunk;

    try {
      const body = JSON.parse(rawBody);
      const { action } = body;
      if (!action) throw new Error("Missing action");

      const config = await loadConfig();
      await handleAction(action, body, config);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error(`[action-bridge] ${err.message}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[action-bridge] Listening on port ${port}`);
  });

  return server;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const config = await loadConfig();
  const processBridgeConfig = config.processBridge ?? {};
  const actionBridgeConfig = config.actionBridge ?? {};

  const processEnabled = processBridgeConfig.enabled !== false;
  const actionEnabled = actionBridgeConfig.enabled === true;

  if (!processEnabled && !actionEnabled) {
    console.error(
      "Both process bridge and action bridge are disabled.\n" +
      "Set processBridge.enabled = true and/or actionBridge.enabled = true in ~/.claude-control/config.json'}"
    );
    process.exit(1);
  }

  if (processEnabled) {
    const intervalMs = processBridgeConfig.intervalMs ?? DEFAULT_PROCESS_INTERVAL_MS;
    console.log(`[process-bridge] Running (interval: ${intervalMs}ms) → ${PROCESSES_FILE}`);
    await pollProcesses(processBridgeConfig).catch(console.error);
    setInterval(() => pollProcesses(processBridgeConfig).catch(console.error), intervalMs);
  }

  if (actionEnabled) {
    const port = actionBridgeConfig.port ?? DEFAULT_ACTION_PORT;
    startActionServer(port);
  }
}

main().catch((err) => {
  console.error("Bridge error:", err);
  process.exit(1);
});
