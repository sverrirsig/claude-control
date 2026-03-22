import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { ProcessInfo } from "./process-utils";

const PROCESSES_FILE = join(homedir(), ".claude-control", "processes.json");

interface BridgeFile {
  timestamp: number;
  processes: Array<{ pid: number; cwd: string; cpuPercent: number }>;
}

/**
 * Read process info written by the macOS bridge script.
 * Returns null if the file is absent, unreadable, or older than maxAgeMs —
 * callers should fall back to native ps/lsof in that case.
 */
export async function readBridgeProcesses(
  maxAgeMs: number
): Promise<ProcessInfo[] | null> {
  try {
    const raw = await readFile(PROCESSES_FILE, "utf-8");
    const data: BridgeFile = JSON.parse(raw);

    if (Date.now() - data.timestamp > maxAgeMs) return null;

    return data.processes.map((p) => ({
      pid: p.pid,
      workingDirectory: p.cwd,
      cpuPercent: p.cpuPercent,
    }));
  } catch {
    return null;
  }
}
