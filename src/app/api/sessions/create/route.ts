import { NextResponse } from "next/server";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

interface CreateRequest {
  repoPath: string;
  branchName?: string;
  baseBranch?: string;
  prompt?: string;
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

async function openItermWithClaude(cwd: string, prompt?: string): Promise<void> {
  // Build the shell command, then escape the whole thing for AppleScript string context.
  // In AppleScript, \" is an escaped double quote inside a string.
  let shellCommand = `cd "${cwd}" && claude`;
  if (prompt) {
    // Use single quotes for the prompt in shell to avoid escaping issues
    // Escape any single quotes in the prompt: ' → '\''
    const escaped = prompt.replace(/'/g, "'\\''");
    shellCommand += ` '${escaped}'`;
  }

  // Escape for AppleScript string: backslash → \\, double quote → \"
  const asEscaped = shellCommand.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const script = `
tell application "iTerm"
  activate
  tell current window
    set newTab to (create tab with default profile)
    tell current session of newTab
      write text "${asEscaped}"
    end tell
  end tell
end tell`;

  await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
}

export async function POST(request: Request) {
  try {
    const body: CreateRequest = await request.json();
    const { repoPath, branchName, baseBranch, prompt } = body;

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

    // Open iTerm with claude in the target directory
    await openItermWithClaude(targetPath, prompt);

    return NextResponse.json({ ok: true, path: targetPath });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Create session failed:", msg);
    return NextResponse.json({ error: `Failed to create session: ${msg}` }, { status: 500 });
  }
}
