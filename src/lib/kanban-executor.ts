import type { ClaudeSession } from "./types";
import { buildProcessTree, detectAllTmuxPanes, detectTerminal, sendText } from "./terminal";

/**
 * Send a prompt to an existing Claude Code session via its terminal/tmux pane.
 * Reuses the same detection flow as the "send-message" action.
 */
export async function sendPromptToSession(session: ClaudeSession, prompt: string): Promise<void> {
  if (!session.pid) {
    throw new Error(`Session ${session.id} has no PID — cannot send prompt`);
  }

  console.log(`[kanban-exec] Sending to session ${session.id} (pid ${session.pid}):\n${prompt.slice(0, 200)}`);
  const [tree, panes] = await Promise.all([buildProcessTree(), detectAllTmuxPanes()]);
  const info = await detectTerminal(session.pid, tree, panes);
  console.log(`[kanban-exec] Terminal info: tmux=${info.inTmux}, app=${info.app}, tty=${info.tty}`);
  await sendText(info, prompt);
}

/**
 * Clear the conversation then send a prompt.
 * Used when moving from Unstaged to a column so the column gets a clean slate.
 */
export async function sendClearAndPrompt(session: ClaudeSession, prompt: string): Promise<void> {
  if (!session.pid) {
    throw new Error(`Session ${session.id} has no PID — cannot send prompt`);
  }

  console.log(`[kanban-exec] Clear+send to session ${session.id} (pid ${session.pid}):\n${prompt.slice(0, 200)}`);
  const [tree, panes] = await Promise.all([buildProcessTree(), detectAllTmuxPanes()]);
  const info = await detectTerminal(session.pid, tree, panes);
  console.log(`[kanban-exec] Terminal info: tmux=${info.inTmux}, app=${info.app}, tty=${info.tty}`);
  await sendText(info, "/clear");
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`[kanban-exec] Sending prompt after /clear`);
  await sendText(info, prompt);
}
