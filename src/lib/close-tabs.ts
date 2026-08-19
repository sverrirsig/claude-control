import { escapeForAppleScript, execFileAsync, OSASCRIPT_TIMEOUT_MS } from "./terminal/adapters/shared";

/** Browsers whose tabs can be scripted via the Chromium AppleScript dictionary. */
export const CHROMIUM_BROWSERS = ["Google Chrome", "Arc", "Brave Browser", "Microsoft Edge"];

/**
 * Close the first browser tab whose URL starts with `url`. Chromium browsers
 * only — Safari and Firefox have no usable tab scripting here. Best-effort:
 * failures are swallowed.
 */
export async function closeBrowserTab(appName: string, url: string): Promise<void> {
  if (!CHROMIUM_BROWSERS.includes(appName)) return;

  const escapedUrl = escapeForAppleScript(url);
  const script = `tell application "${appName}"
  set found to false
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      if URL of aTab starts with "${escapedUrl}" then
        close aTab
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat
end tell`;

  try {
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  } catch {
    // Best-effort — browser not running, or tab already gone
  }
}

/**
 * Close the git GUI tab for a repo. Git GUIs like Fork have no AppleScript
 * dictionary, but use native macOS tabs — each tab appears to System Events
 * as a window named after the repo folder, with a clickable close button.
 * Requires accessibility permission; best-effort, failures are swallowed.
 */
export async function closeGitGuiTab(appName: string, folderName: string): Promise<void> {
  if (!appName || !folderName) return;

  const escapedName = escapeForAppleScript(folderName);
  const script = `tell application "System Events"
  tell process "${appName}"
    repeat with aWindow in windows
      if name of aWindow is "${escapedName}" then
        click (first button of aWindow whose description is "close button")
        exit repeat
      end if
    end repeat
  end tell
end tell`;

  try {
    await execFileAsync("osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
  } catch {
    // Best-effort — app not running, no accessibility permission, or tab already closed
  }
}
