import { SessionStatus } from "./types";
import { WORKING_THRESHOLD_MS } from "./constants";

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

  // Require BOTH recent JSONL write AND meaningful CPU usage to be "working".
  // This prevents false positives from incidental file touches (e.g. focusing the terminal).
  // Exception: high CPU alone (>15%) means Claude is definitely doing work (thinking, before first write).
  if ((recentWrite && cpuActive) || input.cpuPercent > 15) return "working";

  // Claude issued a tool_use but no result came back → waiting for user to approve
  // Only trigger if the session isn't actively working (checked above)
  if (input.hasPendingToolUse) return "waiting";

  // Claude's last message asked a question / requested confirmation → waiting
  if (input.isAskingForInput) return "waiting";

  // Process alive but nothing happening → idle (sitting at prompt)
  return "idle";
}
