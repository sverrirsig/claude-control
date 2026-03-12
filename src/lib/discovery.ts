import { readdir, stat } from "fs/promises";
import { join } from "path";
import { ClaudeSession, ConversationPreview } from "./types";
import { findClaudePids, getProcessInfo } from "./process-utils";
import { workingDirToProjectDir, repoNameFromPath } from "./paths";
import {
  readJsonlTail,
  readJsonlHead,
  readFullConversation,
  extractSessionId,
  extractStartedAt,
  extractBranch,
  extractPreview,
  extractTaskSummary,
  lastMessageHasError,
  isAskingForInput,
  hasPendingToolUse,
  getJsonlMtime,
  linesToConversation,
} from "./session-reader";
import { getGitSummary, getGitDiff, getMainWorktreePath, getPrUrl } from "./git-info";
import { classifyStatus } from "./status-classifier";
import { SessionDetail } from "./types";

async function findLatestJsonl(projectDir: string): Promise<string | null> {
  try {
    const entries = await readdir(projectDir);
    const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));
    if (jsonlFiles.length === 0) return null;

    let latest: { path: string; mtime: number } | null = null;
    for (const f of jsonlFiles) {
      const fullPath = join(projectDir, f);
      try {
        const s = await stat(fullPath);
        if (!latest || s.mtimeMs > latest.mtime) {
          latest = { path: fullPath, mtime: s.mtimeMs };
        }
      } catch {
        // skip
      }
    }
    return latest?.path ?? null;
  } catch {
    return null;
  }
}

export async function discoverSessions(): Promise<ClaudeSession[]> {
  const pids = await findClaudePids();
  const sessions: ClaudeSession[] = [];

  const processInfos = await Promise.all(pids.map((pid) => getProcessInfo(pid)));

  for (const info of processInfos) {
    if (!info || !info.workingDirectory) continue;

    const projectDir = workingDirToProjectDir(info.workingDirectory);
    const jsonlPath = await findLatestJsonl(projectDir);

    let sessionId = `pid-${info.pid}`;
    let startedAt: string | null = null;
    let branch: string | null = null;
    let preview: ConversationPreview = { lastUserMessage: null, lastAssistantText: null, lastToolName: null, messageCount: 0 };
    let hasError = false;
    let askingForInput = false;
    let pendingToolUse = false;
    let mtime: Date | null = null;
    let lastActivity = new Date().toISOString();

    let taskSummary: ClaudeSession["taskSummary"] = null;

    if (jsonlPath) {
      const [lines, headLines] = await Promise.all([
        readJsonlTail(jsonlPath),
        readJsonlHead(jsonlPath),
      ]);
      mtime = await getJsonlMtime(jsonlPath);
      sessionId = extractSessionId(lines) || sessionId;
      startedAt = extractStartedAt(lines);
      branch = extractBranch(lines);
      preview = extractPreview(lines);
      hasError = lastMessageHasError(lines);
      askingForInput = isAskingForInput(lines);
      pendingToolUse = hasPendingToolUse(lines);
      taskSummary = extractTaskSummary(headLines);
      if (mtime) lastActivity = mtime.toISOString();
    }

    const [git, mainWorktreePath] = await Promise.all([
      getGitSummary(info.workingDirectory),
      getMainWorktreePath(info.workingDirectory),
    ]);

    const resolvedBranch = git?.branch ?? branch;

    // Check for open PR (only if we have a branch name)
    const prUrl = resolvedBranch ? await getPrUrl(info.workingDirectory, resolvedBranch) : null;

    const isWorktree = mainWorktreePath !== null && mainWorktreePath !== info.workingDirectory;
    const parentRepo = isWorktree ? mainWorktreePath : null;

    const status = classifyStatus({
      pid: info.pid,
      jsonlMtime: mtime,
      cpuPercent: info.cpuPercent,
      hasError,
      isAskingForInput: askingForInput,
      hasPendingToolUse: pendingToolUse,
    });

    sessions.push({
      id: sessionId,
      pid: info.pid,
      workingDirectory: info.workingDirectory,
      repoName: repoNameFromPath(info.workingDirectory),
      parentRepo,
      isWorktree,
      branch: resolvedBranch,
      status,
      lastActivity,
      startedAt,
      git,
      preview,
      taskSummary,
      jsonlPath,
      prUrl,
    });
  }

  return sessions;
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const sessions = await discoverSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return null;

  let conversation: SessionDetail["conversation"] = [];
  let gitDiff: string | null = null;

  if (session.jsonlPath) {
    const allLines = await readFullConversation(session.jsonlPath);
    conversation = linesToConversation(allLines);
  }

  gitDiff = await getGitDiff(session.workingDirectory);

  return {
    ...session,
    conversation,
    gitDiff,
  };
}
