import { execFile } from "child_process";
import { stat } from "fs/promises";
import { NextResponse } from "next/server";
import { promisify } from "util";
import { loadConfig } from "@/lib/config";
import { invalidateSessionCache } from "@/lib/discovery";
import { createSession } from "@/lib/terminal";

const execFileAsync = promisify(execFile);

interface CreateRequest {
  repoPath: string;
  branchName?: string;
  baseBranch?: string;
  prompt?: string;
  tmuxSession?: string;
}

async function createWorktree(repoPath: string, branchName: string, baseBranch?: string): Promise<string> {
  // Determine worktree location — sibling to the repo
  const parentDir = repoPath.replace(/\/[^/]+\/?$/, "");
  const repoName = repoPath.split("/").filter(Boolean).pop() || "repo";
  const worktreePath = `${parentDir}/${repoName}-${branchName}`;

  // Check if worktree path already exists
  try {
    await stat(worktreePath);
    // Already exists — just use it
    return worktreePath;
  } catch {
    // Doesn't exist — create it
  }

  try {
    // Try creating with a new branch, optionally based on a specific branch
    // git worktree add <path> -b <new-branch> [<base-branch>]
    const args = ["-C", repoPath, "worktree", "add", worktreePath, "-b", branchName];
    if (baseBranch) args.push(baseBranch);
    await execFileAsync("git", args, { timeout: 15000 });
  } catch {
    // Branch might already exist — try checking it out in the worktree instead
    await execFileAsync("git", ["-C", repoPath, "worktree", "add", worktreePath, branchName], {
      timeout: 15000,
    });
  }

  return worktreePath;
}

function projectNameFromPath(repoPath: string): string {
  return repoPath.split("/").filter(Boolean).pop() || "claude";
}

async function openTerminalWithClaude(
  cwd: string,
  repoPath: string,
  prompt?: string,
  tmuxSessionOverride?: string,
): Promise<void> {
  const config = await loadConfig();

  // Determine tmux session name:
  // - explicit override from UI (choose mode) takes priority
  // - "per-project" mode uses the project name
  // - otherwise no named session
  let tmuxSession: string | undefined;
  if (config.terminalUseTmux) {
    if (tmuxSessionOverride) {
      tmuxSession = tmuxSessionOverride;
    } else if (config.terminalTmuxMode === "per-project") {
      tmuxSession = projectNameFromPath(repoPath);
    }
  }

  await createSession({
    terminalApp: config.terminalApp,
    openIn: config.terminalOpenIn,
    useTmux: config.terminalUseTmux,
    tmuxSession,
    cwd,
    prompt,
  });
}

export async function POST(request: Request) {
  try {
    const body: CreateRequest = await request.json();
    const { repoPath, branchName, baseBranch, prompt, tmuxSession } = body;

    if (!repoPath) {
      return NextResponse.json({ error: "Missing repoPath" }, { status: 400 });
    }

    // Verify the repo exists
    try {
      await stat(repoPath);
    } catch {
      return NextResponse.json({ error: "Repository path does not exist" }, { status: 404 });
    }

    let targetPath = repoPath;

    // If a branch name is provided, create a worktree
    if (branchName) {
      try {
        targetPath = await createWorktree(repoPath, branchName, baseBranch);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: `Failed to create worktree: ${msg}` }, { status: 500 });
      }
    }

    // Open terminal with claude in the target directory
    await openTerminalWithClaude(targetPath, repoPath, prompt, tmuxSession);

    // Invalidate server cache so the next poll picks up the new session immediately
    invalidateSessionCache();

    return NextResponse.json({ ok: true, path: targetPath });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Create session failed:", msg);
    return NextResponse.json({ error: `Failed to create session: ${msg}` }, { status: 500 });
  }
}
