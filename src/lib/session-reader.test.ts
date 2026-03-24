import { describe, it, expect, afterEach } from "vitest";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
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
  readTokenUsage,
  getJsonlMtime,
  readJsonlHead,
  readJsonlTail,
  readFullConversation,
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
    const lines = [
      userLine("fix the bug"),
      assistantLine([textBlock("I fixed it.")]),
    ];
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

  it("truncates long messages to 600 chars", () => {
    const longMsg = "x".repeat(700);
    const lines = [userLine(longMsg)];
    expect(extractPreview(lines).lastUserMessage!.length).toBe(600);
  });

  it("returns zero counts for empty input", () => {
    const preview = extractPreview([]);
    expect(preview.messageCount).toBe(0);
    expect(preview.lastUserMessage).toBeNull();
    expect(preview.lastAssistantText).toBeNull();
  });

  it("marks assistantIsNewer when assistant is last speaker", () => {
    const lines = [
      userLine("fix it"),
      assistantLine([textBlock("Done.")]),
    ];
    expect(extractPreview(lines).assistantIsNewer).toBe(true);
  });

  it("marks assistantIsNewer false when user is last speaker", () => {
    const lines = [
      assistantLine([textBlock("Done.")]),
      userLine("thanks, now do this"),
    ];
    expect(extractPreview(lines).assistantIsNewer).toBe(false);
  });

  it("filters out system-injected XML messages", () => {
    const lines = [
      userLine("fix the bug"),
      assistantLine([textBlock("Done.")]),
      userLine('<local-command-caveat>Caveat: The messages below were generated...</local-command-caveat>'),
    ];
    const preview = extractPreview(lines);
    expect(preview.lastUserMessage).toBe("fix the bug");
  });

  it("filters out <system-reminder> messages", () => {
    const lines = [
      userLine('<system-reminder>Remember to follow style guidelines</system-reminder>'),
    ];
    const preview = extractPreview(lines);
    expect(preview.lastUserMessage).toBeNull();
    expect(preview.messageCount).toBe(0);
  });

  it("resets preview state on /clear command", () => {
    const lines = [
      userLine("fix the bug"),
      assistantLine([textBlock("I fixed it.")]),
      userLine('<command-name>/clear</command-name>'),
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
      userLine('<command-name>/clear</command-name>'),
      userLine("new message"),
      assistantLine([textBlock("new reply")]),
    ];
    const preview = extractPreview(lines);
    expect(preview.lastUserMessage).toBe("new message");
    expect(preview.lastAssistantText).toBe("new reply");
    expect(preview.messageCount).toBe(2);
  });

  it("extracts skill name from Skill tool input", () => {
    const lines = [
      assistantLine([toolUseBlock("Skill", { skill: "octo:review" })]),
    ];
    expect(extractPreview(lines).lastTools[0].input).toBe("octo:review");
  });

  it("extracts description from Agent tool input", () => {
    const lines = [
      assistantLine([toolUseBlock("Agent", { description: "Run tests", prompt: "ignored" })]),
    ];
    expect(extractPreview(lines).lastTools[0].input).toBe("Run tests");
  });

  it("falls back to prompt when Agent has no description", () => {
    const lines = [
      assistantLine([toolUseBlock("Agent", { prompt: "Do something" })]),
    ];
    expect(extractPreview(lines).lastTools[0].input).toBe("Do something");
  });

  it("uses first short string value for unknown tool", () => {
    const lines = [
      assistantLine([toolUseBlock("CustomTool", { option: "value" })]),
    ];
    expect(extractPreview(lines).lastTools[0].input).toBe("value");
  });

  it("returns null input for unknown tool with no short string values", () => {
    const lines = [
      assistantLine([toolUseBlock("CustomTool", { data: "x".repeat(700) })]),
    ];
    expect(extractPreview(lines).lastTools[0].input).toBeNull();
  });

  it("counts and shows user message for XML-mixed content (system tag + real text)", () => {
    const lines = [
      userLine("<system-reminder>Follow style</system-reminder>Build the feature"),
    ];
    const preview = extractPreview(lines);
    expect(preview.lastUserMessage).toBe("Build the feature");
    expect(preview.messageCount).toBe(1);
  });

  it("detects command substitution warning in Bash tool", () => {
    const lines = [
      assistantLine([toolUseBlock("Bash", { command: "echo $(whoami)", description: "Print username" })]),
    ];
    const preview = extractPreview(lines);
    expect(preview.lastTools[0].warnings).toContain("Command contains $() command substitution");
    expect(preview.lastTools[0].description).toBe("Print username");
  });

  it("detects multiple warnings", () => {
    const lines = [
      assistantLine([toolUseBlock("Bash", { command: "sudo rm -rf /tmp/foo | sh" })]),
    ];
    const warnings = extractPreview(lines).lastTools[0].warnings;
    expect(warnings).toContain("Recursive or forced file deletion");
    expect(warnings).toContain("Runs with elevated privileges");
    expect(warnings).toContain("Pipes to shell interpreter");
  });

  it("returns no warnings for safe commands", () => {
    const lines = [
      assistantLine([toolUseBlock("Bash", { command: "npm test" })]),
    ];
    expect(extractPreview(lines).lastTools[0].warnings).toEqual([]);
  });

  it("returns no warnings for non-Bash tools", () => {
    const lines = [
      assistantLine([toolUseBlock("Read", { file_path: "/etc/passwd" })]),
    ];
    expect(extractPreview(lines).lastTools[0].warnings).toEqual([]);
  });
});

describe("lastMessageHasError", () => {
  it("detects error + failed in last assistant message", () => {
    const lines = [
      assistantLine([textBlock("An error occurred and the command failed.")]),
    ];
    expect(lastMessageHasError(lines)).toBe(true);
  });

  it("returns false when only error (no failed)", () => {
    const lines = [
      assistantLine([textBlock("There was an error.")]),
    ];
    expect(lastMessageHasError(lines)).toBe(false);
  });

  it("returns false for empty lines", () => {
    expect(lastMessageHasError([])).toBe(false);
  });

  it("returns false when last meaningful message is from user", () => {
    const lines = [
      assistantLine([textBlock("error and failed here")]),
      userLine("okay thanks"),
    ];
    expect(lastMessageHasError(lines)).toBe(false);
  });

  it("skips progress/system lines to find last real message", () => {
    const lines = [
      assistantLine([textBlock("error and failed here")]),
      { type: "progress" },
    ];
    expect(lastMessageHasError(lines)).toBe(true);
  });
});

describe("hasPendingToolUse", () => {
  it("returns true when last message is assistant with tool_use", () => {
    const lines = [
      assistantLine([textBlock("Let me check."), toolUseBlock("Bash", { command: "ls" })]),
    ];
    expect(hasPendingToolUse(lines)).toBe(true);
  });

  it("returns false when last message is user (tool_result came back)", () => {
    const lines = [
      assistantLine([toolUseBlock("Bash", { command: "ls" })]),
      userLine("tool result here"),
    ];
    expect(hasPendingToolUse(lines)).toBe(false);
  });

  it("returns false for empty lines", () => {
    expect(hasPendingToolUse([])).toBe(false);
  });

  it("skips progress lines", () => {
    const lines = [
      assistantLine([toolUseBlock("Read", { file_path: "/x" })]),
      { type: "progress" },
    ];
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
    const lines = [
      userLine("hello"),
      assistantLine([textBlock("Hi! How can I help you today?")]),
    ];
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
      { type: "assistant", message: { role: "assistant", content: [textBlock("Shall I proceed?")], stop_reason: "max_tokens" } },
    ];
    expect(isAskingForInput(lines)).toBe(false);
  });

  it("returns false when last speaker is user", () => {
    const lines = [
      assistantLine([textBlock("Shall I proceed?")]),
      userLine("yes"),
    ];
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
    const lines = [
      assistantLine([textBlock("Reading..."), toolUseBlock("Read", { file_path: "/x" })]),
    ];
    const msgs = linesToConversation(lines);
    expect(msgs[0].toolUses).toEqual([{ name: "Read", input: { file_path: "/x" } }]);
  });

  it("concatenates multiple text blocks", () => {
    const lines = [
      assistantLine([textBlock("Part 1"), textBlock("Part 2")]),
    ];
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
      { ...userLine('<system-reminder>Be helpful</system-reminder>'), timestamp: "t2" },
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
      userLine('<system-reminder>You are Claude Code</system-reminder>'),
      userLine("Build the auth module"),
    ];
    const summary = extractTaskSummary(lines);
    expect(summary).not.toBeNull();
    expect(summary!.title).toBe("Build the auth module");
  });
});

describe("readTokenUsage", () => {
  const tmpFile = join(tmpdir(), `session-reader-test-${process.pid}.jsonl`);

  afterEach(async () => {
    await unlink(tmpFile).catch(() => {});
  });

  function assistantJsonl(model: string, usage: Record<string, number>, extra = {}): string {
    return JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [], model, usage, ...extra },
    });
  }

  it("returns null for nonexistent file", async () => {
    expect(await readTokenUsage("/nonexistent/path.jsonl")).toBeNull();
  });

  it("returns null when file has no assistant lines with usage", async () => {
    await writeFile(tmpFile, [
      JSON.stringify({ type: "user", message: { role: "human", content: "hello" } }),
      JSON.stringify({ type: "system", sessionId: "abc" }),
    ].join("\n"));
    expect(await readTokenUsage(tmpFile)).toBeNull();
  });

  it("aggregates tokens from a single model", async () => {
    await writeFile(tmpFile, [
      assistantJsonl("claude-sonnet-4-6", { input_tokens: 100, output_tokens: 200, cache_creation_input_tokens: 50, cache_read_input_tokens: 30 }),
      assistantJsonl("claude-sonnet-4-6", { input_tokens: 50, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 100 }),
    ].join("\n"));
    const usage = await readTokenUsage(tmpFile);
    expect(usage).not.toBeNull();
    expect(usage!["claude-sonnet-4-6"]).toEqual({
      inputTokens: 150,
      outputTokens: 280,
      cacheCreationTokens: 50,
      cacheReadTokens: 130,
    });
  });

  it("aggregates tokens across multiple models", async () => {
    await writeFile(tmpFile, [
      assistantJsonl("claude-sonnet-4-6", { input_tokens: 100, output_tokens: 200 }),
      assistantJsonl("claude-opus-4-6", { input_tokens: 500, output_tokens: 300 }),
    ].join("\n"));
    const usage = await readTokenUsage(tmpFile);
    expect(usage).not.toBeNull();
    expect(Object.keys(usage!)).toHaveLength(2);
    expect(usage!["claude-sonnet-4-6"].inputTokens).toBe(100);
    expect(usage!["claude-opus-4-6"].inputTokens).toBe(500);
  });

  it("skips lines missing model or usage fields", async () => {
    await writeFile(tmpFile, [
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: [] } }),
      assistantJsonl("claude-sonnet-4-6", { input_tokens: 10, output_tokens: 20 }),
    ].join("\n"));
    const usage = await readTokenUsage(tmpFile);
    expect(Object.keys(usage!)).toHaveLength(1);
  });

  it("skips malformed JSON lines without throwing", async () => {
    await writeFile(tmpFile, [
      '{"type":"assistant","message":{"role":"assistant",BROKEN',
      assistantJsonl("claude-sonnet-4-6", { input_tokens: 10, output_tokens: 5 }),
    ].join("\n"));
    const usage = await readTokenUsage(tmpFile);
    expect(usage!["claude-sonnet-4-6"].inputTokens).toBe(10);
  });

  it("treats missing usage sub-fields as zero", async () => {
    await writeFile(tmpFile, assistantJsonl("claude-sonnet-4-6", { input_tokens: 42 }));
    const usage = await readTokenUsage(tmpFile);
    expect(usage!["claude-sonnet-4-6"]).toEqual({
      inputTokens: 42,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
  });
});

describe("getJsonlMtime", () => {
  const tmpFile = join(tmpdir(), `getJsonlMtime-test-${process.pid}.jsonl`);

  afterEach(async () => {
    await unlink(tmpFile).catch(() => {});
  });

  it("returns a Date for an existing file", async () => {
    await writeFile(tmpFile, "{}");
    const result = await getJsonlMtime(tmpFile);
    expect(result).toBeInstanceOf(Date);
  });

  it("returns null for a nonexistent file", async () => {
    expect(await getJsonlMtime("/nonexistent/path.jsonl")).toBeNull();
  });
});

describe("isAskingForInput — additional phrases", () => {
  function withToolThenAssistant(text: string) {
    return [
      { type: "user", message: { role: "human", content: "do it" } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }], stop_reason: "end_turn" } },
      { type: "user", message: { role: "human", content: "tool result" } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text }], stop_reason: "end_turn" } },
    ];
  }

  it("returns true for 'before I ...' with question mark", () => {
    expect(isAskingForInput(withToolThenAssistant("Before I make these changes, want me to show a diff?"))).toBe(true);
  });

  it("returns true for 'is that okay'", () => {
    expect(isAskingForInput(withToolThenAssistant("I've made the edits. Is that okay?"))).toBe(true);
  });

  it("returns true for 'does that look right'", () => {
    expect(isAskingForInput(withToolThenAssistant("The output is ready. Does that look right?"))).toBe(true);
  });

  it("returns true for 'let me know' with 'prefer'", () => {
    expect(isAskingForInput(withToolThenAssistant("Let me know which approach you prefer."))).toBe(true);
  });

  it("returns true for 'let me know' with 'choose'", () => {
    expect(isAskingForInput(withToolThenAssistant("Let me know which one to choose."))).toBe(true);
  });

  it("returns true for 'let me know' with 'decision'", () => {
    expect(isAskingForInput(withToolThenAssistant("Let me know once you've made a decision."))).toBe(true);
  });

  it("returns false for 'let me know' without preference/decision words", () => {
    expect(isAskingForInput(withToolThenAssistant("Let me know if you have any questions."))).toBe(false);
  });
});

describe("extractTaskSummary — XML-mixed messages", () => {
  it("uses stripped content when message is XML-wrapped but has real text", () => {
    const lines = [
      { type: "user", message: { role: "human", content: "<system-reminder>Follow style</system-reminder>Build the login page" } },
    ];
    const summary = extractTaskSummary(lines);
    expect(summary).not.toBeNull();
    expect(summary!.title).toBe("Build the login page");
  });
});

describe("readJsonlHead", () => {
  const tmpFile = join(tmpdir(), `readJsonlHead-test-${process.pid}.jsonl`);

  afterEach(async () => {
    await unlink(tmpFile).catch(() => {});
  });

  it("returns parsed lines from the top of the file", async () => {
    const lines = [
      JSON.stringify({ type: "system", sessionId: "abc" }),
      JSON.stringify({ type: "user", message: { content: "hello" } }),
      JSON.stringify({ type: "assistant", message: { content: [] } }),
    ];
    await writeFile(tmpFile, lines.join("\n"));
    const result = await readJsonlHead(tmpFile, 2);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("system");
    expect(result[1].type).toBe("user");
  });

  it("returns empty array for nonexistent file", async () => {
    expect(await readJsonlHead("/nonexistent/path.jsonl")).toEqual([]);
  });

  it("skips malformed JSON lines", async () => {
    await writeFile(tmpFile, ["BROKEN", JSON.stringify({ type: "user", message: { content: "hi" } })].join("\n"));
    const result = await readJsonlHead(tmpFile);
    expect(result.some((l) => l.type === "user")).toBe(true);
  });
});

describe("readJsonlTail", () => {
  const tmpFile = join(tmpdir(), `readJsonlTail-test-${process.pid}.jsonl`);

  afterEach(async () => {
    await unlink(tmpFile).catch(() => {});
  });

  it("returns parsed lines from the tail of the file", async () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({ type: "user", message: { content: `msg-${i}` } })
    );
    await writeFile(tmpFile, lines.join("\n"));
    const result = await readJsonlTail(tmpFile, 3);
    expect(result).toHaveLength(3);
    expect((result[result.length - 1].message as { content: string }).content).toBe("msg-9");
  });

  it("returns empty array for nonexistent file", async () => {
    expect(await readJsonlTail("/nonexistent/path.jsonl")).toEqual([]);
  });
});

describe("readFullConversation", () => {
  const tmpFile = join(tmpdir(), `readFullConversation-test-${process.pid}.jsonl`);

  afterEach(async () => {
    await unlink(tmpFile).catch(() => {});
  });

  it("returns all parsed lines", async () => {
    const lines = [
      JSON.stringify({ type: "user", message: { content: "first" } }),
      JSON.stringify({ type: "assistant", message: { content: [] } }),
      JSON.stringify({ type: "user", message: { content: "second" } }),
    ];
    await writeFile(tmpFile, lines.join("\n"));
    const result = await readFullConversation(tmpFile);
    expect(result).toHaveLength(3);
  });

  it("returns empty array for nonexistent file", async () => {
    expect(await readFullConversation("/nonexistent/path.jsonl")).toEqual([]);
  });

  it("skips malformed lines", async () => {
    await writeFile(tmpFile, ["BROKEN", JSON.stringify({ type: "user", message: { content: "ok" } })].join("\n"));
    const result = await readFullConversation(tmpFile);
    expect(result).toHaveLength(1);
  });
});
