import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { classifyStatus } from "./status-classifier";
import { APPROVAL_SETTLE_MS, WORKING_THRESHOLD_MS } from "./constants";

function makeInput(
  overrides: Partial<{
    pid: number | null;
    jsonlMtime: Date | null;
    cpuPercent: number;
    hasError: boolean;
    isAskingForInput: boolean;
    hasPendingToolUse: boolean;
  }> = {},
) {
  return {
    pid: 1234,
    jsonlMtime: new Date(),
    cpuPercent: 0,
    hasError: false,
    isAskingForInput: false,
    hasPendingToolUse: false,
    ...overrides,
  };
}

describe("classifyStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns finished when pid is null", () => {
    expect(classifyStatus(makeInput({ pid: null }))).toBe("finished");
  });

  it("returns errored when hasError is true", () => {
    expect(classifyStatus(makeInput({ hasError: true }))).toBe("errored");
  });

  it("returns working when recent write and CPU active", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: new Date("2026-01-01T00:00:00.000Z"),
          cpuPercent: 10,
        }),
      ),
    ).toBe("working");
  });

  it("returns working when CPU is high regardless of mtime", () => {
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: new Date("2026-01-01T00:00:00.000Z"),
          cpuPercent: 20,
        }),
      ),
    ).toBe("working");
  });

  // Boundary: cpuPercent <= 5 is NOT considered "active"
  it("returns idle when CPU is exactly 5 and stale mtime", () => {
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: new Date("2026-01-01T00:00:00.000Z"),
          cpuPercent: 5,
        }),
      ),
    ).toBe("idle");
  });

  it("returns working when CPU is 6 and recent write", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: new Date("2026-01-01T00:00:00.000Z"),
          cpuPercent: 6,
        }),
      ),
    ).toBe("working");
  });

  // Boundary: cpuPercent <= 15 without recent write is NOT "working"
  it("returns idle when CPU is exactly 15 and stale mtime", () => {
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: new Date("2026-01-01T00:00:00.000Z"),
          cpuPercent: 15,
        }),
      ),
    ).toBe("idle");
  });

  it("returns working when CPU is 16 regardless of mtime", () => {
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: new Date("2026-01-01T00:00:00.000Z"),
          cpuPercent: 16,
        }),
      ),
    ).toBe("working");
  });

  // Boundary: age === WORKING_THRESHOLD_MS is NOT considered "recent"
  it("returns idle at exact mtime threshold boundary with moderate CPU", () => {
    const now = new Date("2026-01-01T00:00:10.000Z");
    vi.setSystemTime(now);
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: new Date(now.getTime() - WORKING_THRESHOLD_MS),
          cpuPercent: 10,
        }),
      ),
    ).toBe("idle");
  });

  it("returns waiting when pending tool use with stale mtime", () => {
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: new Date("2026-01-01T00:00:00.000Z"),
          hasPendingToolUse: true,
        }),
      ),
    ).toBe("waiting");
  });

  it("returns working when pending tool use with fresh mtime (auto-approved)", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(new Date(base.getTime() + APPROVAL_SETTLE_MS - 1000));
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: base,
          hasPendingToolUse: true,
        }),
      ),
    ).toBe("working");
  });

  it("returns waiting when pending tool use with mtime past settle threshold", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(new Date(base.getTime() + APPROVAL_SETTLE_MS + 1000));
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: base,
          hasPendingToolUse: true,
        }),
      ),
    ).toBe("waiting");
  });

  it("returns waiting when asking for input", () => {
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: new Date("2026-01-01T00:00:00.000Z"),
          isAskingForInput: true,
        }),
      ),
    ).toBe("waiting");
  });

  it("returns idle as default when alive with no activity", () => {
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    expect(
      classifyStatus(
        makeInput({
          jsonlMtime: new Date("2026-01-01T00:00:00.000Z"),
        }),
      ),
    ).toBe("idle");
  });

  it("returns idle when null mtime and low CPU", () => {
    expect(classifyStatus(makeInput({ jsonlMtime: null }))).toBe("idle");
  });

  // Priority ordering tests
  it("prioritizes errored over working", () => {
    expect(classifyStatus(makeInput({ hasError: true, cpuPercent: 50 }))).toBe("errored");
  });

  it("prioritizes finished over errored", () => {
    expect(classifyStatus(makeInput({ pid: null, hasError: true }))).toBe("finished");
  });
});
