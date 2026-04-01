import { homedir } from "os";
import { join } from "path";

export const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
export const CLAUDE_HISTORY_FILE = join(homedir(), ".claude", "history.jsonl");
export const POLL_INTERVAL_MS = 3000;
export const FINISHED_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const JSONL_TAIL_LINES = 50;
export const JSONL_HEAD_LINES = 30;
export const HEAD_CHUNK_BYTES_PER_LINE = 2048;
export const TAIL_CHUNK_BYTES_PER_LINE = 4096;
export const PREVIEW_TEXT_MAX_LENGTH = 200;
export const TASK_TITLE_MAX_LENGTH = 120;
export const TASK_DESCRIPTION_MAX_LENGTH = 300;
export const GIT_TIMEOUT_MS = 3000;
export const IDLE_THRESHOLD_MS = 60 * 1000;
export const WORKING_THRESHOLD_MS = 10 * 1000;
export const PROCESS_TIMEOUT_MS = 5000;
export const APPLESCRIPT_FOCUS_DELAY_S = 0.2;
export const APPROVAL_SETTLE_MS = 3000;
export const ORPHAN_CHECK_INTERVAL_MS = 30_000;
/** How long a session must be idle (no JSONL activity) before auto-cascade triggers. */
export const CASCADE_SETTLE_MS = 30_000;
/** How long to wait for a sent prompt to be acknowledged (UserPromptSubmit) before allowing cascade. */
export const PROMPT_CONFIRM_TIMEOUT_MS = 15_000;
/** How long an output prompt can be pending before we force-complete the move. */
export const OUTPUT_PROMPT_TIMEOUT_MS = 5 * 60_000;
/** Delay between the two Escape keystrokes when clearing the message bar (first dismisses dropdowns, second clears text). */
export const CLEAR_INTER_KEY_MS = 150;
/** Settle time after sending Escape to clear the message bar before typing the next prompt. */
export const CLEAR_SETTLE_MS = 300;
