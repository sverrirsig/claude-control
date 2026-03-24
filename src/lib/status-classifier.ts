import { APPROVAL_SETTLE_MS, WORKING_THRESHOLD_MS } from "./constants";
import { SessionStatus } from "./types";

interface ClassifyInput {
  pid: number | null;
  jsonlMtime: Date | null;
  cpuPercent: number;
  hasError: boolean;
  isAskingForInput: boolean;
  hasPendingToolUse: boolean;
}

export function classifyStatus(input: ClassifyInput): SessionStatus {
  if (input.pid === null) return "finished";
  if (input.hasError) return "errored";

  const now = Date.now();
  const mtime = input.jsonlMtime?.getTime() ?? 0;
  const age = now - mtime;

  const recentWrite = age < WORKING_THRESHOLD_MS;
  const cpuActive = input.cpuPercent > 5;

  // High CPU means Claude is actively working, regardless of what the JSONL says.
  // This handles the case where the user approved/rejected a tool but Claude hasn't
  // written the result to JSONL yet — CPU activity proves it's no longer waiting.
  if ((recentWrite && cpuActive) || input.cpuPercent > 15) return "working";

  // Claude issued a tool_use but no result came back.
  // If the JSONL was written very recently, the tool is likely being auto-executed
  // (the tool_use just appeared and the result hasn't been written yet).
  // Only show "waiting" if the mtime has gone stale, meaning the CLI is actually
  // paused on a permission prompt.
  if (input.hasPendingToolUse) {
    if (age > APPROVAL_SETTLE_MS) return "waiting";
    return "working";
  }

  // Claude's last message asked a question / requested confirmation → waiting
  if (input.isAskingForInput) return "waiting";

  // Process alive but nothing happening → idle (sitting at prompt)
  return "idle";
}
