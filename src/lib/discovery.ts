import { readdir, stat } from "fs/promises";
import { join } from "path";
import { ClaudeSession, ConversationPreview } from "./types";
import { ProcessInfo, getAllProcessInfos } from "./process-utils";
import { buildProcessTree, findClaudePidsFromTree } from "./terminal/detect";
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

async function buildSession(info: ProcessInfo): Promise<ClaudeSession | null> {
  if (!info.workingDirectory) return null;

  const projectDir = workingDirToProjectDir(info.workingDirectory);
  const jsonlPath = await findLatestJsonl(projectDir);

  let sessionId = `pid-${info.pid}`;
  let startedAt: string | null = null;
  let branch: string | null = null;
  let preview: ConversationPreview = { lastUserMessage: null, lastAssistantText: null, lastToolName: null, lastToolInput: null, messageCount: 0 };
  let hasError = false;
  let askingForInput = false;
  let pendingToolUse = false;
  let mtime: Date | null = null;
  let lastActivity = new Date().toISOString();
  let taskSummary: ClaudeSession["taskSummary"] = null;

  const [jsonlResult, git, mainWorktreePath] = await Promise.all([
    jsonlPath
      ? Promise.all([readJsonlTail(jsonlPath), readJsonlHead(jsonlPath), getJsonlMtime(jsonlPath)])
      : Promise.resolve(null),
    getGitSummary(info.workingDirectory),
    getMainWorktreePath(info.workingDirectory),
  ]);

  if (jsonlResult) {
    const [lines, headLines, jsonlMtime] = jsonlResult;
    mtime = jsonlMtime;
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

  const resolvedBranch = git?.branch ?? branch;
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

  return {
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
    hasPendingToolUse: pendingToolUse,
    taskSummary,
    jsonlPath,
    prUrl,
  };
}

export async function discoverSessions(): Promise<ClaudeSession[]> {
  // Single ps call builds the full tree (pid, ppid, %cpu, comm) —
  // extract claude PIDs and their CPU% from it, then one lsof for cwds
  const processTree = await buildProcessTree();
  const pids = findClaudePidsFromTree(processTree);
  const processInfos = await getAllProcessInfos(pids, processTree);

  const results = await Promise.all(
    processInfos
      .filter((info) => info.workingDirectory !== null)
      .map((info) => buildSession(info))
  );

  return results.filter((s): s is ClaudeSession => s !== null);
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
