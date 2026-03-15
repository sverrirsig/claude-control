import { NextResponse } from "next/server";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";
import { loadConfig, EDITOR_OPTIONS, GIT_GUI_OPTIONS, BROWSER_OPTIONS } from "@/lib/config";
import {
  buildProcessTree,
  detectAllTmuxPanes,
  detectTerminal,
  focusSession,
  sendText,
  sendKeystroke,
} from "@/lib/terminal";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

type ActionType = "focus" | "iterm" | "editor" | "finder" | "git-gui" | "send-message" | "send-keystroke" | "open-url";

/**
 * Move the frontmost window of an app to a target screen.
 * screenIndex 0 = primary/main screen, 1 = secondary, etc.
 */
async function moveAppToScreen(appName: string, screenIndex: number): Promise<void> {
  const script = `
use framework "AppKit"

set screens to current application's NSScreen's screens()
set screenCount to count of screens

if ${screenIndex} >= screenCount then
  return "no screen"
end if

-- Get target screen frame: frame() returns {{originX, originY}, {width, height}}
set targetScreen to item (${screenIndex} + 1) of screens
set f to targetScreen's frame()
set sx to item 1 of item 1 of f as integer
set sy to item 2 of item 1 of f as integer
set sw to item 1 of item 2 of f as integer
set sh to item 2 of item 2 of f as integer

-- Primary screen height for coordinate conversion (NSScreen is bottom-left origin, AppleScript is top-left)
set pf to (item 1 of screens)'s frame()
set primaryHeight to item 2 of item 2 of pf as integer
set asY to primaryHeight - sy - sh

-- Move the frontmost window of the app to the target screen
tell application "${appName}"
  if (count of windows) > 0 then
    set bounds of front window to {sx + 50, asY + 50, sx + sw - 50, asY + sh - 50}
  end if
end tell

return "ok"
`;

  try {
    await execAsync(`osascript -l AppleScript -e '${script.replace(/'/g, "'\"'\"'")}'`, { timeout: 5000 });
  } catch {
    // Silently fail — window positioning is best-effort
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, path, pid, targetScreen, message, url, keystroke } = body as {
      action: ActionType;
      path?: string;
      pid?: number;
      targetScreen?: number;
      message?: string;
      url?: string;
      keystroke?: string;
    };

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    // "iterm" is accepted as backward compat for "focus"
    const normalizedAction = action === "iterm" ? "focus" : action;

    if (normalizedAction !== "focus" && normalizedAction !== "send-message" && normalizedAction !== "send-keystroke" && normalizedAction !== "open-url") {
      if (!path) {
        return NextResponse.json({ error: "Missing path" }, { status: 400 });
      }
      try {
        await stat(path);
      } catch {
        return NextResponse.json({ error: "Path does not exist" }, { status: 404 });
      }
    }

    switch (normalizedAction) {
      case "focus": {
        if (!pid) {
          return NextResponse.json({ error: "Missing pid for focus action" }, { status: 400 });
        }
        const [tree, panes] = await Promise.all([buildProcessTree(), detectAllTmuxPanes()]);
        const info = await detectTerminal(pid, tree, panes);
        await focusSession(info);
        break;
      }
      case "editor": {
        const config = await loadConfig();
        const editorDef = EDITOR_OPTIONS.find((e) => e.id === config.editor);
        if (!editorDef || !editorDef.command) {
          return NextResponse.json({ error: "No editor configured" }, { status: 400 });
        }
        await execFileAsync(editorDef.command, [path!]);
        if (targetScreen !== undefined) {
          await new Promise((r) => setTimeout(r, 800));
          await moveAppToScreen(editorDef.processName, targetScreen);
        }
        break;
      }
      case "finder":
        await execFileAsync("open", [path!]);
        if (targetScreen !== undefined) {
          await new Promise((r) => setTimeout(r, 500));
          await moveAppToScreen("Finder", targetScreen);
        }
        break;
      case "git-gui": {
        const gitConfig = await loadConfig();
        const guiDef = GIT_GUI_OPTIONS.find((g) => g.id === gitConfig.gitGui);
        if (!guiDef || !guiDef.appName) {
          return NextResponse.json({ error: "No git GUI configured" }, { status: 400 });
        }
        await execFileAsync("open", ["-a", guiDef.appName, path!]);
        if (targetScreen !== undefined) {
          await new Promise((r) => setTimeout(r, 800));
          await moveAppToScreen(guiDef.appName, targetScreen);
        }
        break;
      }
      case "send-message": {
        if (!pid) {
          return NextResponse.json({ error: "Missing pid for send-message action" }, { status: 400 });
        }
        if (!message) {
          return NextResponse.json({ error: "Missing message" }, { status: 400 });
        }
        const [tree, panes] = await Promise.all([buildProcessTree(), detectAllTmuxPanes()]);
        const info = await detectTerminal(pid, tree, panes);
        await sendText(info, message);
        break;
      }
      case "send-keystroke": {
        if (!pid) {
          return NextResponse.json({ error: "Missing pid for send-keystroke action" }, { status: 400 });
        }
        if (!keystroke) {
          return NextResponse.json({ error: "Missing keystroke" }, { status: 400 });
        }
        const [tree, panes] = await Promise.all([buildProcessTree(), detectAllTmuxPanes()]);
        const info = await detectTerminal(pid, tree, panes);
        await sendKeystroke(info, keystroke);
        break;
      }
      case "open-url": {
        if (!url) {
          return NextResponse.json({ error: "Missing url" }, { status: 400 });
        }
        const browserConfig = await loadConfig();
        const browserDef = BROWSER_OPTIONS.find((b) => b.id === browserConfig.browser) ?? BROWSER_OPTIONS[0];
        const escapedUrl = url.replace(/"/g, '\\"');

        const chromiumBrowsers = ["Google Chrome", "Arc", "Brave Browser", "Microsoft Edge"];
        if (chromiumBrowsers.includes(browserDef.appName)) {
          const script = `
tell application "${browserDef.appName}"
  set found to false
  repeat with aWindow in windows
    set tabIndex to 0
    repeat with aTab in tabs of aWindow
      set tabIndex to tabIndex + 1
      if URL of aTab starts with "${escapedUrl}" then
        set active tab index of aWindow to tabIndex
        set index of aWindow to 1
        activate
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat
  if not found then
    activate
    open location "${escapedUrl}"
  end if
end tell`;
          try {
            await execFileAsync("osascript", ["-e", script], { timeout: 5000 });
          } catch {
            await execFileAsync("open", ["-a", browserDef.appName, url]);
          }
        } else {
          await execFileAsync("open", ["-a", browserDef.appName, url]);
        }
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Action failed:", error);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
