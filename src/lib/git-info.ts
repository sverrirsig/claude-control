import { execFile } from "child_process";
import { promisify } from "util";
import { GitSummary } from "./types";
import { GIT_TIMEOUT_MS } from "./constants";

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

export async function getGitSummary(cwd: string): Promise<GitSummary | null> {
  const [branch, porcelain, shortStat] = await Promise.all([
    gitCommand(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    gitCommand(["status", "--porcelain"], cwd),
    gitCommand(["diff", "--shortstat"], cwd),
  ]);

  if (!branch) return null;

  const lines = porcelain.split("\n").filter(Boolean);
  const untrackedFiles = lines.filter((l) => l.startsWith("??")).length;
  const changedFiles = lines.filter((l) => !l.startsWith("??")).length;

  let additions = 0;
  let deletions = 0;
  const statMatch = shortStat.match(/(\d+) insertion/);
  const delMatch = shortStat.match(/(\d+) deletion/);
  if (statMatch) additions = parseInt(statMatch[1], 10);
  if (delMatch) deletions = parseInt(delMatch[1], 10);

  return {
    branch,
    changedFiles,
    additions,
    deletions,
    untrackedFiles,
    shortStat: shortStat || "clean",
  };
}

export async function getGitDiff(cwd: string): Promise<string | null> {
  const diff = await gitCommand(["diff", "--stat"], cwd);
  return diff || null;
}

// Cache: branch → { url, timestamp }
const prUrlCache = new Map<string, { url: string | null; ts: number }>();
const PR_URL_TTL_MS = 60_000;       // 60s for known PR URLs
const PR_URL_NULL_TTL_MS = 30_000;  // 30s for "no PR" results

export async function getPrUrl(cwd: string, branch: string): Promise<string | null> {
  const now = Date.now();
  for (const [key, entry] of prUrlCache) {
    const ttl = entry.url ? PR_URL_TTL_MS : PR_URL_NULL_TTL_MS;
    if (now - entry.ts >= ttl) prUrlCache.delete(key);
  }

  const cached = prUrlCache.get(branch);
  if (cached) return cached.url;

  try {
    const { stdout } = await execFileAsync("gh", ["pr", "view", branch, "--json", "url", "--jq", ".url"], {
      cwd,
      timeout: 5000,
    });
    const url = stdout.trim() || null;
    prUrlCache.set(branch, { url, ts: Date.now() });
    return url;
  } catch {
    prUrlCache.set(branch, { url: null, ts: Date.now() });
    return null;
  }
}

export async function getMainWorktreePath(cwd: string): Promise<string | null> {
  const output = await gitCommand(["worktree", "list", "--porcelain"], cwd);
  if (!output) return null;
  // First "worktree" line is always the main worktree
  const match = output.match(/^worktree (.+)$/m);
  return match ? match[1] : null;
}
