import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ProcessInfo {
  pid: number;
  command: string;
  workingDirectory: string | null;
  cpuPercent: number;
}

export async function findClaudePids(): Promise<number[]> {
  try {
    // Use ps instead of pgrep — pgrep -x is unreliable on macOS and can miss processes
    const { stdout } = await execFileAsync("ps", ["-eo", "pid,comm"], {
      timeout: 5000,
    });
    const pids: number[] = [];
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+)\s+claude$/);
      if (match) {
        pids.push(parseInt(match[1], 10));
      }
    }
    return pids;
  } catch {
    return [];
  }
}

export async function getProcessCommand(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="], {
      timeout: 5000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getProcessCpu(pid: number): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "%cpu="], {
      timeout: 5000,
    });
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

export async function getWorkingDirectory(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("lsof", ["-p", String(pid), "-Fn"], {
      timeout: 5000,
    });
    const lines = stdout.split("\n");
    let foundCwd = false;
    for (const line of lines) {
      if (line === "fcwd") {
        foundCwd = true;
        continue;
      }
      if (foundCwd && line.startsWith("n")) {
        return line.slice(1);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function isCliProcess(pid: number): Promise<boolean> {
  const cmd = await getProcessCommand(pid);
  if (!cmd) return false;
  return !cmd.includes("Claude.app");
}

export async function getProcessInfo(pid: number): Promise<ProcessInfo | null> {
  const [isCli, workingDirectory, cpuPercent] = await Promise.all([
    isCliProcess(pid),
    getWorkingDirectory(pid),
    getProcessCpu(pid),
  ]);

  if (!isCli) return null;

  return {
    pid,
    command: "claude",
    workingDirectory,
    cpuPercent,
  };
}
