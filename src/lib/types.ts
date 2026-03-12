export type SessionStatus = "working" | "idle" | "waiting" | "errored" | "finished";

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
  jsonlPath: string | null;
  prUrl: string | null;
}

export interface GitSummary {
  branch: string;
  changedFiles: number;
  additions: number;
  deletions: number;
  untrackedFiles: number;
  shortStat: string;
}

export interface ConversationPreview {
  lastUserMessage: string | null;
  lastAssistantText: string | null;
  lastToolName: string | null;
  messageCount: number;
}

export interface TaskSummary {
  title: string;
  description: string | null;
  source: "linear" | "prompt";
  ticketId: string | null;
  ticketUrl: string | null;
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
