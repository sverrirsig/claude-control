#!/usr/bin/env node
/**
 * Claude Control process bridge
 *
 * Run this natively on macOS alongside a containerized claude-control instance.
 * It polls `ps` and `lsof` for running Claude Code processes, then writes the
 * results to ~/.claude-control/processes.json — a path already mounted into the
 * container as a volume — so the container can discover sessions without needing
 * access to the macOS host's PID namespace.
 *
 * Configuration (all optional, read from ~/.claude-control/config.json):
 *   processBridge.enabled    — must be true for the bridge to write output (default: false)
 *   processBridge.intervalMs — poll frequency in ms (default: 1000)
 *   processBridge.maxAgeMs   — ignored here; used by the consumer to detect stale data
 *
 * Usage:
 *   npm run bridge
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const { readFile, writeFile, mkdir } = require("fs/promises");
const { join } = require("path");
const { homedir } = require("os");

const execFileAsync = promisify(execFile);

const CONFIG_DIR = join(homedir(), ".claude-control");
const PROCESSES_FILE = join(CONFIG_DIR, "processes.json");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const PROCESS_TIMEOUT_MS = 5000;
const DEFAULT_INTERVAL_MS = 1000;

async function loadBridgeConfig() {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(raw);
    return config.processBridge ?? {};
  } catch {
    return {};
  }
}

async function findClaudePids() {
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-eo", "pid,ppid,%cpu,comm"],
      { timeout: PROCESS_TIMEOUT_MS }
    );
    const pids = [];
    for (const line of stdout.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.,]+)\s+(.+)$/);
      if (match && match[4].trim() === "claude") {
        pids.push({
          pid: parseInt(match[1], 10),
          cpuPercent: parseFloat(match[3].replace(",", ".")) || 0,
        });
      }
    }
    return pids;
  } catch {
    return [];
  }
}

async function getCwds(pids) {
  if (pids.length === 0) return new Map();
  try {
    const pidList = pids.map((p) => p.pid).join(",");
    const { stdout } = await execFileAsync(
      "lsof",
      ["-p", pidList, "-Fpn", "-d", "cwd"],
      { timeout: PROCESS_TIMEOUT_MS }
    );
    const cwds = new Map();
    let currentPid = null;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("p")) {
        currentPid = parseInt(line.slice(1), 10);
      } else if (line.startsWith("n") && currentPid !== null) {
        cwds.set(currentPid, line.slice(1));
        currentPid = null;
      }
    }
    return cwds;
  } catch {
    return new Map();
  }
}

async function poll(bridgeConfig) {
  if (bridgeConfig.enabled === false) return;

  const pids = await findClaudePids();
  const cwds = await getCwds(pids);

  const processes = pids
    .map(({ pid, cpuPercent }) => ({
      pid,
      cwd: cwds.get(pid) ?? null,
      cpuPercent,
    }))
    .filter((p) => p.cwd !== null);

  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(PROCESSES_FILE, JSON.stringify({ timestamp: Date.now(), processes }));
}

async function main() {
  const bridgeConfig = await loadBridgeConfig();

  if (bridgeConfig.enabled === false) {
    console.error(
      'Process bridge is disabled. Set processBridge.enabled = true in ~/.claude-control/config.json'
    );
    process.exit(1);
  }

  const intervalMs = bridgeConfig.intervalMs ?? DEFAULT_INTERVAL_MS;
  console.log(`claude-control bridge running (interval: ${intervalMs}ms)`);
  console.log(`Output: ${PROCESSES_FILE}`);

  await poll(bridgeConfig).catch(console.error);
  setInterval(() => poll(bridgeConfig).catch(console.error), intervalMs);
}

main().catch((err) => {
  console.error("Bridge error:", err);
  process.exit(1);
});
