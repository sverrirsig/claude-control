import { homedir } from "os";
import { join } from "path";

export const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
export const CLAUDE_HISTORY_FILE = join(homedir(), ".claude", "history.jsonl");
export const POLL_INTERVAL_MS = 2000;
export const FINISHED_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const JSONL_TAIL_LINES = 50;
export const GIT_TIMEOUT_MS = 3000;
export const IDLE_THRESHOLD_MS = 60 * 1000;
export const WORKING_THRESHOLD_MS = 10 * 1000;
export const PROCESS_TIMEOUT_MS = 5000;
export const APPLESCRIPT_FOCUS_DELAY_S = 0.2;
