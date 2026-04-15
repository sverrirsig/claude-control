import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isSessionStale } from "./stale";

describe("isSessionStale", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when activity is just inside the threshold", () => {
    // 89 minutes ago, threshold 90
    const lastActivity = new Date("2026-04-15T10:31:00Z").toISOString();
    expect(isSessionStale(lastActivity, 90)).toBe(false);
  });

  it("returns false when activity is exactly at the threshold", () => {
    // exactly 90 minutes ago
    const lastActivity = new Date("2026-04-15T10:30:00Z").toISOString();
    expect(isSessionStale(lastActivity, 90)).toBe(false);
  });

  it("returns true when activity is just past the threshold", () => {
    // 91 minutes ago
    const lastActivity = new Date("2026-04-15T10:29:00Z").toISOString();
    expect(isSessionStale(lastActivity, 90)).toBe(true);
  });

  it("returns false for activity in the future (clock skew)", () => {
    const lastActivity = new Date("2026-04-15T13:00:00Z").toISOString();
    expect(isSessionStale(lastActivity, 90)).toBe(false);
  });

  it("respects a smaller threshold", () => {
    const lastActivity = new Date("2026-04-15T11:50:00Z").toISOString(); // 10 min ago
    expect(isSessionStale(lastActivity, 5)).toBe(true);
    expect(isSessionStale(lastActivity, 15)).toBe(false);
  });
});
