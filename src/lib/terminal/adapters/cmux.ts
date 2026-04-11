import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

import type { TerminalInfo } from "../types";
import {
  escapeForAppleScript,
  execFileAsync,
  mapKeystrokeToSystemEvents,
  OSASCRIPT_TIMEOUT_MS,
  systemEventsScript,
} from "./shared";
import type { CreateSessionOpts, TerminalAdapter } from "./types";

const SESSION_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "cmux",
  "session-com.cmuxterm.app.json",
);

/**
 * Find the cmux terminal panel ID for a given TTY by reading cmux's session file.
 * The session JSON contains each panel's `ttyName` and `id` (UUID), which lets us
 * target the exact terminal via cmux's native AppleScript commands.
 */
async function findTerminalIdByTty(tty: string): Promise<string | null> {
  try {
    const raw = await readFile(SESSION_PATH, "utf-8");
    const session = JSON.parse(raw);
    const normalizedTty = tty.replace(/^\/dev\//, "");

    for (const window of session.windows ?? []) {
      for (const workspace of window.tabManager?.workspaces ?? []) {
        for (const panel of workspace.panels ?? []) {
          if (panel.ttyName === normalizedTty) {
            return panel.id;
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build an AppleScript snippet that finds a terminal by ID, selects its
 * containing workspace (tab), and then runs an action on the terminal.
 * This mirrors iTerm's pattern of iterating sessions to find a TTY match.
 */
function scriptForTerminal(terminalId: string, action: string): string {
  const safeId = escapeForAppleScript(terminalId);
  return `tell application "cmux"
  set targetId to "${safeId}"
  repeat with w in every window
    repeat with tb in every tab of w
      repeat with t in every terminal of tb
        if id of t is targetId then
          select tab tb
          delay 0.15
          ${action}
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;
}

export const cmuxAdapter: TerminalAdapter = {
  async focus(info: TerminalInfo): Promise<void> {
    const terminalId = await findTerminalIdByTty(info.tty);
    if (terminalId) {
      const script = scriptForTerminal(terminalId, "focus t");
      await execFileAsync("osascript", ["-e", script], {
        timeout: OSASCRIPT_TIMEOUT_MS,
      });
    } else {
      await execFileAsync(
        "osascript",
        ["-e", 'tell application "cmux" to activate'],
        {
          timeout: OSASCRIPT_TIMEOUT_MS,
        },
      );
    }
  },

  async sendText(info: TerminalInfo, text: string): Promise<void> {
    const terminalId = await findTerminalIdByTty(info.tty);
    const asEscaped = escapeForAppleScript(text + "\n");
    if (terminalId) {
      const script = scriptForTerminal(
        terminalId,
        `input text "${asEscaped}" to t`,
      );
      await execFileAsync("osascript", ["-e", script], {
        timeout: OSASCRIPT_TIMEOUT_MS,
      });
    } else {
      const action = systemEventsScript("cmux", `keystroke "${asEscaped}"`);
      await execFileAsync("osascript", ["-e", action], {
        timeout: OSASCRIPT_TIMEOUT_MS,
      });
    }
  },

  async sendKeystroke(info: TerminalInfo, keystroke: string): Promise<void> {
    const terminalId = await findTerminalIdByTty(info.tty);
    const asKeystroke = mapKeystrokeToSystemEvents(keystroke);
    if (terminalId) {
      // Focus the correct terminal first, then send the keystroke via System Events
      const script = scriptForTerminal(
        terminalId,
        `focus t
        delay 0.1
tell application "System Events"
  tell process "cmux"
    ${asKeystroke}
  end tell
end tell`,
      );
      await execFileAsync("osascript", ["-e", script], {
        timeout: OSASCRIPT_TIMEOUT_MS,
      });
    } else {
      const script = `tell application "cmux" to activate
tell application "System Events"
  tell process "cmux"
    ${asKeystroke}
  end tell
end tell`;
      await execFileAsync("osascript", ["-e", script], {
        timeout: OSASCRIPT_TIMEOUT_MS,
      });
    }
  },

  async createSession(
    command: string,
    _opts: CreateSessionOpts,
  ): Promise<void> {
    const asCmd = escapeForAppleScript(command + "\n");
    const script = `tell application "cmux"
  set newWs to new tab
  select tab newWs
  delay 0.15
  set t to focused terminal of newWs
  focus t
  input text "${asCmd}" to t
end tell`;
    await execFileAsync("osascript", ["-e", script], {
      timeout: OSASCRIPT_TIMEOUT_MS,
    });
  },
};
