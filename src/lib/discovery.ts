import { readdir, stat } from "fs/promises";
import { join } from "path";
import { ClaudeSession, ConversationPreview } from "./types";
import { ProcessInfo, getAllProcessInfos } from "./process-utils";
import { buildProcessTree, findClaudePidsFromTree } from "./terminal/detect";
import { readBridgeProcesses } from "./process-bridge";
import { loadConfig } from "./config";
import { normalizeHostPath } from "./paths";
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
  readTokenUsage,
} from "./session-reader";
import { getGitSummary, getGitDiff, getMainWorktreePath, getPrUrl } from "./git-info";
import { classifyStatus } from "./status-classifier";
import { WORKING_THRESHOLD_MS } from "./constants";
import { readAllHookStatuses, type HookStatus } from "./hooks-reader";
import { loadSessionMeta } from "./session-meta";
import { SessionDetail } from "./types";

async function findLatestJsonl(
  projectDir: string,
  excludePaths?: Set<string>,
): Promise<string | null> {
  try {
    const entries = await readdir(projectDir);
    const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));
    if (jsonlFiles.length === 0) return null;

    let latest: { path: string; mtime: number } | null = null;
    for (const f of jsonlFiles) {
      const fullPath = join(projectDir, f);
      if (excludePaths?.has(fullPath)) continue;
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

async function buildSession(
  info: ProcessInfo,
  hookStatus: HookStatus | undefined,
  claimedPaths: Set<string>,
): Promise<ClaudeSession | null> {
  const workingDirectory = normalizeHostPath(info.workingDirectory);
  if (!workingDirectory) return null;

  const projectDir = workingDirToProjectDir(workingDirectory);
  const jsonlPath = hookStatus?.transcriptPath
    ?? await findLatestJsonl(projectDir, claimedPaths);

  let sessionId = `pid-${info.pid}`;
  let startedAt: string | null = null;
  let branch: string | null = null;
  let preview: ConversationPreview = { lastUserMessage: null, lastAssistantText: null, assistantIsNewer: false, lastTools: [], messageCount: 0 };
  let hasError = false;
  let askingForInput = false;
  let pendingToolUse = false;
  let mtime: Date | null = null;
  let lastActivity = new Date().toISOString();
  let taskSummary: ClaudeSession["taskSummary"] = null;

  const [jsonlResult, tokenUsage, git, mainWorktreePath] = await Promise.all([
    jsonlPath
      ? Promise.all([readJsonlTail(jsonlPath), readJsonlHead(jsonlPath), getJsonlMtime(jsonlPath)])
      : Promise.resolve(null),
    jsonlPath ? readTokenUsage(jsonlPath) : Promise.resolve(null),
    getGitSummary(workingDirectory),
    getMainWorktreePath(workingDirectory),
  ]);

  if (jsonlResult) {
    const [lines, headLines, jsonlMtime] = jsonlResult;
    mtime = jsonlMtime;
    sessionId = hookStatus?.sessionId ?? extractSessionId(lines) ?? sessionId;
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
  const skipPrLookup = !resolvedBranch || resolvedBranch === "main" || resolvedBranch === "master";
  const prUrl = skipPrLookup ? null : await getPrUrl(workingDirectory, resolvedBranch);

  const isWorktree = mainWorktreePath !== null && mainWorktreePath !== workingDirectory;
  const parentRepo = isWorktree ? mainWorktreePath : null;

  // Hooks provide authoritative working/idle/finished status.
  // "Waiting" is detected by the heuristic classifier via JSONL (hasPendingToolUse +
  // APPROVAL_SETTLE_MS), because PermissionRequest hooks fire for auto-approved tools too.
  // If the hook status is available (and not null, meaning PermissionRequest was ignored),
  // use it; otherwise fall back to the heuristic classifier.
  //
  // Exception: a "working" hook status is only trusted if the event file was written
  // recently. If it is stale (e.g. the Stop hook never fired because hooks are not
  // installed in a containerized environment), fall back to the classifier so sessions
  // don't permanently show "working" after Claude has gone idle.
  let hookDerivedStatus = hookStatus?.status ?? null;
  if (
    hookDerivedStatus === "working" &&
    hookStatus &&
    Date.now() - hookStatus.fileMtime > WORKING_THRESHOLD_MS * 3
  ) {
    hookDerivedStatus = null;
  }

  const status: ClaudeSession["status"] = hookDerivedStatus
    ?? classifyStatus({
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
    workingDirectory,
    repoName: repoNameFromPath(workingDirectory),
    parentRepo,
    isWorktree,
    branch: resolvedBranch,
    status,
    lastActivity,
    startedAt,
    git,
    preview,
    tokenUsage,
    hasPendingToolUse: pendingToolUse,
    taskSummary,
    jsonlPath,
    prUrl,
  };
}

async function getNativeProcessInfos(): Promise<ProcessInfo[]> {
  const processTree = await buildProcessTree();
  const pids = findClaudePidsFromTree(processTree);
  return getAllProcessInfos(pids, processTree);
}

export async function discoverSessions(): Promise<ClaudeSession[]> {
  const [config, hookStatuses, meta] = await Promise.all([
    loadConfig(),
    readAllHookStatuses(),
    loadSessionMeta(),
  ]);

  let processInfos: ProcessInfo[];
  if (config.processBridge.enabled) {
    processInfos =
      (await readBridgeProcesses(config.processBridge.maxAgeMs)) ??
      (await getNativeProcessInfos());
  } else {
    processInfos = await getNativeProcessInfos();
  }

  // Collect transcript paths claimed by hook events so fallback doesn't reuse them
  const claimedPaths = new Set<string>();
  const activePids = new Set(processInfos.map((p) => p.pid));
  for (const [pid, hook] of hookStatuses) {
    if (hook.transcriptPath && activePids.has(pid)) {
      claimedPaths.add(hook.transcriptPath);
    }
  }

  const results = await Promise.all(
    processInfos
      .filter((info) => info.workingDirectory !== null)
      .map((info) => buildSession(info, hookStatuses.get(info.pid), claimedPaths))
  );

  const sessions = results.filter((s): s is ClaudeSession => s !== null);

  // Merge user-provided title/description overrides
  for (const session of sessions) {
    const overrides = meta[session.id];
    if (!overrides) continue;
    if (!session.taskSummary) {
      session.taskSummary = { title: "", description: null, source: "user", ticketId: null, ticketUrl: null };
    }
    if (overrides.title !== undefined) {
      session.taskSummary.title = overrides.title;
      session.taskSummary.source = "user";
    }
    if (overrides.description !== undefined) {
      session.taskSummary.description = overrides.description;
    }
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
