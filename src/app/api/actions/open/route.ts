import { NextResponse } from "next/server";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

type ActionType = "iterm" | "vscode" | "finder" | "fork" | "send-message";

async function getTtyForPid(pid: number): Promise<string> {
  const { stdout: ttyOut } = await execFileAsync("ps", ["-o", "tty=", "-p", String(pid)], {
    timeout: 5000,
  });
  const tty = ttyOut.trim();
  if (!tty || tty === "?") {
    throw new Error(`No TTY found for PID ${pid}`);
  }
  return tty.startsWith("/") ? tty : `/dev/${tty}`;
}

async function sendMessageToSession(pid: number, message: string): Promise<void> {
  const ttyPath = await getTtyForPid(pid);

  // Escape message for AppleScript string context
  const asEscaped = message.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const script = `
tell application "iTerm"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${ttyPath}" then
          tell aSession
            write text "${asEscaped}"
          end tell
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;

  await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
}

async function focusItermByPid(pid: number): Promise<void> {
  const { stdout: ttyOut } = await execFileAsync("ps", ["-o", "tty=", "-p", String(pid)], {
    timeout: 5000,
  });
  const tty = ttyOut.trim();
  if (!tty || tty === "?") {
    throw new Error(`No TTY found for PID ${pid}`);
  }
  const ttyPath = tty.startsWith("/") ? tty : `/dev/${tty}`;

  const script = `
tell application "iTerm"
  activate
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${ttyPath}" then
          select aWindow
          select aTab
          select aSession
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;

  await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { timeout: 5000 });
}

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
    const { action, path, pid, targetScreen, message } = body as {
      action: ActionType;
      path: string;
      pid?: number;
      targetScreen?: number;
      message?: string;
    };

    if (!action || !path) {
      return NextResponse.json({ error: "Missing action or path" }, { status: 400 });
    }

    if (action !== "iterm" && action !== "send-message") {
      try {
        await stat(path);
      } catch {
        return NextResponse.json({ error: "Path does not exist" }, { status: 404 });
      }
    }

    switch (action) {
      case "iterm":
        if (!pid) {
          return NextResponse.json({ error: "Missing pid for iTerm action" }, { status: 400 });
        }
        await focusItermByPid(pid);
        break;
      case "vscode":
        await execFileAsync("code", [path]);
        if (targetScreen !== undefined) {
          // Small delay for VS Code to open/focus
          await new Promise((r) => setTimeout(r, 800));
          await moveAppToScreen("Code", targetScreen);
        }
        break;
      case "finder":
        await execFileAsync("open", [path]);
        if (targetScreen !== undefined) {
          await new Promise((r) => setTimeout(r, 500));
          await moveAppToScreen("Finder", targetScreen);
        }
        break;
      case "fork":
        await execFileAsync("open", ["-a", "Fork", path]);
        if (targetScreen !== undefined) {
          await new Promise((r) => setTimeout(r, 800));
          await moveAppToScreen("Fork", targetScreen);
        }
        break;
      case "send-message":
        if (!pid) {
          return NextResponse.json({ error: "Missing pid for send-message action" }, { status: 400 });
        }
        if (!message) {
          return NextResponse.json({ error: "Missing message" }, { status: 400 });
        }
        await sendMessageToSession(pid, message);
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Action failed:", error);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
