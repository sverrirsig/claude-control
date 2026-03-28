import { homedir } from "os";
import { join } from "path";
import { readFile, writeFile, mkdir, chmod, access } from "fs/promises";
import { constants } from "fs";

const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const HOOKS_DIR = join(homedir(), ".claude-control", "hooks");
const EVENTS_DIR = join(homedir(), ".claude-control", "events");
const HOOK_SCRIPT_PATH = join(HOOKS_DIR, "status-hook.sh");

const HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "Stop",
  "UserPromptSubmit",
  "PermissionRequest",
  "SubagentStart",
  "PostToolUseFailure",
] as const;

const HOOK_SCRIPT = `#!/bin/bash
# claude-control status hook — writes session events for real-time status detection
set -e

# Use $HOME so this script works on the host (macOS/Linux) regardless of
# whether the app itself runs in a container with a different home path.
EVENTS_DIR="$HOME/.claude-control/events"
mkdir -p "$EVENTS_DIR"

# Read JSON from stdin
INPUT=$(cat)

# Extract fields using grep/sed (no jq dependency)
HOOK_EVENT=$(echo "$INPUT" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\\([^"]*\\)"$/\\1/')
SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\\([^"]*\\)"$/\\1/')
CWD=$(echo "$INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\\([^"]*\\)"$/\\1/')
TRANSCRIPT=$(echo "$INPUT" | grep -o '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\\([^"]*\\)"$/\\1/')

if [ -z "$SESSION_ID" ] || [ -z "$HOOK_EVENT" ]; then
  exit 0
fi

TS=$(date +%s)

# $PPID = Claude process that invoked this hook (keys the event file by PID)
echo "{\\"event\\":\\"$HOOK_EVENT\\",\\"session_id\\":\\"$SESSION_ID\\",\\"cwd\\":\\"$CWD\\",\\"transcript_path\\":\\"$TRANSCRIPT\\",\\"ts\\":$TS}" > "$EVENTS_DIR/$PPID.json"
`;

let installed: boolean | null = null;

export async function ensureHooksInstalled(): Promise<boolean> {
  if (installed !== null) return installed;

  try {
    // Create directories
    await mkdir(HOOKS_DIR, { recursive: true });
    await mkdir(EVENTS_DIR, { recursive: true });

    // Write hook script
    await writeFile(HOOK_SCRIPT_PATH, HOOK_SCRIPT, "utf-8");
    await chmod(HOOK_SCRIPT_PATH, 0o755);

    // Read existing settings
    let settings: Record<string, unknown> = {};
    try {
      const raw = await readFile(CLAUDE_SETTINGS_PATH, "utf-8");
      settings = JSON.parse(raw);
    } catch {
      // No settings file or invalid JSON — start fresh
    }

    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
    let changed = false;

    for (const event of HOOK_EVENTS) {
      const existing = hooks[event] ?? [];
      // Check if our hook is already registered
      const alreadyRegistered = (existing as Array<{ hooks?: Array<{ command?: string }> }>).some(
        (entry) => entry.hooks?.some((h) => h.command === HOOK_SCRIPT_PATH)
      );

      if (!alreadyRegistered) {
        const matcher = event === "PostToolUseFailure" ? "Bash" : "";
        const newEntry = {
          matcher,
          hooks: [
            {
              type: "command",
              command: HOOK_SCRIPT_PATH,
              timeout: 5,
              async: true,
            },
          ],
        };
        hooks[event] = [...(existing as unknown[]), newEntry];
        changed = true;
      }
    }

    if (changed) {
      // Verify settings.json is writable before attempting write
      try {
        await access(CLAUDE_SETTINGS_PATH, constants.W_OK);
      } catch {
        console.warn("claude-control: settings.json is not writable, hooks not installed");
        installed = false;
        return false;
      }

      settings.hooks = hooks;
      await writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf-8");
    }

    installed = true;
    return true;
  } catch (error) {
    console.warn("claude-control: failed to install hooks:", error);
    installed = false;
    return false;
  }
}

export function areHooksInstalled(): boolean {
  return installed === true;
}
