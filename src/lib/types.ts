export type ViewMode = "grid" | "list";

export type SessionStatus = "working" | "idle" | "waiting" | "errored" | "finished";

export const statusLabels: Record<SessionStatus, string> = {
  working: "Working",
  idle: "Idle",
  waiting: "Waiting",
  errored: "Error",
  finished: "Finished",
};

export interface ClaudeSession {
  id: string;
  pid: number | null;
  workingDirectory: string;
  repoName: string | null;
  parentRepo: string | null;
  isWorktree: boolean;
  branch: string | null;
  status: SessionStatus;
  lastActivity: string;
  startedAt: string | null;
  git: GitSummary | null;
  preview: ConversationPreview;
  taskSummary: TaskSummary | null;
  hasPendingToolUse: boolean;
  jsonlPath: string | null;
  prUrl: string | null;
  orphaned: boolean;
  tmuxSession: string | null;
}

export interface GitSummary {
  branch: string;
  changedFiles: number;
  additions: number;
  deletions: number;
  untrackedFiles: number;
  shortStat: string;
}

export interface ToolInfo {
  name: string;
  input: string | null;
  description: string | null;
  warnings: string[];
}

export interface ConversationPreview {
  lastUserMessage: string | null;
  lastAssistantText: string | null;
  /** Whether the assistant text came after the last user message */
  assistantIsNewer: boolean;
  lastTools: ToolInfo[];
  messageCount: number;
}

export interface TaskSummary {
  title: string;
  description: string | null;
  source: "linear" | "prompt" | "user";
  ticketId: string | null;
  ticketUrl: string | null;
}

export type PrChecks = "passing" | "failing" | "pending" | "none";
export type PrReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;

export interface PrStatus {
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  checks: PrChecks;
  reviewDecision: PrReviewDecision;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: "BEHIND" | "BLOCKED" | "CLEAN" | "DIRTY" | "HAS_HOOKS" | "UNKNOWN" | "UNSTABLE";
  checksDetail?: { total: number; passing: number; failing: number; pending: number };
  unresolvedThreads: number;
  commentCount: number;
}

export interface SessionDetail extends ClaudeSession {
  conversation: ConversationMessage[];
  gitDiff: string | null;
}

export interface ConversationMessage {
  type: "user" | "assistant";
  timestamp: string;
  text: string | null;
  toolUses: { name: string; input?: Record<string, unknown> }[];
}

export interface SessionGroup {
  repoName: string;
  repoPath: string;
  sessions: ClaudeSession[];
}

export interface TerminalEntry {
  sessionId: string;
  workingDirectory: string;
  ptyId: number | null;
  spawnCommand?: string;
  tmuxSession?: string;
  wrapInTmux?: boolean;
  exited: boolean;
}

// ── Kanban Pipeline ──

export interface KanbanColumnInput {
  /** Prompt template sent to the Claude session. Supports {{previousOutput}} interpolation. */
  promptTemplate?: string;
  /** File path to read and inject as context. Resolved relative to repo root. */
  filePath?: string;
  /** Shell script whose stdout becomes additional input. Runs in the repo's working directory. */
  script?: string;
}

export interface KanbanColumnOutput {
  /** How to extract output when a session completes in this column. */
  type: "file" | "script" | "git-diff" | "conversation";
  /** For "file": path to read. For "script": command to run. */
  value?: string;
  /** Optional regex to extract a substring from the raw output. */
  regex?: string;
}

export interface KanbanColumn {
  id: string;
  name: string;
  input?: KanbanColumnInput;
  output?: KanbanColumnOutput;
  /** When true, cards auto-move to the next column when their session becomes idle. */
  autoCascade: boolean;
}

export interface KanbanConfig {
  columns: KanbanColumn[];
}

export interface KanbanCardPlacement {
  sessionId: string;
  columnId: string;
  /** Target column when moved while session is working. Executed when session goes idle. */
  queuedColumnId?: string;
  /** Output extracted when the session last completed in this column. */
  lastOutput?: string;
}

export interface KanbanState {
  placements: KanbanCardPlacement[];
  /** Accumulated outputs per session per column, for passing between pipeline stages. */
  outputHistory: Record<string, Record<string, string>>;
}
