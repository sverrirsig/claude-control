import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface CleanupRequest {
  pid: number | null;
  workingDirectory: string;
}

async function killProcess(pid: number): Promise<void> {
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

async function removeWorktree(worktreeDir: string): Promise<void> {
  // Find the main repo that owns this worktree
  const { stdout } = await execFileAsync("git", ["-C", worktreeDir, "worktree", "list", "--porcelain"], {
    timeout: 5000,
  });

  // First "worktree" line is the main repo
  const match = stdout.match(/^worktree (.+)$/m);
  if (!match) {
    throw new Error("Could not determine main worktree");
  }
  const mainRepo = match[1];

  // Don't delete the main repo!
  if (mainRepo === worktreeDir) {
    throw new Error("Cannot clean up the main repository — only worktrees");
  }

  // Remove the worktree (--force handles dirty working trees)
  await execFileAsync("git", ["-C", mainRepo, "worktree", "remove", worktreeDir, "--force"], {
    timeout: 10000,
  });

  // Prune any stale worktree references
  await execFileAsync("git", ["-C", mainRepo, "worktree", "prune"], {
    timeout: 5000,
  });
}

async function deleteBranch(worktreeDir: string, branch: string): Promise<void> {
  // Get the main repo path
  const { stdout } = await execFileAsync("git", ["-C", worktreeDir, "worktree", "list", "--porcelain"], {
    timeout: 5000,
  });
  const match = stdout.match(/^worktree (.+)$/m);
  if (!match) return;
  const mainRepo = match[1];

  try {
    await execFileAsync("git", ["-C", mainRepo, "branch", "-D", branch], { timeout: 5000 });
  } catch {
    // Branch may already be deleted or not exist locally
  }
}

export async function POST(request: Request) {
  try {
    const body: CleanupRequest = await request.json();
    const { pid, workingDirectory } = body;

    if (!workingDirectory) {
      return NextResponse.json({ error: "Missing workingDirectory" }, { status: 400 });
    }

    // Get the branch name before we tear things down
    let branch: string | null = null;
    try {
      const { stdout } = await execFileAsync("git", ["-C", workingDirectory, "rev-parse", "--abbrev-ref", "HEAD"], {
        timeout: 3000,
      });
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
    return NextResponse.json({ error: `Cleanup failed: ${msg}` }, { status: 500 });
  }
}
