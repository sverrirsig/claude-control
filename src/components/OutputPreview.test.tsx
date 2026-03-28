// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { OutputPreview } from "./OutputPreview";
import type { ConversationPreview } from "@/lib/types";

function preview(overrides: Partial<ConversationPreview> = {}): ConversationPreview {
  return {
    lastUserMessage: null,
    lastAssistantText: null,
    assistantIsNewer: false,
    lastTools: [],
    messageCount: 0,
    ...overrides,
  };
}

describe("OutputPreview — empty state", () => {
  it("shows 'No messages yet' when messageCount is 0", () => {
    render(<OutputPreview preview={preview()} />);
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
  });
});

describe("OutputPreview — idle state", () => {
  it("shows assistant completion summary when idle and assistantIsNewer", () => {
    render(
      <OutputPreview
        preview={preview({ lastAssistantText: "Done! I updated the file.", assistantIsNewer: true, messageCount: 2 })}
        status="idle"
      />
    );
    expect(screen.getByText("Done! I updated the file.")).toBeInTheDocument();
  });

  it("shows user message prefix when idle with both messages", () => {
    render(
      <OutputPreview
        preview={preview({
          lastUserMessage: "fix the bug",
          lastAssistantText: "Fixed it.",
          assistantIsNewer: true,
          messageCount: 2,
        })}
        status="idle"
      />
    );
    expect(screen.getByText("fix the bug")).toBeInTheDocument();
    expect(screen.getByText("Fixed it.")).toBeInTheDocument();
  });

  it("does not show assistant summary when assistantIsNewer is false", () => {
    render(
      <OutputPreview
        preview={preview({ lastUserMessage: "next task", lastAssistantText: "old reply", assistantIsNewer: false, messageCount: 2 })}
        status="idle"
      />
    );
    expect(screen.queryByText("old reply")).not.toBeInTheDocument();
    expect(screen.getByText("next task")).toBeInTheDocument();
  });
});

describe("OutputPreview — working state with tools (log stream)", () => {
  it("renders tool name and input as a log line", () => {
    render(
      <OutputPreview
        preview={preview({
          lastUserMessage: "implement feature",
          lastTools: [{ name: "Read", input: "src/lib/discovery.ts", description: null, warnings: [] }],
          assistantIsNewer: true,
          messageCount: 2,
        })}
        status="working"
      />
    );
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("src/lib/discovery.ts")).toBeInTheDocument();
  });

  it("renders multiple tool log lines", () => {
    render(
      <OutputPreview
        preview={preview({
          lastTools: [
            { name: "Bash", input: "npm run build", description: null, warnings: [] },
            { name: "Edit", input: "src/app/page.tsx", description: null, warnings: [] },
          ],
          assistantIsNewer: true,
          messageCount: 3,
        })}
        status="working"
      />
    );
    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.getByText("npm run build")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("src/app/page.tsx")).toBeInTheDocument();
  });

  it("shows prompt as dim header above log lines", () => {
    render(
      <OutputPreview
        preview={preview({
          lastUserMessage: "refactor the auth module",
          lastTools: [{ name: "Glob", input: "**/*.ts", description: null, warnings: [] }],
          messageCount: 2,
        })}
        status="working"
      />
    );
    expect(screen.getByText("refactor the auth module")).toBeInTheDocument();
    expect(screen.getByText("Glob")).toBeInTheDocument();
  });

  it("renders tool with no input gracefully", () => {
    render(
      <OutputPreview
        preview={preview({
          lastTools: [{ name: "Agent", input: null, description: null, warnings: [] }],
          messageCount: 2,
        })}
        status="working"
      />
    );
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("shows assistant text below tools when assistantIsNewer", () => {
    render(
      <OutputPreview
        preview={preview({
          lastTools: [{ name: "Bash", input: "git status", description: null, warnings: [] }],
          lastAssistantText: "Running the build...",
          assistantIsNewer: true,
          messageCount: 3,
        })}
        status="working"
      />
    );
    expect(screen.getByText("Running the build...")).toBeInTheDocument();
  });
});

describe("OutputPreview — working state without tools", () => {
  it("shows user prompt prominently when no tools yet", () => {
    render(
      <OutputPreview
        preview={preview({ lastUserMessage: "add a new endpoint", messageCount: 1 })}
        status="working"
      />
    );
    expect(screen.getByText("add a new endpoint")).toBeInTheDocument();
  });

  it("shows assistant text when assistantIsNewer and no tools", () => {
    render(
      <OutputPreview
        preview={preview({
          lastUserMessage: "explain this",
          lastAssistantText: "This function does...",
          assistantIsNewer: true,
          messageCount: 2,
        })}
        status="working"
      />
    );
    expect(screen.getByText("explain this")).toBeInTheDocument();
    expect(screen.getByText("This function does...")).toBeInTheDocument();
  });
});

describe("OutputPreview — waiting state", () => {
  it("shows tool badges (not log lines) when waiting", () => {
    render(
      <OutputPreview
        preview={preview({
          lastUserMessage: "deploy to prod",
          lastTools: [{ name: "Bash", input: "rm -rf /", description: null, warnings: [] }],
          messageCount: 2,
        })}
        status="waiting"
      />
    );
    expect(screen.getByText("Bash")).toBeInTheDocument();
  });
});

describe("OutputPreview — FormattedSummary bullet rendering", () => {
  it("renders plain text as a single paragraph when no bullets", () => {
    render(
      <OutputPreview
        preview={preview({
          lastAssistantText: "All done, no bullets here.",
          assistantIsNewer: true,
          messageCount: 2,
        })}
        status="idle"
      />
    );
    expect(screen.getByText("All done, no bullets here.")).toBeInTheDocument();
  });

  it("renders bullet items as individual list entries", () => {
    render(
      <OutputPreview
        preview={preview({
          lastAssistantText: "Summary:\n- First item\n- Second item",
          assistantIsNewer: true,
          messageCount: 2,
        })}
        status="idle"
      />
    );
    expect(screen.getByText("First item")).toBeInTheDocument();
    expect(screen.getByText("Second item")).toBeInTheDocument();
  });

  it("renders non-bullet lines as paragraphs within a bulleted block", () => {
    render(
      <OutputPreview
        preview={preview({
          lastAssistantText: "Header line\n- Bullet one\n- Bullet two",
          assistantIsNewer: true,
          messageCount: 2,
        })}
        status="idle"
      />
    );
    expect(screen.getByText("Header line")).toBeInTheDocument();
    expect(screen.getByText("Bullet one")).toBeInTheDocument();
  });

  it("supports • and * as bullet markers", () => {
    render(
      <OutputPreview
        preview={preview({
          lastAssistantText: "Items:\n• Alpha\n* Beta",
          assistantIsNewer: true,
          messageCount: 2,
        })}
        status="idle"
      />
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("skips blank lines in bulleted text", () => {
    render(
      <OutputPreview
        preview={preview({
          lastAssistantText: "Title\n\n- Item A\n\n- Item B",
          assistantIsNewer: true,
          messageCount: 2,
        })}
        status="idle"
      />
    );
    expect(screen.getByText("Item A")).toBeInTheDocument();
    expect(screen.getByText("Item B")).toBeInTheDocument();
  });
});
