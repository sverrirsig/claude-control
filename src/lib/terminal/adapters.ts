import { execFile } from "child_process";
import { promisify } from "util";
import type { TerminalInfo, TerminalApp } from "./types";
import { detectTmuxClients, buildProcessTree, findTerminalInTree } from "./detect";

const execFileAsync = promisify(execFile);

function escapeForAppleScript(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function mapKeystrokeToSystemEvents(keystroke: string): string {
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

// ────────────────────────────────────────────────────────────────────────────
// focusSession
// ────────────────────────────────────────────────────────────────────────────

export async function focusSession(info: TerminalInfo): Promise<void> {
  // If in tmux, select the correct pane first
  if (info.inTmux && info.tmux) {
    const windowTarget = `${info.tmux.sessionName}:${info.tmux.windowIndex}`;
    await execFileAsync("tmux", ["select-window", "-t", windowTarget], { timeout: 5000 });
    await execFileAsync("tmux", ["select-pane", "-t", info.tmux.paneId], { timeout: 5000 });
  }

  // Use tmux client TTY (terminal tab's TTY) when in tmux, otherwise the process's TTY
  const ttyPath = info.inTmux && info.tmux?.clientTty ? info.tmux.clientTty : info.tty;

  switch (info.app) {
    case "iterm": {
      const script = `tell application "iTerm"
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
      await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
      break;
    }

    case "terminal-app": {
      const script = `tell application "Terminal"
  activate
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      if tty of aTab is "${ttyPath}" then
        set selected tab of aWindow to aTab
        set index of aWindow to 1
        return
      end if
    end repeat
  end repeat
end tell`;
      await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
      break;
    }

    case "ghostty":
    case "kitty":
    case "wezterm":
    case "alacritty":
      await execFileAsync("open", ["-a", info.appName], { timeout: 10000 });
      break;

    default:
      throw new Error("Cannot focus unknown terminal");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// sendText
// ────────────────────────────────────────────────────────────────────────────

export async function sendText(info: TerminalInfo, text: string): Promise<void> {
  // tmux: send directly to the pane — works in background without focus
  if (info.inTmux && info.tmux) {
    await execFileAsync("tmux", ["send-keys", "-t", info.tmux.paneId, text, "Enter"], {
      timeout: 5000,
    });
    return;
  }

  switch (info.app) {
    case "iterm": {
      const asEscaped = escapeForAppleScript(text);
      const script = `tell application "iTerm"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${info.tty}" then
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
      break;
    }

    case "terminal-app":
    case "ghostty":
    case "kitty":
    case "wezterm":
    case "alacritty": {
      await focusSession(info);
      const processName = info.app === "terminal-app" ? "Terminal" : info.appName;
      const asEscaped = escapeForAppleScript(text);
      const script = `tell application "System Events"
  tell process "${processName}"
    keystroke "${asEscaped}"
    keystroke return
  end tell
end tell`;
      await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
      break;
    }

    default:
      throw new Error("Cannot send text to unknown terminal");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// sendKeystroke
// ────────────────────────────────────────────────────────────────────────────

export async function sendKeystroke(info: TerminalInfo, keystroke: string): Promise<void> {
  // tmux: send directly to the pane
  if (info.inTmux && info.tmux) {
    const tmuxKeyMap: Record<string, string> = {
      return: "Enter",
      escape: "Escape",
      up: "Up",
      down: "Down",
      tab: "Tab",
      space: "Space",
    };
    await execFileAsync(
      "tmux",
      ["send-keys", "-t", info.tmux.paneId, tmuxKeyMap[keystroke] ?? keystroke],
      { timeout: 5000 }
    );
    return;
  }

  // iTerm2: use write text for simple keys (no focus needed)
  if (info.app === "iterm") {
    const itermWriteMap: Record<string, string> = {
      return: `write text ""`,
      escape: `write text (ASCII character 27) newline NO`,
      y: `write text "y"`,
      n: `write text "n"`,
    };

    const writeCmd = itermWriteMap[keystroke];
    if (writeCmd) {
      const script = `tell application "iTerm"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${info.tty}" then
          tell aSession
            ${writeCmd}
          end tell
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;
      await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
      return;
    }
    // Arrow keys fall through to the System Events path below
  }

  // Terminal.app: combined focus + keystroke in a single AppleScript to avoid
  // Electron focus-steal race between two separate osascript calls
  if (info.app === "terminal-app") {
    const asKeystroke = mapKeystrokeToSystemEvents(keystroke);
    const script = `tell application "Terminal"
  activate
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      if tty of aTab is "${info.tty}" then
        set selected tab of aWindow to aTab
        set index of aWindow to 1
      end if
    end repeat
  end repeat
end tell
delay 0.2
tell application "System Events"
  tell process "Terminal"
    ${asKeystroke}
  end tell
end tell`;
    await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
    return;
  }

  // All other apps (including iTerm for arrow keys): focus + System Events
  if (info.app === "unknown") {
    throw new Error("Cannot send keystroke to unknown terminal");
  }

  const asKeystroke = mapKeystrokeToSystemEvents(keystroke);
  await focusSession(info);
  await new Promise((r) => setTimeout(r, 150));

  const processName = info.app === "iterm" ? "iTerm2" : info.appName;
  const script = `tell application "System Events"
  tell process "${processName}"
    ${asKeystroke}
  end tell
end tell`;
  await execFileAsync("osascript", ["-e", script], { timeout: 5000 });
}

// ────────────────────────────────────────────────────────────────────────────
// createSession
// ────────────────────────────────────────────────────────────────────────────

export interface CreateSessionOpts {
  terminalApp: TerminalApp;
  openIn: "tab" | "window";
  useTmux: boolean;
  tmuxSession?: string; // session name to create or add a window to
  cwd: string;
  prompt?: string; // initial prompt for claude (raw, unescaped)
}

function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}

function shellEscapeDouble(s: string): string {
  return s.replace(/["$`\\]/g, "\\$&");
}

export async function createSession(opts: CreateSessionOpts): Promise<void> {
  const { terminalApp, openIn, useTmux, tmuxSession, cwd, prompt } = opts;

  // Build the shell command with proper escaping — all user input
  // goes through shellEscape so callers can't introduce injection
  let command = "claude";
  if (prompt) {
    command += ` '${shellEscape(prompt)}'`;
  }
  const cmd = `cd '${shellEscape(cwd)}' && ${command}`;

  // Named tmux session: try adding a window to existing session
  if (useTmux && tmuxSession) {
    try {
      await execFileAsync("tmux", ["new-window", "-t", tmuxSession, cmd], { timeout: 10000 });
      // Focus the terminal tab that has the tmux client for this session
      try {
        const [clients, tree] = await Promise.all([detectTmuxClients(), buildProcessTree()]);
        const client = clients.find((c) => c.sessionName === tmuxSession);
        if (client) {
          const termApp = findTerminalInTree(client.pid, tree);
          // Don't set inTmux — we just want to focus the terminal tab by
          // the client TTY. tmux already switched to the new window.
          await focusSession({
            ...termApp,
            inTmux: false,
            tty: client.tty,
          });
        }
      } catch (err) {
        console.error("focus after new-window failed:", err);
      }
      return;
    } catch {
      // Session doesn't exist — fall through to open a terminal with new-session
    }
  }

  // Build the effective command
  let effectiveCommand: string;
  if (useTmux) {
    // Named session that needs creating, or unnamed fallback
    const sessionName = tmuxSession || `claude-${Date.now().toString(36).slice(-4)}`;
    effectiveCommand = `tmux new-session -s '${shellEscape(sessionName)}' "${shellEscapeDouble(cmd)}"`;

  } else {
    effectiveCommand = cmd;
  }

  switch (terminalApp) {
    case "iterm": {
      const asCmd = escapeForAppleScript(effectiveCommand);
      const script =
        openIn === "tab"
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
      await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
      break;
    }

    case "terminal-app": {
      const asCmd = escapeForAppleScript(effectiveCommand);
      const script = `tell application "Terminal"
  activate
  do script "${asCmd}"
end tell`;
      await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
      break;
    }

    case "ghostty":
      await execFileAsync("ghostty", ["-e", "sh", "-c", effectiveCommand], { timeout: 10000 });
      break;
    case "kitty":
      await execFileAsync("kitty", ["sh", "-c", effectiveCommand], { timeout: 10000 });
      break;
    case "wezterm":
      await execFileAsync("wezterm", ["start", "--", "sh", "-c", effectiveCommand], { timeout: 10000 });
      break;
    case "alacritty":
      await execFileAsync("alacritty", ["-e", "sh", "-c", effectiveCommand], { timeout: 10000 });
      break;

    default:
      throw new Error(`Cannot create session for unknown terminal: ${terminalApp}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// listTmuxSessions
// ────────────────────────────────────────────────────────────────────────────

export async function listTmuxSessions(): Promise<
  { name: string; windows: number; attached: boolean }[]
> {
  try {
    const { stdout } = await execFileAsync(
      "tmux",
      ["list-sessions", "-F", "#{session_name}\t#{session_windows}\t#{session_attached}"],
      { timeout: 5000 }
    );
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        return {
          name: parts[0],
          windows: parseInt(parts[1] ?? "0", 10),
          attached: parts[2] === "1",
        };
      });
  } catch {
    return [];
  }
}
