import { join } from "path";
import { CLAUDE_PROJECTS_DIR } from "./constants";

export function workingDirToEscapedPath(workingDir: string): string {
  return workingDir.replace(/\//g, "-");
}

export function escapedPathToProjectDir(escaped: string): string {
  return join(CLAUDE_PROJECTS_DIR, escaped);
}

export function workingDirToProjectDir(workingDir: string): string {
  return escapedPathToProjectDir(workingDirToEscapedPath(workingDir));
}

export function repoNameFromPath(workingDir: string): string {
  const parts = workingDir.split("/").filter(Boolean);
  return parts[parts.length - 1] || workingDir;
}
