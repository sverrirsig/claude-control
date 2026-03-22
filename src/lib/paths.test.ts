import { describe, it, expect } from "vitest";
import { homedir } from "os";
import { workingDirToEscapedPath, escapedPathToProjectDir, workingDirToProjectDir, repoNameFromPath, normalizeHostPath } from "./paths";
import { CLAUDE_PROJECTS_DIR } from "./constants";
import { join } from "path";

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
    expect(escapedPathToProjectDir("-Users-alli-project")).toBe(
      join(CLAUDE_PROJECTS_DIR, "-Users-alli-project")
    );
  });
});

describe("workingDirToProjectDir", () => {
  it("composes escape + join", () => {
    expect(workingDirToProjectDir("/Users/alli/project")).toBe(
      join(CLAUDE_PROJECTS_DIR, "-Users-alli-project")
    );
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

describe("normalizeHostPath", () => {
  const home = homedir();

  it("returns null for null input", () => {
    expect(normalizeHostPath(null)).toBeNull();
  });

  it("returns path unchanged if already under current homedir", () => {
    const p = `${home}/projects/foo`;
    expect(normalizeHostPath(p)).toBe(p);
  });

  it("remaps /Users/<name>/... to current homedir", () => {
    expect(normalizeHostPath("/Users/otheruser/Repos/myapp")).toBe(`${home}/Repos/myapp`);
  });

  it("remaps /home/<name>/... to current homedir", () => {
    expect(normalizeHostPath("/home/otheruser/Repos/myapp")).toBe(`${home}/Repos/myapp`);
  });

  it("remaps path with no trailing segment", () => {
    expect(normalizeHostPath("/Users/otheruser")).toBe(home);
  });

  it("returns path unchanged when it does not match any home pattern", () => {
    expect(normalizeHostPath("/tmp/somefile")).toBe("/tmp/somefile");
  });

  it("returns empty string unchanged", () => {
    expect(normalizeHostPath("")).toBe("");
  });
});
