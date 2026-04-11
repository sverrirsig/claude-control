import { execFile } from "child_process";
import { stat } from "fs/promises";
import { NextResponse } from "next/server";
import { promisify } from "util";
import { isClaudeProcess } from "@/lib/process-utils";

const execFileAsync = promisify(execFile);

interface CleanupRequest {
  pid: number | null;
  workingDirectory: string;
}

async function killProcess(pid: number): Promise<void> {
  if (!(await isClaudeProcess(pid))) return;
  try {
    process.kill(pid, "SIGTERM");
    // Give it a moment to exit gracefully
    await new Promise((r) => setTimeout(r, 1000));
    try {
      process.kill(pid, 0); // Check if still alive
      process.kill(pid, "SIGKILL"); // Force kill
    } catch {
      // Already dead — good
    }
  } catch {
    // Process doesn't exist or already dead
  }
}

async function findMainRepo(worktreeDir: string): Promise<string | null> {
  // Try running from the worktree directory itself first
  try {
    await stat(worktreeDir);
    const { stdout } = await execFileAsync(
      "git",
      ["-C", worktreeDir, "worktree", "list", "--porcelain"],
      {
        timeout: 5000,
      },
    );
    const match = stdout.match(/^worktree (.+)$/m);
    if (match) return match[1];
  } catch {
    // Directory doesn't exist or not a git repo — try resolving from the .git file
  }

  // If the directory is gone, try to infer the main repo from the path.
  // Worktrees created by claude-control are siblings: <parent>/<repo>-<branch>
  // The main repo is <parent>/<repo>.
  const dirMatch = worktreeDir.match(/^(.+\/([^/]+?))-[^/]+\/?$/);
  if (dirMatch) {
    const candidateMain = dirMatch[1];
    try {
      await stat(candidateMain);
      const { stdout } = await execFileAsync(
        "git",
        ["-C", candidateMain, "rev-parse", "--git-dir"],
        {
          timeout: 3000,
        },
      );
      if (stdout.trim()) return candidateMain;
    } catch {
      // Not a valid repo
    }
  }

  return null;
}

async function removeWorktree(worktreeDir: string): Promise<void> {
  const mainRepo = await findMainRepo(worktreeDir);
  if (!mainRepo) {
    throw new Error("Could not determine main worktree");
  }

  // Don't delete the main repo!
  if (mainRepo === worktreeDir) {
    throw new Error("Cannot clean up the main repository — only worktrees");
  }

  // Remove the worktree (--force handles dirty working trees)
  await execFileAsync(
    "git",
    ["-C", mainRepo, "worktree", "remove", worktreeDir, "--force"],
    {
      timeout: 10000,
    },
  );

  // Prune any stale worktree references
  await execFileAsync("git", ["-C", mainRepo, "worktree", "prune"], {
    timeout: 5000,
  });
}

async function deleteBranch(
  worktreeDir: string,
  branch: string,
): Promise<void> {
  const mainRepo = await findMainRepo(worktreeDir);
  if (!mainRepo) return;

  try {
    await execFileAsync("git", ["-C", mainRepo, "branch", "-D", branch], {
      timeout: 5000,
    });
  } catch {
    // Branch may already be deleted or not exist locally
  }
}

export async function POST(request: Request) {
  try {
    const body: CleanupRequest = await request.json();
    const { pid, workingDirectory } = body;

    if (!workingDirectory) {
      return NextResponse.json(
        { error: "Missing workingDirectory" },
        { status: 400 },
      );
    }

    // Get the branch name before we tear things down
    let branch: string | null = null;
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["-C", workingDirectory, "rev-parse", "--abbrev-ref", "HEAD"],
        {
          timeout: 3000,
        },
      );
      branch = stdout.trim() || null;
    } catch {
      // Can't determine branch
    }

    // Step 1: Kill the Claude process
    if (pid) {
      await killProcess(pid);
    }

    // Step 2: Remove the worktree
    try {
      await removeWorktree(workingDirectory);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Step 3: Delete the local branch
    if (branch) {
      await deleteBranch(workingDirectory, branch);
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Cleanup failed:", msg);
    return NextResponse.json(
      { error: `Cleanup failed: ${msg}` },
      { status: 500 },
    );
  }
}
