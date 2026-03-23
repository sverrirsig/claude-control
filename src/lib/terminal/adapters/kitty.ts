import { readdirSync } from "fs";
import { spawn } from "child_process";
import type { TerminalInfo } from "../types";
import type { TerminalAdapter, CreateSessionOpts } from "./types";
import { execFileAsync, OSASCRIPT_TIMEOUT_MS } from "./shared";
import { createGenericAdapter } from "./generic";

// ── kitten @ ls response types ──────────────────────────────────────────────
// Partial types for the JSON returned by `kitten @ ls`. Only the fields we
// need for PID-based window matching are included.

interface KittyLsWindow {
  id: number;
  pid: number;
  foreground_processes?: { pid: number }[];
}
interface KittyLsTab {
  windows: KittyLsWindow[];
}
interface KittyLsOsWindow {
  tabs: KittyLsTab[];
}

/** Short timeout for kitten @ — local socket should respond in <100ms. */
const KITTEN_TIMEOUT_MS = 2000;

/**
 * Directories to scan for kitty sockets. On macOS, os.tmpdir() returns a
 * per-user sandbox dir (/var/folders/...) but kitty puts its socket in /tmp.
 */
const SOCKET_SEARCH_DIRS = ["/tmp"];

/** Map internal keystroke names → kitty protocol key names. */
const KITTY_KEY_MAP: Record<string, string> = {
  return: "enter",
  escape: "escape",
  up: "up",
  down: "down",
  tab: "tab",
  space: "space",
};

const genericFallback = createGenericAdapter((command) => ({
  bin: "kitty",
  args: ["sh", "-c", command],
}));

// ── Caches ─────────────────────────────────────────────────────────────────
// Socket path rarely changes (only on kitty restart). Window list changes
// when tabs open/close but is stable within a single user action.

let cachedSocket: { path: string | null; expiry: number } = { path: null, expiry: 0 };
const SOCKET_CACHE_TTL_MS = 30_000;
const SOCKET_MISS_CACHE_TTL_MS = 2_000;

let cachedWindows: { data: { id: number; pid: number; fgPids: number[] }[] | null; expiry: number } = {
  data: null,
  expiry: 0,
};
const WINDOW_CACHE_TTL_MS = 500;

// ── Socket discovery ───────────────────────────────────────────────────────

/**
 * Find kitty's remote control socket. Returns the socket path or null.
 * Cached for 30s — the socket only changes when kitty restarts.
 */
function findKittySocket(): string | null {
  if (process.env.KITTY_LISTEN_ON) return process.env.KITTY_LISTEN_ON;

  const now = Date.now();
  if (now < cachedSocket.expiry) return cachedSocket.path;

  let result: string | null = null;
  for (const dir of SOCKET_SEARCH_DIRS) {
    try {
      const entries = readdirSync(dir);
      const socket = entries.find((e) => e.startsWith("kitty-"));
      if (socket) {
        result = `unix:${dir}/${socket}`;
        break;
      }
    } catch {
      // directory doesn't exist or not readable
    }
  }

  // Cache hits (socket found) for 30s; misses (no socket) for only 2s so
  // starting kitty doesn't require a long wait for the adapter to notice.
  cachedSocket = { path: result, expiry: now + (result ? SOCKET_CACHE_TTL_MS : SOCKET_MISS_CACHE_TTL_MS) };
  return result;
}

// ── Remote control ─────────────────────────────────────────────────────────

/**
 * Run a kitten @ command via the socket. Returns stdout on success, null on failure.
 */
async function kittenRemote(args: string[]): Promise<string | null> {
  const socket = findKittySocket();
  if (!socket) return null;

  try {
    const { stdout } = await execFileAsync("kitten", ["@", "--to", socket, ...args], {
      timeout: KITTEN_TIMEOUT_MS,
    });
    return stdout;
  } catch {
    // Socket stale (kitty restarted) — invalidate cache so next call rescans
    cachedSocket = { path: null, expiry: 0 };
    return null;
  }
}

// ── Window lookup ──────────────────────────────────────────────────────────

/**
 * Collect all kitty windows with their PIDs from `kitten @ ls`.
 * Cached for 500ms to avoid redundant subprocess calls during rapid interactions.
 */
async function listKittyWindows(): Promise<{ id: number; pid: number; fgPids: number[] }[] | null> {
  const now = Date.now();
  if (now < cachedWindows.expiry && cachedWindows.data !== null) return cachedWindows.data;

  const output = await kittenRemote(["ls"]);
  if (!output) return null;

  try {
    const windows: { id: number; pid: number; fgPids: number[] }[] = [];
    const osWindows: KittyLsOsWindow[] = JSON.parse(output);
    for (const osWin of osWindows) {
      for (const tab of osWin.tabs) {
        for (const win of tab.windows) {
          const fgPids = (win.foreground_processes ?? []).map((fg) => fg.pid);
          windows.push({ id: win.id, pid: win.pid, fgPids });
        }
      }
    }
    cachedWindows = { data: windows, expiry: now + WINDOW_CACHE_TTL_MS };
    return windows;
  } catch {
    return null;
  }
}

/**
 * Find the kitty window ID for a claude session.
 *
 * For direct kitty sessions: matches the claude PID in foreground_processes.
 * For tmux-in-kitty: the claude PID isn't visible to kitty (it's inside a
 * tmux pane). We use the tmux client PID from TerminalInfo instead.
 */
async function findKittyWindowId(info: TerminalInfo): Promise<number | null> {
  const windows = await listKittyWindows();
  if (!windows) return null;

  const searchPids = [info.pid];
  if (info.inTmux && info.tmux?.clientPid) {
    searchPids.push(info.tmux.clientPid);
  }

  for (const targetPid of searchPids) {
    for (const win of windows) {
      if (win.pid === targetPid) return win.id;
      if (win.fgPids.includes(targetPid)) return win.id;
    }
  }

  return null;
}

// ── Adapter ────────────────────────────────────────────────────────────────

export const kittyAdapter: TerminalAdapter = {
  async focus(info: TerminalInfo): Promise<void> {
    const windowId = await findKittyWindowId(info);
    // focus-window and open -a are independent — run in parallel
    await Promise.all([
      windowId !== null ? kittenRemote(["focus-window", "--match", `id:${windowId}`]) : Promise.resolve(null),
      execFileAsync("open", ["-a", "kitty"], { timeout: OSASCRIPT_TIMEOUT_MS }),
    ]);
  },

  async sendText(info: TerminalInfo, text: string): Promise<void> {
    const windowId = await findKittyWindowId(info);
    if (windowId !== null) {
      const ok = await kittenRemote(["send-text", "--match", `id:${windowId}`, `${text}\n`]);
      if (ok !== null) return;
    }
    await genericFallback.sendText(info, text);
  },

  async sendKeystroke(info: TerminalInfo, keystroke: string): Promise<void> {
    const windowId = await findKittyWindowId(info);

    if (windowId !== null) {
      const kittyKey = KITTY_KEY_MAP[keystroke];
      let ok: string | null;
      if (kittyKey) {
        ok = await kittenRemote(["send-key", "--match", `id:${windowId}`, kittyKey]);
      } else {
        ok = await kittenRemote(["send-text", "--match", `id:${windowId}`, keystroke]);
      }
      if (ok !== null) return;
    }
    await genericFallback.sendKeystroke(info, keystroke);
  },

  async createSession(command: string, opts: CreateSessionOpts): Promise<void> {
    const launchArgs = [
      "launch",
      `--type=${opts.openIn === "window" ? "os-window" : "tab"}`,
      `--cwd=${opts.cwd}`,
      "sh",
      "-c",
      command,
    ];
    const ok = await kittenRemote(launchArgs);
    if (ok === null) {
      // No running kitty instance — spawn a new one detached so we don't
      // kill it when execFileAsync's timeout fires (kitty stays open
      // as long as the window is alive, which is the desired behavior).
      const child = spawn("kitty", ["sh", "-c", command], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    }
  },
};
