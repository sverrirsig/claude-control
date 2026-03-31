import { execFile } from "child_process";
import { promisify } from "util";
import { PROCESS_TIMEOUT_MS } from "../constants";
import { getAdapter } from "./adapters/registry";
import { shellEscape, shellEscapeDouble } from "./adapters/shared";
import { buildProcessTree, detectTmuxClients, findTerminalInTree, getTmuxPathSync } from "./detect";
import type { TerminalApp, TerminalInfo } from "./types";

const execFileAsync = promisify(execFile);

export { getAdapter, registerAdapter } from "./adapters/registry";
export type { CreateSessionOpts, TerminalAdapter } from "./adapters/types";

// ────────────────────────────────────────────────────────────────────────────
// Public API — handles tmux cross-cutting logic, then delegates to adapters
// ────────────────────────────────────────────────────────────────────────────

export async function focusSession(info: TerminalInfo): Promise<void> {
  // If in tmux, select the correct pane first
  if (info.inTmux && info.tmux) {
    const windowTarget = `${info.tmux.sessionName}:${info.tmux.windowIndex}`;
    await execFileAsync(getTmuxPathSync(), ["select-window", "-t", windowTarget], { timeout: PROCESS_TIMEOUT_MS });
    await execFileAsync(getTmuxPathSync(), ["select-pane", "-t", info.tmux.paneId], { timeout: PROCESS_TIMEOUT_MS });
  }

  // Use tmux client TTY (terminal tab's TTY) when in tmux, otherwise the process's TTY
  const effectiveInfo = info.inTmux && info.tmux?.clientTty ? { ...info, tty: info.tmux.clientTty } : info;

  const adapter = getAdapter(effectiveInfo.app);
  if (!adapter) return; // Unknown terminal — nothing to focus
  await adapter.focus(effectiveInfo);
}

export async function sendText(info: TerminalInfo, text: string): Promise<void> {
  // tmux: send directly to the pane — works in background without focus
  if (info.inTmux && info.tmux) {
    await execFileAsync(getTmuxPathSync(), ["send-keys", "-t", info.tmux.paneId, text, "Enter"], {
      timeout: PROCESS_TIMEOUT_MS,
    });
    return;
  }

  const adapter = getAdapter(info.app);
  if (!adapter) return;
  await adapter.sendText(info, text);
}

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
    await execFileAsync(getTmuxPathSync(), ["send-keys", "-t", info.tmux.paneId, tmuxKeyMap[keystroke] ?? keystroke], {
      timeout: PROCESS_TIMEOUT_MS,
    });
    return;
  }

  const adapter = getAdapter(info.app);
  if (!adapter) return;
  await adapter.sendKeystroke(info, keystroke);
}

// ────────────────────────────────────────────────────────────────────────────
// createSession
// ────────────────────────────────────────────────────────────────────────────

export interface CreateSessionPublicOpts {
  terminalApp: TerminalApp;
  openIn: "tab" | "window";
  useTmux: boolean;
  tmuxSession?: string;
  cwd: string;
  prompt?: string;
}

export async function createSession(opts: CreateSessionPublicOpts): Promise<void> {
  const { terminalApp, openIn, useTmux, tmuxSession, cwd, prompt } = opts;

  // Build the shell command with proper escaping
  let command = "claude";
  if (prompt) {
    command += ` '${shellEscape(prompt)}'`;
  }
  const cmd = `cd '${shellEscape(cwd)}' && ${command}`;

  // Named tmux session: try adding a window to existing session
  if (useTmux && tmuxSession) {
    try {
      await execFileAsync(getTmuxPathSync(), ["new-window", "-t", tmuxSession, cmd], { timeout: 10000 });
      // Focus the terminal tab that has the tmux client for this session
      try {
        const [clients, tree] = await Promise.all([detectTmuxClients(), buildProcessTree()]);
        const client = clients.find((c) => c.sessionName === tmuxSession);
        if (client) {
          const termApp = findTerminalInTree(client.pid, tree);
          await focusSession({
            ...termApp,
            pid: client.pid,
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

  // Build the effective command (wrap in tmux if needed)
  let effectiveCommand: string;
  if (useTmux) {
    const sessionName = tmuxSession || `claude-${Date.now().toString(36).slice(-4)}`;
    effectiveCommand = `tmux new-session -s '${shellEscape(sessionName)}' "${shellEscapeDouble(cmd)}"`;
  } else {
    effectiveCommand = cmd;
  }

  const adapter = getAdapter(terminalApp);
  if (!adapter) throw new Error(`No adapter for terminal: ${terminalApp}`);
  await adapter.createSession(effectiveCommand, { openIn, useTmux, tmuxSession, cwd, prompt });
}

// ────────────────────────────────────────────────────────────────────────────
// listTmuxSessions (not terminal-specific, stays here)
// ────────────────────────────────────────────────────────────────────────────

export async function listTmuxSessions(): Promise<{ name: string; windows: number; attached: boolean }[]> {
  try {
    const { stdout } = await execFileAsync(
      getTmuxPathSync(),
      ["list-sessions", "-F", "#{session_name}\t#{session_windows}\t#{session_attached}"],
      { timeout: PROCESS_TIMEOUT_MS },
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
