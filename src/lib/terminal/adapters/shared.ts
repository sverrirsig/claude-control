import { execFile } from "child_process";
import { promisify } from "util";

export const execFileAsync = promisify(execFile);
export const OSASCRIPT_TIMEOUT_MS = 10000;

export function escapeForAppleScript(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

export function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}

export function shellEscapeDouble(s: string): string {
  return s.replace(/["$`\\]/g, "\\$&");
}

export function mapKeystrokeToSystemEvents(keystroke: string): string {
  switch (keystroke) {
    case "return":
      return `keystroke return`;
    case "escape":
      return `key code 53`;
    case "up":
      return `key code 126`;
    case "down":
      return `key code 125`;
    case "tab":
      return `key code 48`;
    case "space":
      return `keystroke " "`;
    default:
      return `keystroke "${keystroke.replace(/"/g, '\\"')}"`;
  }
}

export function systemEventsScript(processName: string, action: string): string {
  return `tell application "System Events"
  tell process "${processName}"
    ${action}
  end tell
end tell`;
}

export function withFocusDelay(focusScript: string, actionScript: string, delaySeconds: number): string {
  return `${focusScript}\ndelay ${delaySeconds}\n${actionScript}`;
}

export function genericActivateScript(appName: string): string {
  return `tell application "${appName}" to activate`;
}
