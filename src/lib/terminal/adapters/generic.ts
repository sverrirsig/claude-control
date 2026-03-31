import { APPLESCRIPT_FOCUS_DELAY_S } from "../../constants";
import type { TerminalInfo } from "../types";
import {
  cleanEnvForTerminal,
  escapeForAppleScript,
  execFileAsync,
  genericActivateScript,
  mapKeystrokeToSystemEvents,
  OSASCRIPT_TIMEOUT_MS,
  systemEventsScript,
  withFocusDelay,
} from "./shared";
import type { CreateSessionOpts, TerminalAdapter } from "./types";

/**
 * Base adapter for terminals that use `open -a` for focus and System Events
 * for text/keystrokes. Subclasses only need to provide createSession args.
 */
export function createGenericAdapter(
  createArgs: (command: string) => { bin: string; args: string[] },
): TerminalAdapter {
  return {
    async focus(info: TerminalInfo): Promise<void> {
      await execFileAsync("open", ["-a", info.appName], { timeout: OSASCRIPT_TIMEOUT_MS });
    },

    async sendText(info: TerminalInfo, text: string): Promise<void> {
      const asEscaped = escapeForAppleScript(text);
      const action = systemEventsScript(info.appName, `keystroke "${asEscaped}"\n    keystroke return`);
      const script = withFocusDelay(genericActivateScript(info.appName), action, APPLESCRIPT_FOCUS_DELAY_S);
      await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
    },

    async sendKeystroke(info: TerminalInfo, keystroke: string): Promise<void> {
      const asKeystroke = mapKeystrokeToSystemEvents(keystroke);
      const action = systemEventsScript(info.appName, asKeystroke);
      const script = withFocusDelay(genericActivateScript(info.appName), action, APPLESCRIPT_FOCUS_DELAY_S);
      await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
    },

    async createSession(command: string, _opts: CreateSessionOpts): Promise<void> {
      const { bin, args } = createArgs(command);
      await execFileAsync(bin, args, { timeout: OSASCRIPT_TIMEOUT_MS, env: cleanEnvForTerminal() });
    },
  };
}
