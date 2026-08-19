import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("loadConfig cleanupCloseTabs", () => {
  it("defaults to false when no config file exists", async () => {
    vi.doMock("fs/promises", () => ({
      readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    }));
    const { loadConfig } = await import("./config");

    const config = await loadConfig();

    expect(config.cleanupCloseTabs).toBe(false);
  });

  it("preserves a stored true value", async () => {
    vi.doMock("fs/promises", () => ({
      readFile: vi.fn().mockResolvedValue(JSON.stringify({ cleanupCloseTabs: true })),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    }));
    const { loadConfig } = await import("./config");

    const config = await loadConfig();

    expect(config.cleanupCloseTabs).toBe(true);
  });
});
