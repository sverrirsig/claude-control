import type { TerminalInfo } from "../types";

export interface CreateSessionOpts {
  openIn: "tab" | "window";
  useTmux: boolean;
  tmuxSession?: string;
  cwd: string;
  prompt?: string;
}

/**
 * Each terminal implements this interface. The public API (focusSession,
 * sendText, etc.) handles tmux logic first, then delegates to the adapter.
 */
export interface TerminalAdapter {
  /** Bring the terminal window/tab containing this session to front. */
  focus(info: TerminalInfo): Promise<void>;

  /** Type text + Enter into the session. */
  sendText(info: TerminalInfo, text: string): Promise<void>;

  /** Send a single keystroke (e.g. "return", "y", "escape"). */
  sendKeystroke(info: TerminalInfo, keystroke: string): Promise<void>;

  /** Open a new terminal tab/window and run a command. */
  createSession(command: string, opts: CreateSessionOpts): Promise<void>;
}
