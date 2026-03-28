import { describe, it, expect, vi, afterEach } from "vitest";
import { readBridgeProcesses } from "./process-bridge";

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return { ...actual, readFile: vi.fn() };
});

import { readFile } from "fs/promises";

const mockReadFile = readFile as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.resetAllMocks();
});

function bridgePayload(offsetMs: number, processes: Array<{ pid: number; cwd: string; cpuPercent: number }>) {
  return JSON.stringify({ timestamp: Date.now() - offsetMs, processes });
}

describe("readBridgeProcesses", () => {
  it("returns null when processes.json is absent", async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    expect(await readBridgeProcesses(5000)).toBeNull();
  });

  it("returns null when file content is malformed JSON", async () => {
    mockReadFile.mockResolvedValue("not-json");
    expect(await readBridgeProcesses(5000)).toBeNull();
  });

  it("returns null when file is older than maxAgeMs", async () => {
    mockReadFile.mockResolvedValue(bridgePayload(10_000, [{ pid: 1, cwd: "/foo", cpuPercent: 0 }]));
    expect(await readBridgeProcesses(5_000)).toBeNull();
  });

  it("returns process list when file is fresh", async () => {
    mockReadFile.mockResolvedValue(bridgePayload(100, [
      { pid: 42, cwd: "/Users/alli/project", cpuPercent: 1.5 },
      { pid: 99, cwd: "/Users/alli/other", cpuPercent: 0 },
    ]));
    const result = await readBridgeProcesses(5_000);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ pid: 42, workingDirectory: "/Users/alli/project", cpuPercent: 1.5 });
    expect(result![1]).toEqual({ pid: 99, workingDirectory: "/Users/alli/other", cpuPercent: 0 });
  });

  it("returns empty array when processes list is empty but file is fresh", async () => {
    mockReadFile.mockResolvedValue(bridgePayload(0, []));
    const result = await readBridgeProcesses(5_000);
    expect(result).toEqual([]);
  });

  it("maps cwd to workingDirectory", async () => {
    mockReadFile.mockResolvedValue(bridgePayload(0, [{ pid: 7, cwd: "/tmp/work", cpuPercent: 2.0 }]));
    const result = await readBridgeProcesses(5_000);
    expect(result![0].workingDirectory).toBe("/tmp/work");
  });
});
