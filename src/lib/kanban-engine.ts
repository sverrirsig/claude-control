import { execFile } from "child_process";
import { readFile } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
import { CASCADE_SETTLE_MS, OUTPUT_PROMPT_TIMEOUT_MS, PROCESS_TIMEOUT_MS, PROMPT_CONFIRM_TIMEOUT_MS } from "./constants";
import { getGitDiff } from "./git-info";
import { clearMessageBar, sendPromptToSession } from "./kanban-executor";
import { loadKanbanConfig, loadKanbanState, saveKanbanState } from "./kanban-store";
import type { ClaudeSession, KanbanColumn, KanbanState } from "./types";

const execFileAsync = promisify(execFile);

// ── Output extraction ──

export async function extractColumnOutput(column: KanbanColumn, session: ClaudeSession): Promise<string> {
  const output = column.output;
  if (!output) return "";

  const cwd = session.workingDirectory;
  let raw = "";

  try {
    switch (output.type) {
      case "file": {
        if (!output.value) return "";
        const filePath = output.value.startsWith("/") ? output.value : join(cwd, output.value);
        raw = await readFile(filePath, "utf-8");
        break;
      }
      case "script": {
        if (!output.value) return "";
        const { stdout } = await execFileAsync("bash", ["-c", output.value], {
          cwd,
          timeout: PROCESS_TIMEOUT_MS,
        });
        raw = stdout;
        break;
      }
      case "git-diff": {
        raw = (await getGitDiff(cwd)) ?? "";
        break;
      }
      case "conversation": {
        raw = session.preview.lastAssistantText ?? "";
        break;
      }
    }
  } catch (err) {
    console.error(`Kanban output extraction failed for column "${column.name}":`, err);
    return "";
  }

  // Apply optional regex extraction
  if (output.regex && raw) {
    try {
      const match = raw.match(new RegExp(output.regex, "s"));
      if (match) raw = match[1] ?? match[0];
    } catch {
      // Invalid regex — return raw
    }
  }

  // Truncate very large outputs
  const MAX_OUTPUT_LENGTH = 50_000;
  if (raw.length > MAX_OUTPUT_LENGTH) {
    raw = raw.slice(0, MAX_OUTPUT_LENGTH) + "\n\n[...truncated]";
  }

  return raw;
}

// ── Prompt building ──

export function buildColumnPrompt(
  column: KanbanColumn,
  previousOutput: string | undefined,
  initialPrompt: string | undefined,
): string {
  const parts: string[] = [];

  if (column.input?.promptTemplate) {
    const interpolated = column.input.promptTemplate
      .replace(/\{\{previousOutput\}\}/g, previousOutput ?? "")
      .replace(/\{\{initialPrompt\}\}/g, initialPrompt ?? "");
    parts.push(interpolated);
  }

  // File and script inputs are handled at execution time by the move endpoint
  // (they're injected before the prompt is sent)

  return parts.join("\n\n");
}

/**
 * Build the full prompt for a column, including file and script inputs.
 * Runs in the session's working directory.
 */
export async function buildFullColumnPrompt(
  column: KanbanColumn,
  previousOutput: string | undefined,
  cwd: string,
  initialPrompt?: string,
): Promise<string> {
  const parts: string[] = [];

  // Read file input if configured
  if (column.input?.filePath) {
    try {
      const filePath = column.input.filePath.startsWith("/")
        ? column.input.filePath
        : join(cwd, column.input.filePath);
      const content = await readFile(filePath, "utf-8");
      parts.push(content);
    } catch (err) {
      console.error(`Kanban: failed to read input file "${column.input.filePath}":`, err);
    }
  }

  // Run script input if configured
  if (column.input?.script) {
    try {
      const { stdout } = await execFileAsync("bash", ["-c", column.input.script], {
        cwd,
        timeout: PROCESS_TIMEOUT_MS,
      });
      if (stdout.trim()) parts.push(stdout.trim());
    } catch (err) {
      console.error(`Kanban: input script failed for column "${column.name}":`, err);
    }
  }

  // Add prompt template (with variables interpolated)
  if (column.input?.promptTemplate) {
    const interpolated = column.input.promptTemplate
      .replace(/\{\{previousOutput\}\}/g, previousOutput ?? "")
      .replace(/\{\{initialPrompt\}\}/g, initialPrompt ?? "");
    parts.push(interpolated);
  }

  return parts.join("\n\n");
}

// ── Tick: process idle transitions ──

export interface KanbanAction {
  type: "move" | "cascade" | "output-prompt";
  sessionId: string;
  fromColumnId: string;
  toColumnId: string;
  prompt: string;
  clearFirst?: boolean;
}

// In-memory lock per repo to prevent concurrent tick execution
const tickLocks = new Map<string, boolean>();

export async function processIdleTransitions(
  repoId: string,
  sessions: ClaudeSession[],
): Promise<KanbanAction[]> {
  if (tickLocks.get(repoId)) return [];
  tickLocks.set(repoId, true);

  try {
    const config = await loadKanbanConfig(repoId);
    const state = await loadKanbanState(repoId);
    const actions: KanbanAction[] = [];
    let stateChanged = false;
    const now = Date.now();

    for (const placement of state.placements) {
      const session = sessions.find((s) => s.id === placement.sessionId);
      if (!session || (session.status !== "idle" && session.status !== "finished" && session.status !== "waiting" && session.status !== "errored")) continue;

      const currentColumn = config.columns.find((c) => c.id === placement.columnId);
      if (!currentColumn) continue;

      // ── Guard: prompt was recently sent, wait for confirmation ──
      // After sending a prompt, Claude needs time to receive and start processing it.
      // Skip this session until either the timeout elapses or session goes "working".
      if (placement.promptSentAt && now - placement.promptSentAt < PROMPT_CONFIRM_TIMEOUT_MS) {
        continue;
      }
      // Clear stale promptSentAt once the timeout has passed
      if (placement.promptSentAt) {
        placement.promptSentAt = undefined;
        stateChanged = true;
      }

      // CASE A: Queued move
      if (placement.queuedColumnId) {
        const targetColumn = config.columns.find((c) => c.id === placement.queuedColumnId);
        if (!targetColumn) continue;

        // A1: Output prompt was sent and just finished — now do the actual move
        if (placement.pendingOutputPrompt) {
          // Timeout guard: if the output prompt has been pending too long, force-complete
          const pendingSince = placement.pendingOutputPrompt;
          if (session.status === "waiting" && now - pendingSince < OUTPUT_PROMPT_TIMEOUT_MS) {
            continue; // Still processing or waiting within timeout
          }

          const output = await extractColumnOutput(currentColumn, session);
          storeOutput(state, placement.sessionId, currentColumn.id, output);

          const previousOutput = getLastOutput(state, placement.sessionId, currentColumn.id);
          const prompt = await buildFullColumnPrompt(targetColumn, previousOutput, session.workingDirectory, placement.initialPrompt ?? session.initialPrompt ?? undefined);

          const clearFirst = placement.clearOnMove ?? false;
          placement.columnId = targetColumn.id;
          placement.queuedColumnId = undefined;
          placement.pendingOutputPrompt = undefined;
          placement.clearOnMove = undefined;
          placement.lastOutput = output;
          stateChanged = true;

          if (prompt) {
            actions.push({ type: "move", sessionId: session.id, fromColumnId: currentColumn.id, toColumnId: targetColumn.id, prompt, clearFirst });
          }
          continue;
        }

        // A2: Source column has output prompt — send it first, don't move yet
        if (currentColumn.outputPrompt) {
          const outputPromptText = currentColumn.outputPrompt
            .replace(/\{\{initialPrompt\}\}/g, placement.initialPrompt ?? session.initialPrompt ?? "");

          placement.pendingOutputPrompt = now;
          stateChanged = true;

          if (outputPromptText) {
            actions.push({ type: "output-prompt", sessionId: session.id, fromColumnId: currentColumn.id, toColumnId: targetColumn.id, prompt: outputPromptText });
          }
          continue;
        }

        // A3: No output prompt — extract output and move immediately (existing behavior)
        const output = await extractColumnOutput(currentColumn, session);
        storeOutput(state, placement.sessionId, currentColumn.id, output);

        const previousOutput = getLastOutput(state, placement.sessionId, currentColumn.id);
        const prompt = await buildFullColumnPrompt(targetColumn, previousOutput, session.workingDirectory, placement.initialPrompt ?? session.initialPrompt ?? undefined);

        const clearFirst = placement.clearOnMove ?? false;
        placement.columnId = targetColumn.id;
        placement.queuedColumnId = undefined;
        placement.clearOnMove = undefined;
        placement.lastOutput = output;
        stateChanged = true;

        if (prompt) {
          actions.push({ type: "move", sessionId: session.id, fromColumnId: currentColumn.id, toColumnId: targetColumn.id, prompt, clearFirst });
        }
        continue;
      }

      // CASE B: Auto-cascade — only when truly done.
      // Guards (all must pass):
      // 1. Not "waiting" (mid-task question or permission prompt)
      // 2. Not cut off mid-response (stop_reason: "max_tokens")
      // 3. No JSONL activity for settle period (avoids brief idle flashes between tool calls)
      const idleAge = session.lastActivity ? now - new Date(session.lastActivity).getTime() : Infinity;
      const settleMs = currentColumn.settleMs ?? CASCADE_SETTLE_MS;
      const cascadeReady =
        currentColumn.autoCascade &&
        session.status !== "waiting" &&
        session.lastStopReason !== "max_tokens" &&
        idleAge >= settleMs;

      if (cascadeReady) {
        const currentIndex = config.columns.findIndex((c) => c.id === currentColumn.id);
        const nextColumn = config.columns[currentIndex + 1];
        if (!nextColumn) continue;

        // B1: Source column has output prompt — send it, queue the cascade for next tick
        if (currentColumn.outputPrompt) {
          const outputPromptText = currentColumn.outputPrompt
            .replace(/\{\{initialPrompt\}\}/g, placement.initialPrompt ?? session.initialPrompt ?? "");

          placement.queuedColumnId = nextColumn.id;
          placement.pendingOutputPrompt = now;
          stateChanged = true;

          if (outputPromptText) {
            actions.push({ type: "output-prompt", sessionId: session.id, fromColumnId: currentColumn.id, toColumnId: nextColumn.id, prompt: outputPromptText });
          }
          continue;
        }

        // B2: No output prompt — extract output and cascade
        const output = await extractColumnOutput(currentColumn, session);

        // requireOutput guard: don't cascade if column expects output but got none
        if (currentColumn.requireOutput && !output.trim()) {
          continue;
        }

        storeOutput(state, placement.sessionId, currentColumn.id, output);

        const previousOutput = getLastOutput(state, placement.sessionId, currentColumn.id);
        const prompt = await buildFullColumnPrompt(nextColumn, previousOutput, session.workingDirectory, placement.initialPrompt ?? session.initialPrompt ?? undefined);

        placement.columnId = nextColumn.id;
        placement.lastOutput = output;
        stateChanged = true;

        if (prompt) {
          actions.push({ type: "cascade", sessionId: session.id, fromColumnId: currentColumn.id, toColumnId: nextColumn.id, prompt });
        }
      }
    }

    if (stateChanged) {
      await saveKanbanState(repoId, state);
    }

    // Execute actions: clear message bar, send prompts to sessions, and record promptSentAt
    for (const action of actions) {
      const session = sessions.find((s) => s.id === action.sessionId);
      if (session) {
        try {
          await clearMessageBar(session);
          await sendPromptToSession(session, action.prompt);
          // Track when we sent this prompt to guard against race-window double-cascade
          const placement = state.placements.find((p) => p.sessionId === action.sessionId);
          if (placement) {
            placement.promptSentAt = Date.now();
          }
        } catch (err) {
          console.error(`Kanban: failed to send prompt to session ${action.sessionId}:`, err);
        }
      }
    }

    // Persist promptSentAt updates
    if (actions.length > 0) {
      await saveKanbanState(repoId, state);
    }

    return actions;
  } finally {
    tickLocks.delete(repoId);
  }
}

// ── Helpers ──

function storeOutput(state: KanbanState, sessionId: string, columnId: string, output: string): void {
  if (!state.outputHistory[sessionId]) {
    state.outputHistory[sessionId] = {};
  }
  state.outputHistory[sessionId][columnId] = output;
}

function getLastOutput(state: KanbanState, sessionId: string, columnId: string): string | undefined {
  return state.outputHistory[sessionId]?.[columnId];
}
