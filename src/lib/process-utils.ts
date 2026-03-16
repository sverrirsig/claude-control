import { execFile } from "child_process";
import { promisify } from "util";
import type { ProcessTreeEntry } from "./terminal/types";
import { PROCESS_TIMEOUT_MS } from "./constants";

const execFileAsync = promisify(execFile);

export interface ProcessInfo {
  pid: number;
  workingDirectory: string | null;
  cpuPercent: number;
}

/**
 * Get working directories for multiple PIDs in a single `lsof` call.
 * Uses `-Fpn -d cwd` for parseable output filtered to cwd entries only.
 * Output format: p<pid>\nfcwd\nn<path> per process — `f` lines are
 * intentionally skipped since we only need `p` (PID) and `n` (path).
 */
export async function getBatchWorkingDirectories(
  pids: number[]
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (pids.length === 0) return result;
  try {
    const { stdout } = await execFileAsync(
      "lsof",
      ["-p", pids.join(","), "-Fpn", "-d", "cwd"],
      { timeout: PROCESS_TIMEOUT_MS }
    );
    let currentPid: number | null = null;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("p")) {
        currentPid = parseInt(line.slice(1), 10);
      } else if (line.startsWith("n") && currentPid !== null) {
        result.set(currentPid, line.slice(1));
        currentPid = null;
      }
    }
  } catch {
    /* ignore — PIDs may have exited */
  }
  return result;
}

/**
 * Build ProcessInfo for all given PIDs using the process tree + one lsof call.
 * The tree (from buildProcessTree) provides comm and %cpu; lsof provides cwds.
 * Since findClaudePidsFromTree already filters by `comm === "claude"`, the
 * Claude.app desktop process (comm "Claude" or "Electron") never reaches here.
 */
export async function getAllProcessInfos(
  pids: number[],
  processTree: Map<number, ProcessTreeEntry>
): Promise<ProcessInfo[]> {
  if (pids.length === 0) return [];

  const cwds = await getBatchWorkingDirectories(pids);

  const results: ProcessInfo[] = [];
  for (const pid of pids) {
    const entry = processTree.get(pid);
    if (!entry) continue;

    results.push({
      pid,
      workingDirectory: cwds.get(pid) ?? null,
      cpuPercent: entry.cpuPercent,
    });
  }
  return results;
}
