import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    chmod: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    access: vi.fn().mockResolvedValue(undefined),
  };
});

import { readFile, writeFile, chmod } from "fs/promises";

const mockWriteFile = writeFile as ReturnType<typeof vi.fn>;
const mockChmod = chmod as ReturnType<typeof vi.fn>;
const mockReadFile = readFile as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  (writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (chmod as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("hooks-installer — hook script content", () => {
  it("hook script uses $HOME not a hardcoded container path", async () => {
    const { ensureHooksInstalled } = await import("./hooks-installer");
    await ensureHooksInstalled();

    const scriptWriteCall = mockWriteFile.mock.calls.find(
      (call) => typeof call[0] === "string" && (call[0] as string).endsWith("status-hook.sh")
    );

    expect(scriptWriteCall).toBeDefined();
    const scriptContent = scriptWriteCall![1] as string;

    expect(scriptContent).toContain('EVENTS_DIR="$HOME/.claude-control/events"');
    expect(scriptContent).not.toMatch(/EVENTS_DIR="\/root/);
    expect(scriptContent).not.toMatch(/EVENTS_DIR="\/Users/);
    expect(scriptContent).not.toMatch(/EVENTS_DIR="\/home\//);
  });

  it("hook script creates events dir before writing", async () => {
    const { ensureHooksInstalled } = await import("./hooks-installer");
    await ensureHooksInstalled();

    const scriptWriteCall = mockWriteFile.mock.calls.find(
      (call) => typeof call[0] === "string" && (call[0] as string).endsWith("status-hook.sh")
    );
    const scriptContent = scriptWriteCall![1] as string;

    const mkdirIdx = scriptContent.indexOf("mkdir -p");
    const writeIdx = scriptContent.indexOf('> "$EVENTS_DIR');
    expect(mkdirIdx).toBeLessThan(writeIdx);
  });

  it("hook script is made executable", async () => {
    const { ensureHooksInstalled } = await import("./hooks-installer");
    await ensureHooksInstalled();

    expect(mockChmod).toHaveBeenCalledWith(
      expect.stringContaining("status-hook.sh"),
      0o755
    );
  });

  it("hook script extracts transcript_path from stdin", async () => {
    const { ensureHooksInstalled } = await import("./hooks-installer");
    await ensureHooksInstalled();

    const scriptWriteCall = mockWriteFile.mock.calls.find(
      (call) => typeof call[0] === "string" && (call[0] as string).endsWith("status-hook.sh")
    );
    const scriptContent = scriptWriteCall![1] as string;

    expect(scriptContent).toContain("transcript_path");
    expect(scriptContent).toContain("hook_event_name");
    expect(scriptContent).toContain("session_id");
    expect(scriptContent).toContain("PPID");
  });

  it("registers hook for all required events in settings.json", async () => {
    const { ensureHooksInstalled } = await import("./hooks-installer");
    await ensureHooksInstalled();

    const settingsWriteCall = mockWriteFile.mock.calls.find(
      (call) => typeof call[0] === "string" && (call[0] as string).endsWith("settings.json")
    );

    expect(settingsWriteCall).toBeDefined();
    const written = JSON.parse(settingsWriteCall![1] as string);

    const requiredEvents = ["SessionStart", "SessionEnd", "Stop", "UserPromptSubmit", "PermissionRequest", "SubagentStart", "PostToolUseFailure"];
    for (const event of requiredEvents) {
      expect(written.hooks[event]).toBeDefined();
      expect(written.hooks[event].length).toBeGreaterThan(0);
    }
  });

  it("does not re-register hook if already present in settings", async () => {
    const { homedir } = await import("os");
    const { join } = await import("path");
    const actualHookPath = join(homedir(), ".claude-control", "hooks", "status-hook.sh");

    const existingSettings = {
      hooks: {
        Stop: [{ matcher: "", hooks: [{ command: actualHookPath, type: "command", timeout: 5, async: true }] }],
      },
    };
    mockReadFile.mockResolvedValue(JSON.stringify(existingSettings));

    const { ensureHooksInstalled } = await import("./hooks-installer");
    await ensureHooksInstalled();

    const settingsWriteCall = mockWriteFile.mock.calls.find(
      (call) => typeof call[0] === "string" && (call[0] as string).endsWith("settings.json")
    );
    if (settingsWriteCall) {
      const written = JSON.parse(settingsWriteCall![1] as string);
      const stopEntries = written.hooks.Stop as Array<{ hooks: Array<{ command: string }> }>;
      const hookCommands = stopEntries.flatMap((e) => e.hooks.map((h) => h.command));
      const hookOccurrences = hookCommands.filter((c) => c.includes("status-hook.sh"));
      expect(hookOccurrences.length).toBe(1);
    }
  });
});
