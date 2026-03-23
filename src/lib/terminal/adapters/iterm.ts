import type { TerminalInfo } from "../types";
import type { TerminalAdapter, CreateSessionOpts } from "./types";
import {
  execFileAsync,
  OSASCRIPT_TIMEOUT_MS,
  escapeForAppleScript,
  mapKeystrokeToSystemEvents,
  systemEventsScript,
  withFocusDelay,
} from "./shared";
import { APPLESCRIPT_FOCUS_DELAY_S } from "../../constants";

function focusScript(ttyPath: string): string {
  const safeTty = escapeForAppleScript(ttyPath);
  // Uses a flag variable instead of `return` to break out of nested loops.
  // In AppleScript, `return` exits the entire script — when this focus script
  // is composed with an action via withFocusDelay(), `return` would prevent
  // the action (keystroke, text) from ever executing.
  return `tell application "iTerm"
  activate
  set found to false
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${safeTty}" then
          select aWindow
          select aTab
          select aSession
          set found to true
          exit repeat
        end if
      end repeat
      if found then exit repeat
    end repeat
    if found then exit repeat
  end repeat
end tell`;
}

export const itermAdapter: TerminalAdapter = {
  async focus(info: TerminalInfo): Promise<void> {
    await execFileAsync("osascript", ["-e", focusScript(info.tty)], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async sendText(info: TerminalInfo, text: string): Promise<void> {
    const safeTty = escapeForAppleScript(info.tty);
    const asEscaped = escapeForAppleScript(text);
    const script = `tell application "iTerm"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${safeTty}" then
          tell aSession
            write text "${asEscaped}"
          end tell
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async sendKeystroke(info: TerminalInfo, keystroke: string): Promise<void> {
    // iTerm can use `write text` for simple keys without needing focus
    const writeMap: Record<string, string> = {
      return: `write text ""`,
      escape: `write text (ASCII character 27) newline NO`,
      y: `write text "y"`,
      n: `write text "n"`,
    };

    const writeCmd = writeMap[keystroke];
    if (writeCmd) {
      const safeTty = escapeForAppleScript(info.tty);
      const script = `tell application "iTerm"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${safeTty}" then
          tell aSession
            ${writeCmd}
          end tell
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;
      await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
      return;
    }

    // Arrow keys and others: focus + System Events
    const asKeystroke = mapKeystrokeToSystemEvents(keystroke);
    const action = systemEventsScript("iTerm2", asKeystroke);
    const script = withFocusDelay(focusScript(info.tty), action, APPLESCRIPT_FOCUS_DELAY_S);
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async createSession(command: string, opts: CreateSessionOpts): Promise<void> {
    const asCmd = escapeForAppleScript(command);
    const script =
      opts.openIn === "tab"
        ? `tell application "iTerm"
  activate
  tell current window
    set newTab to (create tab with default profile)
    tell current session of newTab
      write text "${asCmd}"
    end tell
  end tell
end tell`
        : `tell application "iTerm"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    write text "${asCmd}"
  end tell
end tell`;
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },
};
