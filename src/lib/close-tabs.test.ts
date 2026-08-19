import { beforeEach, describe, expect, it, vi } from "vitest";

/** Mock child_process.execFile, recording calls. Pass an error to make every call fail. */
function mockExec(error?: Error) {
  const execMock = vi.fn().mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as (err: Error | null, result?: { stdout: string; stderr: string }) => void;
    if (error) cb(error);
    else cb(null, { stdout: "", stderr: "" });
  });
  vi.doMock("child_process", () => ({ execFile: execMock }));
  return execMock;
}

beforeEach(() => {
  vi.resetModules();
});

describe("closeBrowserTab", () => {
  it("closes the matching tab in Chromium browsers", async () => {
    const execMock = mockExec();
    const { closeBrowserTab } = await import("./close-tabs");

    await closeBrowserTab("Google Chrome", "https://github.com/org/repo/pull/42");

    const call = execMock.mock.calls.find((c) => c[0] === "osascript");
    expect(call).toBeDefined();
    const script = (call![1] as string[])[1];
    expect(script).toContain('tell application "Google Chrome"');
    expect(script).toContain("https://github.com/org/repo/pull/42");
    expect(script).toContain("close aTab");
  });

  it("treats Dia as a Chromium browser", async () => {
    const execMock = mockExec();
    const { closeBrowserTab } = await import("./close-tabs");

    await closeBrowserTab("Dia", "https://github.com/org/repo/pull/42");

    const call = execMock.mock.calls.find((c) => c[0] === "osascript");
    expect(call).toBeDefined();
    const script = (call![1] as string[])[1];
    expect(script).toContain('tell application "Dia"');
  });

  it("does nothing for non-Chromium browsers", async () => {
    const execMock = mockExec();
    const { closeBrowserTab } = await import("./close-tabs");

    await closeBrowserTab("Firefox", "https://github.com/org/repo/pull/42");
    await closeBrowserTab("Safari", "https://github.com/org/repo/pull/42");

    expect(execMock).not.toHaveBeenCalled();
  });

  it("swallows osascript failures", async () => {
    mockExec(new Error("not authorized"));
    const { closeBrowserTab } = await import("./close-tabs");

    await expect(closeBrowserTab("Arc", "https://example.com")).resolves.toBeUndefined();
  });

  it("escapes quotes in the url", async () => {
    const execMock = mockExec();
    const { closeBrowserTab } = await import("./close-tabs");

    await closeBrowserTab("Google Chrome", 'https://example.com/?q="x"');

    const script = (execMock.mock.calls[0][1] as string[])[1];
    expect(script).toContain('\\"x\\"');
  });
});

describe("closeGitGuiTab", () => {
  it("clicks the close button of the window matching the folder name", async () => {
    const execMock = mockExec();
    const { closeGitGuiTab } = await import("./close-tabs");

    await closeGitGuiTab("Fork", "my-repo-feature-x");

    const call = execMock.mock.calls.find((c) => c[0] === "osascript");
    expect(call).toBeDefined();
    const script = (call![1] as string[])[1];
    expect(script).toContain('tell application "System Events"');
    expect(script).toContain('tell process "Fork"');
    expect(script).toContain('is "my-repo-feature-x"');
    expect(script).toContain("close button");
  });

  it("does nothing when no app name is configured", async () => {
    const execMock = mockExec();
    const { closeGitGuiTab } = await import("./close-tabs");

    await closeGitGuiTab("", "my-repo");

    expect(execMock).not.toHaveBeenCalled();
  });

  it("swallows osascript failures (e.g. missing accessibility permission)", async () => {
    mockExec(new Error("osascript is not allowed assistive access"));
    const { closeGitGuiTab } = await import("./close-tabs");

    await expect(closeGitGuiTab("Fork", "my-repo")).resolves.toBeUndefined();
  });
});
