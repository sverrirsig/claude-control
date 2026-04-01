import { describe, expect, it } from "vitest";
import { flattenGroupedSessions, groupSessions } from "./group-sessions";
import { ClaudeSession } from "./types";

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    id: "sess-1",
    pid: 1234,
    workingDirectory: "/Users/alli/project",
    repoName: "project",
    parentRepo: null,
    isWorktree: false,
    branch: "main",
    status: "idle",
    lastActivity: "2026-01-01T00:00:00Z",
    startedAt: "2026-01-01T00:00:00Z",
    git: null,
    preview: {
      lastUserMessage: null,
      lastAssistantText: null,
      assistantIsNewer: false,
      lastTools: [],
      messageCount: 0,
    },
    hasPendingToolUse: false,
    lastStopReason: null,
    taskSummary: null,
    initialPrompt: null,
    jsonlPath: null,
    prUrl: null,
    orphaned: false,
    tmuxSession: null,
    ...overrides,
  };
}

describe("groupSessions", () => {
  it("returns empty array for no sessions", () => {
    expect(groupSessions([])).toEqual([]);
  });

  it("groups a single session", () => {
    const sessions = [makeSession()];
    const groups = groupSessions(sessions);
    expect(groups).toHaveLength(1);
    expect(groups[0].repoName).toBe("project");
    expect(groups[0].repoPath).toBe("/Users/alli/project");
    expect(groups[0].sessions).toHaveLength(1);
  });

  it("groups sessions by workingDirectory", () => {
    const sessions = [
      makeSession({ id: "1", workingDirectory: "/a/repo-a" }),
      makeSession({ id: "2", workingDirectory: "/a/repo-a" }),
      makeSession({ id: "3", workingDirectory: "/b/repo-b" }),
    ];
    const groups = groupSessions(sessions);
    expect(groups).toHaveLength(2);
    expect(groups[0].repoName).toBe("repo-a");
    expect(groups[0].sessions).toHaveLength(2);
    expect(groups[1].repoName).toBe("repo-b");
    expect(groups[1].sessions).toHaveLength(1);
  });

  it("groups worktree sessions by parentRepo", () => {
    const sessions = [
      makeSession({ id: "1", workingDirectory: "/a/repo-a" }),
      makeSession({ id: "2", workingDirectory: "/tmp/worktree-1", parentRepo: "/a/repo-a", isWorktree: true }),
    ];
    const groups = groupSessions(sessions);
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions).toHaveLength(2);
  });

  it("sorts groups by count descending, then name ascending", () => {
    const sessions = [
      makeSession({ id: "1", workingDirectory: "/x/beta" }),
      makeSession({ id: "2", workingDirectory: "/x/alpha" }),
      makeSession({ id: "3", workingDirectory: "/x/alpha" }),
    ];
    const groups = groupSessions(sessions);
    expect(groups[0].repoName).toBe("alpha"); // 2 sessions
    expect(groups[1].repoName).toBe("beta"); // 1 session
  });

  it("sorts alphabetically when counts are equal", () => {
    const sessions = [
      makeSession({ id: "1", workingDirectory: "/x/zebra" }),
      makeSession({ id: "2", workingDirectory: "/x/apple" }),
    ];
    const groups = groupSessions(sessions);
    expect(groups[0].repoName).toBe("apple");
    expect(groups[1].repoName).toBe("zebra");
  });
});

describe("flattenGroupedSessions", () => {
  it("returns empty for no sessions", () => {
    expect(flattenGroupedSessions([])).toEqual([]);
  });

  it("preserves group ordering in flat array", () => {
    const sessions = [
      makeSession({ id: "1", workingDirectory: "/x/beta" }),
      makeSession({ id: "2", workingDirectory: "/x/alpha" }),
      makeSession({ id: "3", workingDirectory: "/x/alpha" }),
    ];
    const flat = flattenGroupedSessions(sessions);
    expect(flat.map((s) => s.id)).toEqual(["2", "3", "1"]);
  });
});
