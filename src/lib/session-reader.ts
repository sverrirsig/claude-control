import { readFile, stat } from "fs/promises";
import { ConversationMessage, ConversationPreview, TaskSummary } from "./types";
import { JSONL_TAIL_LINES } from "./constants";

interface JsonlLine {
  type: string;
  subtype?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  timestamp?: string;
  message?: {
    role?: string;
    stop_reason?: string;
    content?: string | Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  };
}

export async function getJsonlMtime(jsonlPath: string): Promise<Date | null> {
  try {
    const s = await stat(jsonlPath);
    return s.mtime;
  } catch {
    return null;
  }
}

export async function readJsonlHead(jsonlPath: string, lines = 30): Promise<JsonlLine[]> {
  try {
    const content = await readFile(jsonlPath, "utf-8");
    const allLines = content.trim().split("\n").filter(Boolean);
    const headLines = allLines.slice(0, lines);
    const parsed: JsonlLine[] = [];
    for (const line of headLines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // skip
      }
    }
    return parsed;
  } catch {
    return [];
  }
}

export async function readJsonlTail(jsonlPath: string, lines = JSONL_TAIL_LINES): Promise<JsonlLine[]> {
  try {
    const content = await readFile(jsonlPath, "utf-8");
    const allLines = content.trim().split("\n").filter(Boolean);
    const tailLines = allLines.slice(-lines);
    const parsed: JsonlLine[] = [];
    for (const line of tailLines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
    return parsed;
  } catch {
    return [];
  }
}

export async function readFullConversation(jsonlPath: string): Promise<JsonlLine[]> {
  try {
    const content = await readFile(jsonlPath, "utf-8");
    const allLines = content.trim().split("\n").filter(Boolean);
    const parsed: JsonlLine[] = [];
    for (const line of allLines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // skip
      }
    }
    return parsed;
  } catch {
    return [];
  }
}

export function extractSessionId(lines: JsonlLine[]): string | null {
  for (const line of lines) {
    if (line.sessionId) return line.sessionId;
  }
  return null;
}

export function extractStartedAt(lines: JsonlLine[]): string | null {
  for (const line of lines) {
    if (line.timestamp) return line.timestamp;
  }
  return null;
}

export function extractBranch(lines: JsonlLine[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].gitBranch) return lines[i].gitBranch!;
  }
  return null;
}

export function extractPreview(lines: JsonlLine[]): ConversationPreview {
  let lastUserMessage: string | null = null;
  let lastAssistantText: string | null = null;
  let lastToolName: string | null = null;
  let messageCount = 0;

  for (const line of lines) {
    if (line.type === "progress" || line.type === "file-history-snapshot" || line.type === "system") continue;
    if (!line.message) continue;

    if (line.type === "user" && typeof line.message.content === "string") {
      lastUserMessage = line.message.content.slice(0, 200);
      messageCount++;
    } else if (line.type === "assistant" && Array.isArray(line.message.content)) {
      messageCount++;
      lastToolName = null; // reset per assistant turn
      for (const block of line.message.content) {
        if (block.type === "text" && block.text) {
          lastAssistantText = block.text.slice(0, 200);
        }
        if (block.type === "tool_use" && block.name) {
          lastToolName = block.name;
        }
      }
    }
  }

  return { lastUserMessage, lastAssistantText, lastToolName, messageCount };
}

export function linesToConversation(lines: JsonlLine[]): ConversationMessage[] {
  const messages: ConversationMessage[] = [];

  for (const line of lines) {
    if (line.type === "progress" || line.type === "file-history-snapshot" || line.type === "system") continue;
    if (!line.message) continue;

    if (line.type === "user" && typeof line.message.content === "string") {
      messages.push({
        type: "user",
        timestamp: line.timestamp || "",
        text: line.message.content,
        toolUses: [],
      });
    } else if (line.type === "assistant" && Array.isArray(line.message.content)) {
      let text: string | null = null;
      const toolUses: { name: string; input?: Record<string, unknown> }[] = [];
      for (const block of line.message.content) {
        if (block.type === "text" && block.text) {
          text = (text ? text + "\n" : "") + block.text;
        }
        if (block.type === "tool_use" && block.name) {
          toolUses.push({ name: block.name, input: block.input });
        }
      }
      messages.push({
        type: "assistant",
        timestamp: line.timestamp || "",
        text,
        toolUses,
      });
    }
  }

  return messages;
}

export function lastMessageHasError(lines: JsonlLine[]): boolean {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.type === "progress" || line.type === "file-history-snapshot" || line.type === "system") continue;
    if (!line.message) continue;

    if (line.type === "assistant" && Array.isArray(line.message.content)) {
      for (const block of line.message.content) {
        if (block.type === "text" && block.text) {
          const lower = block.text.toLowerCase();
          if (lower.includes("error") && lower.includes("failed")) return true;
        }
      }
    }
    break;
  }
  return false;
}

/**
 * Checks if the last assistant message is genuinely asking for a decision or permission
 * mid-task. This excludes generic greetings and open-ended "how can I help" responses.
 *
 * "Waiting" means Claude has done work and now needs user input to continue —
 * e.g. asking which approach to take, requesting confirmation before a destructive action,
 * or asking for clarification on requirements.
 */
/**
 * Checks if the last assistant message issued a tool_use but no tool_result
 * has come back yet. This means the CLI is waiting for the user to approve
 * the tool execution (permission prompt).
 */
export function hasPendingToolUse(lines: JsonlLine[]): boolean {
  // Walk backwards to find the last meaningful message
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.type === "progress" || line.type === "file-history-snapshot" || line.type === "system") continue;
    if (!line.message) continue;

    // If last message is assistant with tool_use → pending (waiting for approval)
    if (line.type === "assistant" && Array.isArray(line.message.content)) {
      return line.message.content.some((b) => b.type === "tool_use");
    }

    // If last message is user (could be tool_result or new input) → not pending
    return false;
  }
  return false;
}

export function isAskingForInput(lines: JsonlLine[]): boolean {
  // Find the last assistant message and count how many assistant turns preceded it
  let lastAssistant: JsonlLine | null = null;
  let assistantTurnCount = 0;
  let hasToolUseInSession = false;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.type === "progress" || line.type === "file-history-snapshot" || line.type === "system") continue;

    if (line.type === "assistant" && line.message && Array.isArray(line.message.content)) {
      assistantTurnCount++;
      if (!lastAssistant) lastAssistant = line;
      if (line.message.content.some((b) => b.type === "tool_use")) {
        hasToolUseInSession = true;
      }
    }
    // If we hit a user message before finding an assistant message, Claude isn't the last speaker
    if (line.type === "user" && !lastAssistant) return false;
  }

  if (!lastAssistant || !lastAssistant.message) return false;

  const content = lastAssistant.message.content;
  if (!Array.isArray(content)) return false;

  // If the last message itself has tool_use blocks, Claude is working, not asking
  const hasToolUse = content.some((b) => b.type === "tool_use");
  if (hasToolUse) return false;

  // Must be end_turn
  if (lastAssistant.message.stop_reason !== "end_turn") return false;

  // If this is the first assistant turn and no tools were used in the session,
  // it's just an initial greeting/response — not a mid-task question
  if (assistantTurnCount <= 1 && !hasToolUseInSession) return false;

  const textBlocks = content.filter((b) => b.type === "text" && b.text);
  if (textBlocks.length === 0) return false;

  const fullText = textBlocks.map((b) => b.text || "").join("\n");
  const lower = fullText.toLowerCase();

  // Filter out generic greeting/help-offer patterns
  const greetingPatterns = [
    /^(hey|hi|hello)[\s!.,]*what can i help/i,
    /^(hey|hi|hello)[\s!.,]*how can i (help|assist)/i,
    /what (can|would you like me to|shall) i help.*with/i,
    /how can i (help|assist) you/i,
  ];
  for (const pattern of greetingPatterns) {
    if (pattern.test(fullText.trim())) return false;
  }

  // Look for strong decision/permission/confirmation patterns
  if (lower.includes("shall i proceed") || lower.includes("should i proceed")) return true;
  if (lower.includes("shall i go ahead") || lower.includes("should i go ahead")) return true;
  if (lower.includes("would you like me to")) return true;
  if (lower.includes("please confirm")) return true;
  if (lower.includes("which approach") || lower.includes("which option")) return true;
  if (lower.includes("do you want me to")) return true;
  if (lower.includes("before i ") && fullText.includes("?")) return true;
  if (lower.includes("is that okay") || lower.includes("does that look right")) return true;
  if (lower.includes("let me know") && (lower.includes("prefer") || lower.includes("choose") || lower.includes("decision"))) return true;

  return false;
}

/**
 * Extract a task summary from the early conversation.
 * Looks for Linear issue data in tool results, falls back to first user message.
 */
export function extractTaskSummary(headLines: JsonlLine[]): TaskSummary | null {
  // Strategy 1: Find a Linear issue in tool_result content blocks
  for (const line of headLines) {
    if (line.type !== "user" || !line.message) continue;
    const content = line.message.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type !== "tool_result") continue;
      // tool_result content can be a nested array with text blocks
      const innerContent = (block as Record<string, unknown>).content;
      if (!Array.isArray(innerContent)) continue;

      for (const inner of innerContent as Array<Record<string, unknown>>) {
        if (inner.type !== "text" || typeof inner.text !== "string") continue;
        try {
          const data = JSON.parse(inner.text as string);
          if (data.title && data.identifier) {
            let desc = data.description || null;
            if (desc) {
              desc = desc.replace(/\\n/g, "\n").replace(/\n+/g, " · ").replace(/^\s*\*\s*/g, "").replace(/\s*\*\s*/g, " · ").trim();
            }
            return {
              title: data.title,
              description: desc,
              source: "linear",
              ticketId: data.identifier,
              ticketUrl: data.url || null,
            };
          }
        } catch {
          // Not JSON or not a Linear issue
        }
      }
    }
  }

  // Strategy 2: Fall back to first user message (if it's not a generic prompt)
  for (const line of headLines) {
    if (line.type !== "user" || !line.message) continue;
    const content = line.message.content;
    if (typeof content !== "string") continue;
    const text = content.trim();
    if (!text) continue;

    const generic = /^(implement|start|work on|fix|do)\s+(the\s+)?(linear|referenced|ticket)/i;
    if (generic.test(text) && text.length < 100) continue;

    const textLines = text.split("\n").filter((l: string) => l.trim());
    const title = textLines[0].replace(/^#+\s*/, "").slice(0, 120);
    const description = textLines.length > 1 ? textLines.slice(1).join(" ").slice(0, 300) : null;

    return {
      title,
      description,
      source: "prompt",
      ticketId: null,
      ticketUrl: null,
    };
  }

  return null;
}
