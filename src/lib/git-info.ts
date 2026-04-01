import { execFile } from "child_process";
import { promisify } from "util";
import { GIT_TIMEOUT_MS } from "./constants";
import { GitSummary } from "./types";

const execFileAsync = promisify(execFile);

async function gitCommand(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getGitBranch(cwd: string): Promise<string | null> {
  const branch = await gitCommand(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return branch || null;
}

// TTL cache for git summary — git status doesn't change meaningfully every 2s
const gitSummaryCache = new Map<string, { result: GitSummary | null; ts: number }>();
const GIT_SUMMARY_TTL_MS = 10_000;

export async function getGitSummary(cwd: string): Promise<GitSummary | null> {
  const now = Date.now();
  const cached = gitSummaryCache.get(cwd);
  if (cached && now - cached.ts < GIT_SUMMARY_TTL_MS) {
    return cached.result;
  }

  const [branch, porcelain, shortStat] = await Promise.all([
    gitCommand(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    gitCommand(["status", "--porcelain"], cwd),
    gitCommand(["diff", "--shortstat"], cwd),
  ]);

  if (!branch) {
    gitSummaryCache.set(cwd, { result: null, ts: now });
    return null;
  }

  const lines = porcelain.split("\n").filter(Boolean);
  const untrackedFiles = lines.filter((l) => l.startsWith("??")).length;
  const changedFiles = lines.filter((l) => !l.startsWith("??")).length;

  let additions = 0;
  let deletions = 0;
  const statMatch = shortStat.match(/(\d+) insertion/);
  const delMatch = shortStat.match(/(\d+) deletion/);
  if (statMatch) additions = parseInt(statMatch[1], 10);
  if (delMatch) deletions = parseInt(delMatch[1], 10);

  const result: GitSummary = {
    branch,
    changedFiles,
    additions,
    deletions,
    untrackedFiles,
    shortStat: shortStat || "clean",
  };
  gitSummaryCache.set(cwd, { result, ts: now });
  return result;
}

export async function getGitDiff(cwd: string): Promise<string | null> {
  const diff = await gitCommand(["diff", "--stat"], cwd);
  return diff || null;
}

// Cache: branch → { url, timestamp }
const prUrlCache = new Map<string, { url: string | null; ts: number }>();
const PR_URL_TTL_MS = 60_000; // 60s for known PR URLs
const PR_URL_NULL_TTL_MS = 30_000; // 30s for "no PR" results

export async function getPrUrl(cwd: string, branch: string): Promise<string | null> {
  const cacheKey = `${cwd}::${branch}`;
  const now = Date.now();
  for (const [key, entry] of prUrlCache) {
    const ttl = entry.url ? PR_URL_TTL_MS : PR_URL_NULL_TTL_MS;
    if (now - entry.ts >= ttl) prUrlCache.delete(key);
  }

  const cached = prUrlCache.get(cacheKey);
  if (cached) return cached.url;

  try {
    const { stdout } = await execFileAsync("gh", ["pr", "view", branch, "--json", "url", "--jq", ".url"], {
      cwd,
      timeout: 5000,
    });
    const url = stdout.trim() || null;
    prUrlCache.set(cacheKey, { url, ts: Date.now() });
    return url;
  } catch {
    prUrlCache.set(cacheKey, { url: null, ts: Date.now() });
    return null;
  }
}

// TTL cache for worktree path — essentially static
const worktreeCache = new Map<string, { result: string | null; ts: number }>();
const WORKTREE_TTL_MS = 60_000;

export async function getMainWorktreePath(cwd: string): Promise<string | null> {
  const now = Date.now();
  const cached = worktreeCache.get(cwd);
  if (cached && now - cached.ts < WORKTREE_TTL_MS) {
    return cached.result;
  }

  const output = await gitCommand(["worktree", "list", "--porcelain"], cwd);
  if (!output) {
    // Don't cache failures — retry on next poll
    return null;
  }
  // First "worktree" line is always the main worktree
  const match = output.match(/^worktree (.+)$/m);
  const result = match ? match[1] : null;
  worktreeCache.set(cwd, { result, ts: now });
  return result;
}
