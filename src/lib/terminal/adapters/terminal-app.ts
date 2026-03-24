import { APPLESCRIPT_FOCUS_DELAY_S } from "../../constants";
import type { TerminalInfo } from "../types";
import {
  escapeForAppleScript,
  execFileAsync,
  mapKeystrokeToSystemEvents,
  OSASCRIPT_TIMEOUT_MS,
  systemEventsScript,
  withFocusDelay,
} from "./shared";
import type { CreateSessionOpts, TerminalAdapter } from "./types";

function focusScript(ttyPath: string): string {
  const safeTty = escapeForAppleScript(ttyPath);
  // Uses a flag variable instead of `return` to break out of nested loops.
  // In AppleScript, `return` exits the entire script — when this focus script
  // is composed with an action via withFocusDelay(), `return` would prevent
  // the action (keystroke, text) from ever executing.
  return `tell application "Terminal"
  activate
  set found to false
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      if tty of aTab is "${safeTty}" then
        set selected tab of aWindow to aTab
        set index of aWindow to 1
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat
end tell`;
}

export const terminalAppAdapter: TerminalAdapter = {
  async focus(info: TerminalInfo): Promise<void> {
    await execFileAsync("osascript", ["-e", focusScript(info.tty)], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async sendText(info: TerminalInfo, text: string): Promise<void> {
    const asEscaped = escapeForAppleScript(text);
    const action = systemEventsScript("Terminal", `keystroke "${asEscaped}"\n    keystroke return`);
    const script = withFocusDelay(focusScript(info.tty), action, APPLESCRIPT_FOCUS_DELAY_S);
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async sendKeystroke(info: TerminalInfo, keystroke: string): Promise<void> {
    const asKeystroke = mapKeystrokeToSystemEvents(keystroke);
    const action = systemEventsScript("Terminal", asKeystroke);
    const script = withFocusDelay(focusScript(info.tty), action, APPLESCRIPT_FOCUS_DELAY_S);
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async createSession(command: string, opts: CreateSessionOpts): Promise<void> {
    const asCmd = escapeForAppleScript(command);
    // "do script in front window" opens a tab; plain "do script" opens a new window.
    // When requesting a tab, check that a window exists first — "in front window"
    // fails if Terminal has no open windows.
    const script =
      opts.openIn === "tab"
        ? `tell application "Terminal"
  activate
  if (count of windows) > 0 then
    do script "${asCmd}" in front window
  else
    do script "${asCmd}"
  end if
end tell`
        : `tell application "Terminal"
  activate
  do script "${asCmd}"
end tell`;
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },
};
