// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { SessionCard } from "./SessionCard";
import type { ClaudeSession } from "@/lib/types";

afterEach(cleanup);

vi.mock("./QuickActions", () => ({
  QuickActions: ({ onCleanup }: { onCleanup?: (e: React.MouseEvent) => void }) =>
    onCleanup ? <button title="Clean up" onClick={(e) => onCleanup(e as React.MouseEvent)}>Clean up</button> : null,
}));
vi.mock("./QuickReply", () => ({ QuickReply: () => null }));
vi.mock("./StatusBadge", () => ({ StatusBadge: () => null }));
vi.mock("./GitSummary", () => ({ GitSummary: () => null }));
vi.mock("./PrStatusBadge", () => ({ PrStatusBadge: () => null }));

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    id: "test-id",
    pid: 1234,
    workingDirectory: "/home/user/repo",
    repoName: "my-repo",
    parentRepo: null,
    isWorktree: false,
    branch: "main",
    status: "idle",
    lastActivity: new Date().toISOString(),
    startedAt: null,
    git: null,
    preview: {
      lastUserMessage: null,
      lastAssistantText: null,
      assistantIsNewer: false,
      lastTools: [],
      messageCount: 0,
    },
    taskSummary: null,
    tokenUsage: null,
    hasPendingToolUse: false,
    jsonlPath: null,
    prUrl: null,
    ...overrides,
  };
}

const taskSummary = {
  title: "Fix the login bug",
  description: null,
  source: "user" as const,
  ticketId: null,
  ticketUrl: null,
};

describe("SessionCard — content area selection", () => {
  it("shows task title when idle, taskSummary present, no assistant response yet", () => {
    render(
      <SessionCard
        session={makeSession({
          status: "idle",
          taskSummary,
          preview: {
            lastUserMessage: "fix the login bug",
            lastAssistantText: null,
            assistantIsNewer: false,
            lastTools: [],
            messageCount: 1,
          },
        })}
      />
    );
    expect(screen.getByText("Fix the login bug")).toBeInTheDocument();
  });

  it("shows task title when idle and assistantIsNewer is false", () => {
    render(
      <SessionCard
        session={makeSession({
          status: "idle",
          taskSummary,
          preview: {
            lastUserMessage: "new prompt",
            lastAssistantText: "old reply",
            assistantIsNewer: false,
            lastTools: [],
            messageCount: 2,
          },
        })}
      />
    );
    expect(screen.getByText("Fix the login bug")).toBeInTheDocument();
    expect(screen.queryByText("old reply")).not.toBeInTheDocument();
  });

  it("shows task title when idle and assistantIsNewer is true but lastAssistantText is null", () => {
    render(
      <SessionCard
        session={makeSession({
          status: "idle",
          taskSummary,
          preview: {
            lastUserMessage: "do something",
            lastAssistantText: null,
            assistantIsNewer: true,
            lastTools: [],
            messageCount: 1,
          },
        })}
      />
    );
    expect(screen.getByText("Fix the login bug")).toBeInTheDocument();
  });

  it("shows last assistant response when idle, taskSummary present, assistantIsNewer, and lastAssistantText set", () => {
    render(
      <SessionCard
        session={makeSession({
          status: "idle",
          taskSummary,
          preview: {
            lastUserMessage: "fix the login bug",
            lastAssistantText: "Done! The login bug is fixed.",
            assistantIsNewer: true,
            lastTools: [],
            messageCount: 3,
          },
        })}
      />
    );
    expect(screen.getByText("Done! The login bug is fixed.")).toBeInTheDocument();
    expect(screen.queryByText("Fix the login bug")).not.toBeInTheDocument();
  });

  it("shows last assistant response when finished, taskSummary present, assistantIsNewer, and lastAssistantText set", () => {
    render(
      <SessionCard
        session={makeSession({
          status: "finished",
          taskSummary,
          preview: {
            lastUserMessage: "fix the login bug",
            lastAssistantText: "All done. PR is open.",
            assistantIsNewer: true,
            lastTools: [],
            messageCount: 5,
          },
        })}
      />
    );
    expect(screen.getByText("All done. PR is open.")).toBeInTheDocument();
    expect(screen.queryByText("Fix the login bug")).not.toBeInTheDocument();
  });

  it("shows OutputPreview for working status even when taskSummary is present", () => {
    render(
      <SessionCard
        session={makeSession({
          status: "working",
          taskSummary,
          preview: {
            lastUserMessage: "implement auth",
            lastAssistantText: null,
            assistantIsNewer: false,
            lastTools: [{ name: "Read", input: "src/auth.ts", description: null, warnings: [] }],
            messageCount: 2,
          },
        })}
      />
    );
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.queryByText("Fix the login bug")).not.toBeInTheDocument();
  });
});

describe("SessionCard — worktree cleanup flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const worktreeSession = () =>
    makeSession({
      status: "idle",
      isWorktree: true,
      preview: { lastUserMessage: null, lastAssistantText: null, assistantIsNewer: false, lastTools: [], messageCount: 0 },
    });

  it("shows confirmation bar when cleanup button is clicked", async () => {
    render(<SessionCard session={worktreeSession()} />);
    const cleanup_btn = screen.getByTitle("Clean up");
    fireEvent.click(cleanup_btn);
    expect(await screen.findByText("Remove worktree and session?")).toBeInTheDocument();
  });

  it("hides confirmation bar when Cancel is clicked", async () => {
    render(<SessionCard session={worktreeSession()} />);
    fireEvent.click(screen.getByTitle("Clean up"));
    await screen.findByText("Remove worktree and session?");
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => {
      expect(screen.queryByText("Remove worktree and session?")).not.toBeInTheDocument();
    });
  });

  it("shows cleaned-up state after successful API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    render(<SessionCard session={worktreeSession()} />);
    fireEvent.click(screen.getByTitle("Clean up"));
    await screen.findByText("Remove worktree and session?");
    fireEvent.click(screen.getByText("Confirm"));
    expect(await screen.findByText("Cleaned up")).toBeInTheDocument();
  });

  it("returns to idle state after failed API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    render(<SessionCard session={worktreeSession()} />);
    fireEvent.click(screen.getByTitle("Clean up"));
    await screen.findByText("Remove worktree and session?");
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => {
      expect(screen.queryByText("Remove worktree and session?")).not.toBeInTheDocument();
      expect(screen.queryByText("Cleaned up")).not.toBeInTheDocument();
    });
  });
});
