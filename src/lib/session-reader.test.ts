import { describe, it, expect } from "vitest";
import {
  extractSessionId,
  extractStartedAt,
  extractBranch,
  extractPreview,
  extractTaskSummary,
  lastMessageHasError,
  hasPendingToolUse,
  isAskingForInput,
  linesToConversation,
} from "./session-reader";

// Helper to build JSONL line objects
function userLine(content: string, extra = {}) {
  return { type: "user", message: { role: "human", content }, ...extra };
}

type ContentBlock = { type: string; text?: string; name?: string; input?: Record<string, unknown> };

function assistantLine(blocks: ContentBlock[], extra = {}) {
  return { type: "assistant", message: { role: "assistant", content: blocks, stop_reason: "end_turn" }, ...extra };
}

function textBlock(text: string) {
  return { type: "text", text };
}

function toolUseBlock(name: string, input?: Record<string, unknown>) {
  return { type: "tool_use", name, input };
}

describe("extractSessionId", () => {
  it("finds first sessionId", () => {
    const lines = [
      { type: "system", sessionId: "abc-123" },
      { type: "user", sessionId: "abc-123", message: { content: "hi" } },
    ];
    expect(extractSessionId(lines)).toBe("abc-123");
  });

  it("returns null when no sessionId", () => {
    expect(extractSessionId([{ type: "user" }])).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(extractSessionId([])).toBeNull();
  });
});

describe("extractStartedAt", () => {
  it("finds first timestamp", () => {
    const lines = [
      { type: "system", timestamp: "2026-01-01T00:00:00Z" },
      { type: "user", timestamp: "2026-01-01T00:01:00Z", message: { content: "hi" } },
    ];
    expect(extractStartedAt(lines)).toBe("2026-01-01T00:00:00Z");
  });

  it("returns null when no timestamp", () => {
    expect(extractStartedAt([{ type: "user" }])).toBeNull();
  });
});

describe("extractBranch", () => {
  it("returns the last gitBranch (reverse scan)", () => {
    const lines = [
      { type: "system", gitBranch: "main" },
      { type: "user", gitBranch: "feature-x", message: { content: "hi" } },
    ];
    expect(extractBranch(lines)).toBe("feature-x");
  });

  it("returns null when no gitBranch", () => {
    expect(extractBranch([{ type: "user" }])).toBeNull();
  });
});

describe("extractPreview", () => {
  it("extracts last user message and assistant text", () => {
    const lines = [userLine("fix the bug"), assistantLine([textBlock("I fixed it.")])];
    const preview = extractPreview(lines);
    expect(preview.lastUserMessage).toBe("fix the bug");
    expect(preview.lastAssistantText).toBe("I fixed it.");
    expect(preview.messageCount).toBe(2);
  });

  it("extracts tool name and input from last assistant turn", () => {
    const lines = [
      userLine("read the file"),
      assistantLine([textBlock("Let me read it."), toolUseBlock("Read", { file_path: "/foo/bar.ts" })]),
    ];
    const preview = extractPreview(lines);
    expect(preview.lastTools).toEqual([{ name: "Read", input: "/foo/bar.ts", description: null, warnings: [] }]);
  });

  it("extracts multiple tools from parallel tool calls", () => {
    const lines = [
      assistantLine([
        toolUseBlock("Read", { file_path: "/a.ts" }),
        toolUseBlock("Read", { file_path: "/b.ts" }),
        toolUseBlock("Grep", { pattern: "TODO" }),
      ]),
    ];
    const preview = extractPreview(lines);
    expect(preview.lastTools).toEqual([
      { name: "Read", input: "/a.ts", description: null, warnings: [] },
      { name: "Read", input: "/b.ts", description: null, warnings: [] },
      { name: "Grep", input: "/TODO/", description: null, warnings: [] },
    ]);
  });

  it("clears lastTools when assistant has no tool_use", () => {
    const lines = [
      assistantLine([textBlock("Let me read..."), toolUseBlock("Read", { file_path: "/x" })]),
      userLine("tool result"),
      assistantLine([textBlock("Here's the content.")]),
    ];
    const preview = extractPreview(lines);
    expect(preview.lastTools).toEqual([]);
  });

  it("skips progress and system lines", () => {
    const lines = [
      { type: "progress", message: { content: "..." } },
      { type: "system", message: { content: "..." } },
      userLine("hello"),
    ];
    expect(extractPreview(lines).messageCount).toBe(1);
  });

  it("truncates long messages to 200 chars", () => {
    const longMsg = "x".repeat(300);
    const lines = [userLine(longMsg)];
    expect(extractPreview(lines).lastUserMessage!.length).toBe(200);
  });

  it("returns zero counts for empty input", () => {
    const preview = extractPreview([]);
    expect(preview.messageCount).toBe(0);
    expect(preview.lastUserMessage).toBeNull();
    expect(preview.lastAssistantText).toBeNull();
  });

  it("marks assistantIsNewer when assistant is last speaker", () => {
    const lines = [userLine("fix it"), assistantLine([textBlock("Done.")])];
    expect(extractPreview(lines).assistantIsNewer).toBe(true);
  });

  it("marks assistantIsNewer false when user is last speaker", () => {
    const lines = [assistantLine([textBlock("Done.")]), userLine("thanks, now do this")];
    expect(extractPreview(lines).assistantIsNewer).toBe(false);
  });

  it("filters out system-injected XML messages", () => {
    const lines = [
      userLine("fix the bug"),
      assistantLine([textBlock("Done.")]),
      userLine("<local-command-caveat>Caveat: The messages below were generated...</local-command-caveat>"),
    ];
    const preview = extractPreview(lines);
    expect(preview.lastUserMessage).toBe("fix the bug");
  });

  it("filters out <system-reminder> messages", () => {
    const lines = [userLine("<system-reminder>Remember to follow style guidelines</system-reminder>")];
    const preview = extractPreview(lines);
    expect(preview.lastUserMessage).toBeNull();
    expect(preview.messageCount).toBe(0);
  });

  it("resets preview state on /clear command", () => {
    const lines = [
      userLine("fix the bug"),
      assistantLine([textBlock("I fixed it.")]),
      userLine("<command-name>/clear</command-name>"),
    ];
    const preview = extractPreview(lines);
    expect(preview.lastUserMessage).toBeNull();
    expect(preview.lastAssistantText).toBeNull();
    expect(preview.messageCount).toBe(0);
  });

  it("shows messages after /clear", () => {
    const lines = [
      userLine("old message"),
      assistantLine([textBlock("old reply")]),
      userLine("<command-name>/clear</command-name>"),
      userLine("new message"),
      assistantLine([textBlock("new reply")]),
    ];
    const preview = extractPreview(lines);
    expect(preview.lastUserMessage).toBe("new message");
    expect(preview.lastAssistantText).toBe("new reply");
    expect(preview.messageCount).toBe(2);
  });

  it("detects command substitution warning in Bash tool", () => {
    const lines = [assistantLine([toolUseBlock("Bash", { command: "echo $(whoami)", description: "Print username" })])];
    const preview = extractPreview(lines);
    expect(preview.lastTools[0].warnings).toContain("Command contains $() command substitution");
    expect(preview.lastTools[0].description).toBe("Print username");
  });

  it("detects multiple warnings", () => {
    const lines = [assistantLine([toolUseBlock("Bash", { command: "sudo rm -rf /tmp/foo | sh" })])];
    const warnings = extractPreview(lines).lastTools[0].warnings;
    expect(warnings).toContain("Recursive or forced file deletion");
    expect(warnings).toContain("Runs with elevated privileges");
    expect(warnings).toContain("Pipes to shell interpreter");
  });

  it("returns no warnings for safe commands", () => {
    const lines = [assistantLine([toolUseBlock("Bash", { command: "npm test" })])];
    expect(extractPreview(lines).lastTools[0].warnings).toEqual([]);
  });

  it("returns no warnings for non-Bash tools", () => {
    const lines = [assistantLine([toolUseBlock("Read", { file_path: "/etc/passwd" })])];
    expect(extractPreview(lines).lastTools[0].warnings).toEqual([]);
  });
});

describe("lastMessageHasError", () => {
  it("detects error + failed in last assistant message", () => {
    const lines = [assistantLine([textBlock("An error occurred and the command failed.")])];
    expect(lastMessageHasError(lines)).toBe(true);
  });

  it("returns false when only error (no failed)", () => {
    const lines = [assistantLine([textBlock("There was an error.")])];
    expect(lastMessageHasError(lines)).toBe(false);
  });

  it("returns false for empty lines", () => {
    expect(lastMessageHasError([])).toBe(false);
  });

  it("returns false when last meaningful message is from user", () => {
    const lines = [assistantLine([textBlock("error and failed here")]), userLine("okay thanks")];
    expect(lastMessageHasError(lines)).toBe(false);
  });

  it("skips progress/system lines to find last real message", () => {
    const lines = [assistantLine([textBlock("error and failed here")]), { type: "progress" }];
    expect(lastMessageHasError(lines)).toBe(true);
  });
});

describe("hasPendingToolUse", () => {
  it("returns true when last message is assistant with tool_use", () => {
    const lines = [assistantLine([textBlock("Let me check."), toolUseBlock("Bash", { command: "ls" })])];
    expect(hasPendingToolUse(lines)).toBe(true);
  });

  it("returns false when last message is user (tool_result came back)", () => {
    const lines = [assistantLine([toolUseBlock("Bash", { command: "ls" })]), userLine("tool result here")];
    expect(hasPendingToolUse(lines)).toBe(false);
  });

  it("returns false for empty lines", () => {
    expect(hasPendingToolUse([])).toBe(false);
  });

  it("skips progress lines", () => {
    const lines = [assistantLine([toolUseBlock("Read", { file_path: "/x" })]), { type: "progress" }];
    expect(hasPendingToolUse(lines)).toBe(true);
  });
});

describe("isAskingForInput", () => {
  it("returns true for 'shall I proceed' after tool use", () => {
    const lines = [
      userLine("do the thing"),
      assistantLine([toolUseBlock("Bash", { command: "ls" })]),
      userLine("tool result"),
      assistantLine([textBlock("I found the files. Shall I proceed with the changes?")]),
    ];
    expect(isAskingForInput(lines)).toBe(true);
  });

  it("returns true for 'would you like me to'", () => {
    const lines = [
      userLine("fix it"),
      assistantLine([toolUseBlock("Read", { file_path: "/x" })]),
      userLine("tool result"),
      assistantLine([textBlock("Would you like me to refactor this?")]),
    ];
    expect(isAskingForInput(lines)).toBe(true);
  });

  it("returns true for 'do you want me to'", () => {
    const lines = [
      userLine("help"),
      assistantLine([toolUseBlock("Bash", { command: "test" })]),
      userLine("tool result"),
      assistantLine([textBlock("Do you want me to run the tests again?")]),
    ];
    expect(isAskingForInput(lines)).toBe(true);
  });

  it("returns false for greeting (first assistant turn, no tools)", () => {
    const lines = [userLine("hello"), assistantLine([textBlock("Hi! How can I help you today?")])];
    expect(isAskingForInput(lines)).toBe(false);
  });

  it("returns false for greeting pattern even in multi-turn conversation", () => {
    const lines = [
      userLine("hey"),
      assistantLine([toolUseBlock("Bash", { command: "ls" })]),
      userLine("tool result"),
      assistantLine([textBlock("Hi! How can I help you today?")]),
    ];
    expect(isAskingForInput(lines)).toBe(false);
  });

  it("returns false when last message has tool_use", () => {
    const lines = [
      userLine("do it"),
      assistantLine([textBlock("Shall I proceed?"), toolUseBlock("Bash", { command: "rm -rf" })]),
    ];
    expect(isAskingForInput(lines)).toBe(false);
  });

  it("returns false when stop_reason is not end_turn", () => {
    const lines = [
      userLine("start"),
      assistantLine([toolUseBlock("Bash", { command: "ls" })]),
      userLine("result"),
      {
        type: "assistant",
        message: { role: "assistant", content: [textBlock("Shall I proceed?")], stop_reason: "max_tokens" },
      },
    ];
    expect(isAskingForInput(lines)).toBe(false);
  });

  it("returns false when last speaker is user", () => {
    const lines = [assistantLine([textBlock("Shall I proceed?")]), userLine("yes")];
    expect(isAskingForInput(lines)).toBe(false);
  });

  it("returns false for empty lines", () => {
    expect(isAskingForInput([])).toBe(false);
  });
});

describe("linesToConversation", () => {
  it("converts user and assistant lines to ConversationMessage array", () => {
    const lines = [
      { ...userLine("hello"), timestamp: "2026-01-01T00:00:00Z" },
      { ...assistantLine([textBlock("Hi there!")]), timestamp: "2026-01-01T00:00:01Z" },
    ];
    const msgs = linesToConversation(lines);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ type: "user", timestamp: "2026-01-01T00:00:00Z", text: "hello", toolUses: [] });
    expect(msgs[1]).toEqual({ type: "assistant", timestamp: "2026-01-01T00:00:01Z", text: "Hi there!", toolUses: [] });
  });

  it("extracts tool uses from assistant messages", () => {
    const lines = [assistantLine([textBlock("Reading..."), toolUseBlock("Read", { file_path: "/x" })])];
    const msgs = linesToConversation(lines);
    expect(msgs[0].toolUses).toEqual([{ name: "Read", input: { file_path: "/x" } }]);
  });

  it("concatenates multiple text blocks", () => {
    const lines = [assistantLine([textBlock("Part 1"), textBlock("Part 2")])];
    const msgs = linesToConversation(lines);
    expect(msgs[0].text).toBe("Part 1\nPart 2");
  });

  it("skips progress and system lines", () => {
    const lines = [
      { type: "progress", message: { content: "..." } },
      { type: "system", message: { content: "..." } },
      { type: "file-history-snapshot", message: { content: "..." } },
      { ...userLine("hello"), timestamp: "t1" },
    ];
    const msgs = linesToConversation(lines);
    expect(msgs).toHaveLength(1);
  });

  it("uses empty string for missing timestamp", () => {
    const lines = [userLine("hi")];
    expect(linesToConversation(lines)[0].timestamp).toBe("");
  });

  it("returns empty array for empty input", () => {
    expect(linesToConversation([])).toEqual([]);
  });

  it("filters out system-injected XML user messages", () => {
    const lines = [
      { ...userLine("hello"), timestamp: "t1" },
      { ...userLine("<system-reminder>Be helpful</system-reminder>"), timestamp: "t2" },
      { ...assistantLine([textBlock("Hi!")]), timestamp: "t3" },
    ];
    const msgs = linesToConversation(lines);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].text).toBe("hello");
    expect(msgs[1].text).toBe("Hi!");
  });
});

describe("extractTaskSummary", () => {
  it("extracts Linear issue from tool_result", () => {
    const lines = [
      {
        type: "user",
        message: {
          role: "human",
          content: [
            {
              type: "tool_result",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    title: "Fix auth bug",
                    identifier: "ENG-123",
                    url: "https://linear.app/team/ENG-123",
                    description: "Auth fails on refresh",
                  }),
                },
              ],
            },
          ],
        },
      },
    ];
    const summary = extractTaskSummary(lines);
    expect(summary).not.toBeNull();
    expect(summary!.title).toBe("Fix auth bug");
    expect(summary!.ticketId).toBe("ENG-123");
    expect(summary!.source).toBe("linear");
    expect(summary!.ticketUrl).toBe("https://linear.app/team/ENG-123");
  });

  it("falls back to first user message", () => {
    const lines = [userLine("Add dark mode toggle\nShould respect system preferences")];
    const summary = extractTaskSummary(lines);
    expect(summary).not.toBeNull();
    expect(summary!.title).toBe("Add dark mode toggle");
    expect(summary!.description).toBe("Should respect system preferences");
    expect(summary!.source).toBe("prompt");
  });

  it("skips generic prompts like 'implement the linear ticket'", () => {
    const lines = [userLine("implement the linear ticket")];
    expect(extractTaskSummary(lines)).toBeNull();
  });

  it("returns null for empty lines", () => {
    expect(extractTaskSummary([])).toBeNull();
  });

  it("strips markdown heading prefix from title", () => {
    const lines = [userLine("## Fix the login page")];
    const summary = extractTaskSummary(lines);
    expect(summary!.title).toBe("Fix the login page");
  });

  it("skips system-injected XML messages for task summary", () => {
    const lines = [
      userLine("<system-reminder>You are Claude Code</system-reminder>"),
      userLine("Build the auth module"),
    ];
    const summary = extractTaskSummary(lines);
    expect(summary).not.toBeNull();
    expect(summary!.title).toBe("Build the auth module");
  });
});
