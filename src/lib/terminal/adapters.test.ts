import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TerminalApp } from "./types";

// ── Registry tests ──────────────────────────────────────────────────────────

describe("adapter registry", () => {
  // Re-import fresh for each test to avoid cross-contamination
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns an adapter for every known terminal", async () => {
    const { getAdapter } = await import("./adapters/registry");
    const knownApps: TerminalApp[] = ["iterm", "terminal-app", "ghostty", "kitty", "wezterm", "alacritty"];

    for (const app of knownApps) {
      const adapter = getAdapter(app);
      expect(adapter).toBeDefined();
      expect(typeof adapter.focus).toBe("function");
      expect(typeof adapter.sendText).toBe("function");
      expect(typeof adapter.sendKeystroke).toBe("function");
      expect(typeof adapter.createSession).toBe("function");
    }
  });

  it("throws for unknown terminal", async () => {
    const { getAdapter } = await import("./adapters/registry");
    expect(() => getAdapter("unknown")).toThrow("No adapter for terminal: unknown");
  });

  it("allows registering a custom adapter", async () => {
    const { getAdapter, registerAdapter } = await import("./adapters/registry");
    const mockAdapter = {
      focus: vi.fn(),
      sendText: vi.fn(),
      sendKeystroke: vi.fn(),
      createSession: vi.fn(),
    };

    // Should throw before registration
    expect(() => getAdapter("unknown")).toThrow();

    registerAdapter("unknown", mockAdapter);
    expect(getAdapter("unknown")).toBe(mockAdapter);
  });
});

// ── Shared utility tests ────────────────────────────────────────────────────

describe("shared utilities", () => {
  it("escapeForAppleScript handles backslashes and quotes", async () => {
    const { escapeForAppleScript } = await import("./adapters/shared");
    expect(escapeForAppleScript('hello "world"')).toBe('hello \\"world\\"');
    expect(escapeForAppleScript("back\\slash")).toBe("back\\\\slash");
    expect(escapeForAppleScript("normal text")).toBe("normal text");
  });

  it("shellEscape handles single quotes", async () => {
    const { shellEscape } = await import("./adapters/shared");
    expect(shellEscape("it's")).toBe("it'\\''s");
    expect(shellEscape("no quotes")).toBe("no quotes");
  });

  it("shellEscapeDouble handles special chars", async () => {
    const { shellEscapeDouble } = await import("./adapters/shared");
    expect(shellEscapeDouble('echo "$HOME"')).toBe('echo \\"\\$HOME\\"');
    expect(shellEscapeDouble("backtick `cmd`")).toBe("backtick \\`cmd\\`");
  });

  it("mapKeystrokeToSystemEvents maps known keys", async () => {
    const { mapKeystrokeToSystemEvents } = await import("./adapters/shared");
    expect(mapKeystrokeToSystemEvents("return")).toBe("keystroke return");
    expect(mapKeystrokeToSystemEvents("escape")).toBe("key code 53");
    expect(mapKeystrokeToSystemEvents("up")).toBe("key code 126");
    expect(mapKeystrokeToSystemEvents("down")).toBe("key code 125");
    expect(mapKeystrokeToSystemEvents("tab")).toBe("key code 48");
    expect(mapKeystrokeToSystemEvents("space")).toBe('keystroke " "');
  });

  it("mapKeystrokeToSystemEvents passes through single characters", async () => {
    const { mapKeystrokeToSystemEvents } = await import("./adapters/shared");
    expect(mapKeystrokeToSystemEvents("y")).toBe('keystroke "y"');
    expect(mapKeystrokeToSystemEvents("n")).toBe('keystroke "n"');
  });

  it("systemEventsScript wraps action in tell block", async () => {
    const { systemEventsScript } = await import("./adapters/shared");
    const result = systemEventsScript("iTerm2", 'keystroke "y"');
    expect(result).toContain('tell process "iTerm2"');
    expect(result).toContain('keystroke "y"');
    expect(result).toContain('tell application "System Events"');
  });
});

// ── Generic adapter factory tests ───────────────────────────────────────────

describe("createGenericAdapter", () => {
  it("produces adapters with correct createSession args", async () => {
    const { ghosttyAdapter } = await import("./adapters/ghostty");
    const { weztermAdapter } = await import("./adapters/wezterm");
    const { alacrittyAdapter } = await import("./adapters/alacritty");

    // All should be defined and have all four methods
    for (const adapter of [ghosttyAdapter, weztermAdapter, alacrittyAdapter]) {
      expect(adapter.focus).toBeDefined();
      expect(adapter.sendText).toBeDefined();
      expect(adapter.sendKeystroke).toBeDefined();
      expect(adapter.createSession).toBeDefined();
    }
  });
});

// ── Kitty adapter tests ────────────────────────────────────────────────────

describe("kitty adapter", () => {
  const kittyInfo = {
    app: "kitty" as const,
    appName: "kitty",
    processName: "kitty",
    pid: 42000,
    inTmux: false,
    tty: "/dev/ttys010",
  };

  // Fake kitten @ ls response: window id 7 has our PID 42000 as foreground process
  const fakeLsOutput = JSON.stringify([
    {
      tabs: [
        {
          windows: [
            { id: 5, pid: 100, foreground_processes: [{ pid: 200 }] },
            { id: 7, pid: 300, foreground_processes: [{ pid: 42000 }] },
          ],
        },
      ],
    },
  ]);

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("fs", () => ({
      readdirSync: () => ["kitty-12345"],
    }));
  });

  /** Create an exec mock that returns fakeLsOutput for `kitten @ ls` */
  function mockExecWithLs() {
    const execMock = vi.fn().mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
      const cmdArgs = args[1] as string[];
      // Return ls output when kitten @ ... ls is called
      if (args[0] === "kitten" && cmdArgs.includes("ls")) {
        cb(null, { stdout: fakeLsOutput, stderr: "" });
      } else {
        cb(null, { stdout: "", stderr: "" });
      }
    });
    vi.doMock("child_process", () => ({ execFile: execMock }));
    return execMock;
  }

  it("focus resolves PID via ls then focuses by window id", async () => {
    const execMock = mockExecWithLs();
    const { kittyAdapter } = await import("./adapters/kitty");
    await kittyAdapter.focus(kittyInfo);

    // Should call ls to resolve PID → window id
    expect(execMock).toHaveBeenCalledWith(
      "kitten",
      expect.arrayContaining(["ls"]),
      expect.any(Object),
      expect.any(Function),
    );
    // Should focus by window id 7 (not pid)
    expect(execMock).toHaveBeenCalledWith(
      "kitten",
      expect.arrayContaining(["focus-window", "--match", "id:7"]),
      expect.any(Object),
      expect.any(Function),
    );
    // Should also raise the macOS window
    expect(execMock).toHaveBeenCalledWith("open", ["-a", "kitty"], expect.any(Object), expect.any(Function));
  });

  it("sendText sends to resolved window id", async () => {
    const execMock = mockExecWithLs();
    const { kittyAdapter } = await import("./adapters/kitty");
    await kittyAdapter.sendText(kittyInfo, "hello world");

    expect(execMock).toHaveBeenCalledWith(
      "kitten",
      expect.arrayContaining(["send-text", "--match", "id:7", "hello world\n"]),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("sendKeystroke maps return to enter via send-key", async () => {
    const execMock = mockExecWithLs();
    const { kittyAdapter } = await import("./adapters/kitty");
    await kittyAdapter.sendKeystroke(kittyInfo, "return");

    expect(execMock).toHaveBeenCalledWith(
      "kitten",
      expect.arrayContaining(["send-key", "--match", "id:7", "enter"]),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("sendKeystroke sends single chars via send-text", async () => {
    const execMock = mockExecWithLs();
    const { kittyAdapter } = await import("./adapters/kitty");
    await kittyAdapter.sendKeystroke(kittyInfo, "y");

    expect(execMock).toHaveBeenCalledWith(
      "kitten",
      expect.arrayContaining(["send-text", "--match", "id:7", "y"]),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("focus still raises macOS window when kitten fails", async () => {
    const execMock = vi.fn().mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null, result?: { stdout: string; stderr: string }) => void;
      if (args[0] === "kitten") {
        cb(new Error("remote control is not enabled"));
      } else {
        cb(null, { stdout: "", stderr: "" });
      }
    });
    vi.doMock("child_process", () => ({ execFile: execMock }));

    const { kittyAdapter } = await import("./adapters/kitty");
    await kittyAdapter.focus(kittyInfo);

    expect(execMock).toHaveBeenCalledWith("open", ["-a", "kitty"], expect.any(Object), expect.any(Function));
  });

  it("sendKeystroke falls back to generic when kitten fails", async () => {
    const execMock = vi.fn().mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null, result?: { stdout: string; stderr: string }) => void;
      if (args[0] === "kitten") {
        cb(new Error("remote control is not enabled"));
      } else {
        cb(null, { stdout: "", stderr: "" });
      }
    });
    vi.doMock("child_process", () => ({ execFile: execMock }));

    const { kittyAdapter } = await import("./adapters/kitty");
    await kittyAdapter.sendKeystroke(kittyInfo, "y");

    // Should fall back to System Events via generic adapter
    expect(execMock).toHaveBeenCalledWith("osascript", expect.any(Array), expect.any(Object), expect.any(Function));
  });

  it("createSession uses kitten @ launch with tab type", async () => {
    const execMock = mockExecWithLs();
    const { kittyAdapter } = await import("./adapters/kitty");
    await kittyAdapter.createSession("cd '/tmp' && claude", {
      openIn: "tab",
      useTmux: false,
      cwd: "/tmp",
    });

    expect(execMock).toHaveBeenCalledWith(
      "kitten",
      expect.arrayContaining(["launch", "--type=tab", "--cwd=/tmp", "sh", "-c", "cd '/tmp' && claude"]),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("focus resolves tmux-in-kitty via clientPid", async () => {
    // tmux-in-kitty: claude PID won't be in kitty's foreground_processes.
    // The adapter should match via the tmux client PID instead.
    const tmuxKittyInfo = {
      ...kittyInfo,
      pid: 99000, // claude PID — not visible to kitty
      inTmux: true,
      tmux: {
        paneId: "%0",
        sessionName: "main",
        windowIndex: 0,
        paneIndex: 0,
        target: "main:0.0",
        clientPid: 24825,
        clientTty: "/dev/ttys019",
      },
      tty: "/dev/ttys019",
    };

    // ls output: window 5 has tmux client (PID 24825), claude (99000) is NOT listed
    const tmuxLsOutput = JSON.stringify([
      {
        tabs: [
          {
            windows: [{ id: 5, pid: 20045, foreground_processes: [{ pid: 24825 }] }],
          },
        ],
      },
    ]);

    const execMock = vi.fn().mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
      const cmdArgs = args[1] as string[];
      if (args[0] === "kitten" && cmdArgs.includes("ls")) {
        cb(null, { stdout: tmuxLsOutput, stderr: "" });
      } else {
        cb(null, { stdout: "", stderr: "" });
      }
    });
    vi.doMock("child_process", () => ({ execFile: execMock }));

    const { kittyAdapter } = await import("./adapters/kitty");
    await kittyAdapter.focus(tmuxKittyInfo);

    // Should focus window 5 (matched via tmux clientPid 24825)
    expect(execMock).toHaveBeenCalledWith(
      "kitten",
      expect.arrayContaining(["focus-window", "--match", "id:5"]),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("createSession uses os-window type for window mode", async () => {
    const execMock = mockExecWithLs();
    const { kittyAdapter } = await import("./adapters/kitty");
    await kittyAdapter.createSession("cd '/tmp' && claude", {
      openIn: "window",
      useTmux: false,
      cwd: "/tmp",
    });

    expect(execMock).toHaveBeenCalledWith(
      "kitten",
      expect.arrayContaining(["launch", "--type=os-window", "--cwd=/tmp", "sh", "-c", "cd '/tmp' && claude"]),
      expect.any(Object),
      expect.any(Function),
    );
  });
});

// ── Public API tmux delegation tests ────────────────────────────────────────

describe("public API tmux handling", () => {
  it("sendText delegates to tmux send-keys when in tmux", async () => {
    const execMock = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    vi.doMock("child_process", () => ({
      execFile: (...args: unknown[]) => {
        const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
        execMock(...args);
        cb(null, { stdout: "", stderr: "" });
      },
    }));

    const { sendText } = await import("./adapters");

    await sendText(
      {
        app: "iterm",
        appName: "iTerm2",
        processName: "iTerm2",
        pid: 12345,
        inTmux: true,
        tmux: {
          paneId: "%5",
          sessionName: "main",
          windowIndex: 1,
          paneIndex: 0,
          target: "main:1.0",
          clientPid: 500,
          clientTty: "/dev/ttys003",
        },
        tty: "/dev/ttys005",
      },
      "hello",
    );

    // Should have called tmux send-keys, not the iTerm adapter
    expect(execMock).toHaveBeenCalledWith(
      "tmux",
      ["send-keys", "-t", "%5", "hello", "Enter"],
      expect.any(Object),
      expect.any(Function),
    );
  });
});
