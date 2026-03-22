import { CLAUDE_PROJECTS_DIR } from "./constants";
import { join } from "path";
import { homedir } from "os";

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

/**
 * Remap a path written on a different host (e.g. macOS) to the current
 * environment's home directory. Handles the case where the app runs in a
 * container whose home is /root but paths in hook/JSONL files still carry
 * the original host home prefix (e.g. /Users/name/...).
 *
 * If the path already starts with the current homedir, it is returned as-is.
 * If the path starts with /home/... or /Users/..., the leading home segment
 * is replaced with the current homedir().
 */
export function normalizeHostPath(p: string | null): string | null {
  if (!p) return p;
  const home = homedir();
  if (p.startsWith(home)) return p;

  // Match /Users/<name>/... or /home/<name>/...
  const m = p.match(/^(?:\/Users\/[^/]+|\/home\/[^/]+)(\/.*)?$/);
  if (m) return home + (m[1] ?? "");

  return p;
}
