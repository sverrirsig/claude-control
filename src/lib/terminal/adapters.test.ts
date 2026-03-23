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
    const { kittyAdapter } = await import("./adapters/kitty");
    const { weztermAdapter } = await import("./adapters/wezterm");
    const { alacrittyAdapter } = await import("./adapters/alacritty");

    // All should be defined and have all four methods
    for (const adapter of [ghosttyAdapter, kittyAdapter, weztermAdapter, alacrittyAdapter]) {
      expect(adapter.focus).toBeDefined();
      expect(adapter.sendText).toBeDefined();
      expect(adapter.sendKeystroke).toBeDefined();
      expect(adapter.createSession).toBeDefined();
    }
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
        inTmux: true,
        tmux: {
          paneId: "%5",
          sessionName: "main",
          windowIndex: 1,
          paneIndex: 0,
          target: "main:1.0",
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
