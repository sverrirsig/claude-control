import { spawn } from "child_process";
import { accessSync, constants } from "fs";
import { APPLESCRIPT_FOCUS_DELAY_S } from "../../constants";
import type { TerminalInfo } from "../types";
import {
  execFileAsync,
  genericActivateScript,
  mapKeystrokeToSystemEvents,
  OSASCRIPT_TIMEOUT_MS,
  systemEventsScript,
  withFocusDelay,
} from "./shared";
import type { CreateSessionOpts, TerminalAdapter } from "./types";

const CLI_TIMEOUT_MS = 5000;

/** App-bundle path used when `wezterm` is not on PATH. */
const BUNDLED_CLI = "/Applications/WezTerm.app/Contents/MacOS/wezterm";

interface WeztermPane {
  pane_id: number;
  tab_id: number;
  window_id: number;
  tty_name: string;
}

/**
 * Resolve the wezterm binary — prefer PATH, fall back to app bundle.
 * Result is cached after first successful lookup.
 */
let resolvedBin: string | undefined;
function resolveWeztermBin(): string {
  if (resolvedBin) return resolvedBin;

  // Check if `wezterm` is on PATH by looking for it in common locations
  const pathDirs = (process.env.PATH ?? "").split(":");
  for (const dir of pathDirs) {
    const candidate = `${dir}/wezterm`;
    try {
      accessSync(candidate, constants.X_OK);
      resolvedBin = candidate;
      return resolvedBin;
    } catch {
      // not found in this dir
    }
  }

  // Fall back to app bundle
  try {
    accessSync(BUNDLED_CLI, constants.X_OK);
    resolvedBin = BUNDLED_CLI;
    return resolvedBin;
  } catch {
    // Last resort — hope it's on PATH at runtime
    resolvedBin = "wezterm";
    return resolvedBin;
  }
}

/**
 * Find the WezTerm pane that owns a given TTY.
 */
async function findPaneByTty(tty: string): Promise<WeztermPane | null> {
  try {
    const bin = resolveWeztermBin();
    const { stdout } = await execFileAsync(bin, ["cli", "list", "--format", "json"], {
      timeout: CLI_TIMEOUT_MS,
    });
    const panes: WeztermPane[] = JSON.parse(stdout);
    return panes.find((p) => p.tty_name === tty) ?? null;
  } catch {
    return null;
  }
}

export const weztermAdapter: TerminalAdapter = {
  async focus(info: TerminalInfo): Promise<void> {
    const pane = await findPaneByTty(info.tty);
    if (pane) {
      const bin = resolveWeztermBin();
      await execFileAsync(bin, ["cli", "activate-pane", "--pane-id", String(pane.pane_id)], {
        timeout: CLI_TIMEOUT_MS,
      });
      // Also bring the WezTerm window to the front
      await execFileAsync("open", ["-a", "WezTerm"], { timeout: OSASCRIPT_TIMEOUT_MS });
      return;
    }
    // Fallback: just activate the app
    await execFileAsync("open", ["-a", "WezTerm"], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async sendText(info: TerminalInfo, text: string): Promise<void> {
    const pane = await findPaneByTty(info.tty);
    if (pane) {
      const bin = resolveWeztermBin();
      await execFileAsync(bin, ["cli", "send-text", "--pane-id", String(pane.pane_id), "--no-paste", `${text}\n`], {
        timeout: CLI_TIMEOUT_MS,
      });
      return;
    }
    // Fallback: focus + System Events keystroke
    const action = systemEventsScript("WezTerm", `keystroke "${text}"\n    keystroke return`);
    const script = withFocusDelay(genericActivateScript("WezTerm"), action, APPLESCRIPT_FOCUS_DELAY_S);
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async sendKeystroke(info: TerminalInfo, keystroke: string): Promise<void> {
    // WezTerm CLI send-text can handle simple keys
    const pane = await findPaneByTty(info.tty);
    if (pane) {
      const keyMap: Record<string, string> = {
        return: "\r",
        escape: "\x1b",
        tab: "\t",
        space: " ",
        up: "\x1b[A",
        down: "\x1b[B",
      };
      const mapped = keyMap[keystroke];
      if (mapped) {
        const bin = resolveWeztermBin();
        await execFileAsync(bin, ["cli", "send-text", "--pane-id", String(pane.pane_id), "--no-paste", mapped], {
          timeout: CLI_TIMEOUT_MS,
        });
        return;
      }
    }
    // Fallback: System Events
    const asKeystroke = mapKeystrokeToSystemEvents(keystroke);
    const action = systemEventsScript("WezTerm", asKeystroke);
    const script = withFocusDelay(genericActivateScript("WezTerm"), action, APPLESCRIPT_FOCUS_DELAY_S);
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async createSession(command: string, opts: CreateSessionOpts): Promise<void> {
    const bin = resolveWeztermBin();
    if (opts.openIn === "tab") {
      try {
        // New tab in existing window: use `wezterm cli spawn`
        await execFileAsync(bin, ["cli", "spawn", "--", "sh", "-c", command], {
          timeout: OSASCRIPT_TIMEOUT_MS,
        });
        return;
      } catch {
        // WezTerm not running — fall through to `wezterm start`
      }
    }
    // `wezterm start` blocks until the shell exits — spawn detached so we don't block the API
    const child = spawn(bin, ["start", "--", "sh", "-c", command], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    // Poll until WezTerm is ready (cli responds), then bring it to front
    const maxWaitMs = 10000;
    const intervalMs = 300;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        await execFileAsync(bin, ["cli", "list"], { timeout: 2000 });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    await execFileAsync("open", ["-a", "WezTerm"], { timeout: OSASCRIPT_TIMEOUT_MS });
  },
};
