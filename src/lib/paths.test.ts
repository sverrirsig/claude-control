import { join } from "path";
import { describe, expect, it } from "vitest";
import { CLAUDE_PROJECTS_DIR } from "./constants";
import { escapedPathToProjectDir, repoNameFromPath, workingDirToEscapedPath, workingDirToProjectDir } from "./paths";

describe("workingDirToEscapedPath", () => {
  it("replaces slashes with dashes", () => {
    expect(workingDirToEscapedPath("/Users/alli/project")).toBe("-Users-alli-project");
  });

  it("handles path without leading slash", () => {
    expect(workingDirToEscapedPath("project")).toBe("project");
  });

  it("handles root path", () => {
    expect(workingDirToEscapedPath("/")).toBe("-");
  });
});

describe("escapedPathToProjectDir", () => {
  it("joins with CLAUDE_PROJECTS_DIR", () => {
    expect(escapedPathToProjectDir("-Users-alli-project")).toBe(join(CLAUDE_PROJECTS_DIR, "-Users-alli-project"));
  });
});

describe("workingDirToProjectDir", () => {
  it("composes escape + join", () => {
    expect(workingDirToProjectDir("/Users/alli/project")).toBe(join(CLAUDE_PROJECTS_DIR, "-Users-alli-project"));
  });
});

describe("repoNameFromPath", () => {
  it("returns last path segment", () => {
    expect(repoNameFromPath("/Users/alli/my-repo")).toBe("my-repo");
  });

  it("handles trailing slash", () => {
    expect(repoNameFromPath("/Users/alli/my-repo/")).toBe("my-repo");
  });

  it("handles single segment", () => {
    expect(repoNameFromPath("my-repo")).toBe("my-repo");
  });

  it("returns original string for root path", () => {
    expect(repoNameFromPath("/")).toBe("/");
  });
});
