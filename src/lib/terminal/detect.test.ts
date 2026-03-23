import { describe, it, expect } from "vitest";
import { findTerminalInTree, matchTerminal, findClaudePidsFromTree, isOrphaned } from "./detect";
import type { ProcessTreeEntry } from "./types";

describe("matchTerminal", () => {
  it("matches iTerm2 by basename", () => {
    expect(matchTerminal("iTerm2")).toEqual({
      app: "iterm",
      appName: "iTerm2",
      processName: "iTerm2",
    });
  });

  it("matches from full macOS path", () => {
    expect(matchTerminal("/Applications/iTerm.app/Contents/MacOS/iTerm2")).toEqual({
      app: "iterm",
      appName: "iTerm2",
      processName: "iTerm2",
    });
  });

  it("matches Terminal (case-insensitive)", () => {
    expect(matchTerminal("Terminal")).toEqual({
      app: "terminal-app",
      appName: "Terminal",
      processName: "Terminal",
    });
  });

  it("matches ghostty", () => {
    expect(matchTerminal("ghostty")).toEqual({
      app: "ghostty",
      appName: "Ghostty",
      processName: "ghostty",
    });
  });

  it("matches wezterm-gui", () => {
    expect(matchTerminal("wezterm-gui")).toEqual({
      app: "wezterm",
      appName: "WezTerm",
      processName: "wezterm-gui",
    });
  });

  it("matches kitty", () => {
    expect(matchTerminal("kitty")?.app).toBe("kitty");
  });

  it("matches alacritty", () => {
    expect(matchTerminal("alacritty")?.app).toBe("alacritty");
  });

  it("returns null for unknown process", () => {
    expect(matchTerminal("sshd")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(matchTerminal("")).toBeNull();
  });
});

describe("findTerminalInTree", () => {
  it("walks up to find iTerm2", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [100, { ppid: 50, comm: "claude", cpuPercent: 0 }],
      [50, { ppid: 30, comm: "zsh", cpuPercent: 0 }],
      [30, { ppid: 10, comm: "login", cpuPercent: 0 }],
      [10, { ppid: 1, comm: "iTerm2", cpuPercent: 0 }],
    ]);
    const result = findTerminalInTree(100, tree);
    expect(result.app).toBe("iterm");
    expect(result.appName).toBe("iTerm2");
  });

  it("walks up to find Terminal.app", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [200, { ppid: 150, comm: "claude", cpuPercent: 0 }],
      [150, { ppid: 120, comm: "bash", cpuPercent: 0 }],
      [120, { ppid: 1, comm: "Terminal", cpuPercent: 0 }],
    ]);
    const result = findTerminalInTree(200, tree);
    expect(result.app).toBe("terminal-app");
  });

  it("returns unknown when no terminal ancestor found", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [100, { ppid: 50, comm: "claude", cpuPercent: 0 }],
      [50, { ppid: 30, comm: "zsh", cpuPercent: 0 }],
      [30, { ppid: 10, comm: "login", cpuPercent: 0 }],
      [10, { ppid: 1, comm: "sshd", cpuPercent: 0 }],
    ]);
    const result = findTerminalInTree(100, tree);
    expect(result.app).toBe("unknown");
  });

  it("handles cycle protection (pid points to itself)", () => {
    const tree = new Map<number, ProcessTreeEntry>([[100, { ppid: 100, comm: "claude", cpuPercent: 0 }]]);
    const result = findTerminalInTree(100, tree);
    expect(result.app).toBe("unknown");
  });

  it("returns unknown for empty tree", () => {
    const result = findTerminalInTree(100, new Map());
    expect(result.app).toBe("unknown");
  });

  it("handles full path comm entries", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [100, { ppid: 50, comm: "claude", cpuPercent: 0 }],
      [50, { ppid: 10, comm: "/bin/zsh", cpuPercent: 0 }],
      [10, { ppid: 1, comm: "/Applications/Ghostty.app/Contents/MacOS/ghostty", cpuPercent: 0 }],
    ]);
    const result = findTerminalInTree(100, tree);
    expect(result.app).toBe("ghostty");
  });

  it("stops at PID 1 without matching", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [100, { ppid: 50, comm: "claude", cpuPercent: 0 }],
      [50, { ppid: 1, comm: "zsh", cpuPercent: 0 }],
      [1, { ppid: 0, comm: "launchd", cpuPercent: 0 }],
    ]);
    const result = findTerminalInTree(100, tree);
    expect(result.app).toBe("unknown");
  });
});

describe("findClaudePidsFromTree", () => {
  it("extracts claude PIDs", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [100, { ppid: 50, comm: "claude", cpuPercent: 0 }],
      [50, { ppid: 10, comm: "zsh", cpuPercent: 0 }],
      [200, { ppid: 150, comm: "claude", cpuPercent: 0 }],
      [150, { ppid: 10, comm: "bash", cpuPercent: 0 }],
      [10, { ppid: 1, comm: "iTerm2", cpuPercent: 0 }],
    ]);
    const pids = findClaudePidsFromTree(tree);
    expect(pids).toContain(100);
    expect(pids).toContain(200);
    expect(pids).toHaveLength(2);
  });

  it("returns empty array when no claude processes", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [50, { ppid: 10, comm: "zsh", cpuPercent: 0 }],
      [10, { ppid: 1, comm: "iTerm2", cpuPercent: 0 }],
    ]);
    expect(findClaudePidsFromTree(tree)).toHaveLength(0);
  });

  it("does not match partial names like claude-code", () => {
    const tree = new Map<number, ProcessTreeEntry>([[100, { ppid: 50, comm: "claude-code", cpuPercent: 0 }]]);
    expect(findClaudePidsFromTree(tree)).toHaveLength(0);
  });
});

describe("isOrphaned", () => {
  it("returns false when a known terminal is in the ancestor chain", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [100, { ppid: 200, cpuPercent: 5, comm: "claude" }],
      [200, { ppid: 300, cpuPercent: 0, comm: "zsh" }],
      [300, { ppid: 1, cpuPercent: 1, comm: "iTerm2" }],
    ]);
    expect(isOrphaned(100, tree, false)).toBe(false);
  });

  it("returns true when no known terminal is in the ancestor chain", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [100, { ppid: 200, cpuPercent: 5, comm: "claude" }],
      [200, { ppid: 1, cpuPercent: 0, comm: "zsh" }],
    ]);
    expect(isOrphaned(100, tree, false)).toBe(true);
  });

  it("returns false when session is in tmux (even without terminal ancestor)", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [100, { ppid: 200, cpuPercent: 5, comm: "claude" }],
      [200, { ppid: 1, cpuPercent: 0, comm: "zsh" }],
    ]);
    expect(isOrphaned(100, tree, true)).toBe(false);
  });

  it("returns false when pid is not in the tree", () => {
    const tree = new Map<number, ProcessTreeEntry>();
    expect(isOrphaned(999, tree, false)).toBe(false);
  });

  it("returns false when sshd is in the ancestor chain (SSH session)", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [100, { ppid: 200, cpuPercent: 5, comm: "claude" }],
      [200, { ppid: 300, cpuPercent: 0, comm: "bash" }],
      [300, { ppid: 1, cpuPercent: 0, comm: "sshd" }],
    ]);
    expect(isOrphaned(100, tree, false)).toBe(false);
  });

  it("returns true when ancestor chain ends at launchd (PID 1) with no terminal", () => {
    const tree = new Map<number, ProcessTreeEntry>([
      [100, { ppid: 200, cpuPercent: 5, comm: "claude" }],
      [200, { ppid: 1, cpuPercent: 0, comm: "zsh" }],
      [1, { ppid: 0, cpuPercent: 0, comm: "launchd" }],
    ]);
    expect(isOrphaned(100, tree, false)).toBe(true);
  });
});
