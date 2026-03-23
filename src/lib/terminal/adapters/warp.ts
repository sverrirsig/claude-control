import type { TerminalInfo } from "../types";
import type { TerminalAdapter, CreateSessionOpts } from "./types";
import {
  execFileAsync,
  OSASCRIPT_TIMEOUT_MS,
  escapeForAppleScript,
  mapKeystrokeToSystemEvents,
  systemEventsScript,
  withFocusDelay,
  genericActivateScript,
} from "./shared";
import { APPLESCRIPT_FOCUS_DELAY_S } from "../../constants";

export const warpAdapter: TerminalAdapter = {
  async focus(): Promise<void> {
    await execFileAsync("open", ["-a", "Warp"], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async sendText(info: TerminalInfo, text: string): Promise<void> {
    const asEscaped = escapeForAppleScript(text);
    const action = systemEventsScript("Warp", `keystroke "${asEscaped}"\n    keystroke return`);
    const script = withFocusDelay(genericActivateScript("Warp"), action, APPLESCRIPT_FOCUS_DELAY_S);
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async sendKeystroke(info: TerminalInfo, keystroke: string): Promise<void> {
    const asKeystroke = mapKeystrokeToSystemEvents(keystroke);
    const action = systemEventsScript("Warp", asKeystroke);
    const script = withFocusDelay(genericActivateScript("Warp"), action, APPLESCRIPT_FOCUS_DELAY_S);
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },

  async createSession(command: string, _opts: CreateSessionOpts): Promise<void> {
    const asCmd = escapeForAppleScript(command);
    const script = `tell application "Warp" to activate
delay 0.5
tell application "System Events"
  tell process "Warp"
    keystroke "${asCmd}"
    keystroke return
  end tell
end tell`;
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  },
};
