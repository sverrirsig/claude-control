// Terminal app identifiers — "iterm" (not "iterm2") matches process tree convention
export type TerminalApp = "inline" | "iterm" | "terminal-app" | "ghostty" | "kitty" | "wezterm" | "alacritty" | "warp" | "unknown";

export type TerminalOpenIn = "tab" | "window";

// Pure detection result — cached per PID
export interface TerminalInfo {
  app: TerminalApp;
  appName: string; // Display name: "iTerm2", "Terminal", "Ghostty"
  processName: string; // As seen by ps: "iTerm2", "Terminal", "ghostty"
  pid: number; // The claude process PID (used by kitty for window matching via kitten @ ls)
  inTmux: boolean;
  tmux?: {
    paneId: string; // e.g. "%5"
    sessionName: string;
    windowIndex: number;
    paneIndex: number;
    target: string; // e.g. "main:1.0"
    clientPid?: number; // PID of the tmux client process (used by kitty for window matching)
    clientTty: string; // TTY of the tmux client (terminal tab's TTY, NOT pane TTY)
  };
  tty: string; // The claude process's TTY (or "" on failure)
}

export interface TmuxPaneInfo {
  tty: string;
  paneId: string;
  sessionName: string;
  windowIndex: number;
  paneIndex: number;
  target: string;
}

export interface TmuxClientInfo {
  tty: string;
  pid: number;
  sessionName: string;
}

export interface ProcessTreeEntry {
  ppid: number;
  comm: string;
  cpuPercent: number;
}
