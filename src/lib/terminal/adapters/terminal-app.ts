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
  return `tell application "Terminal"
  activate
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      if tty of aTab is "${safeTty}" then
        set selected tab of aWindow to aTab
        set index of aWindow to 1
        return
      end if
    end repeat
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

  async createSession(command: string): Promise<void> {
    const asCmd = escapeForAppleScript(command);
    const script = `tell application "Terminal"
  activate
  do script "${asCmd}"
end tell`;
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },
};
