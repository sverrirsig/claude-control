import { homedir } from "os";
import { join } from "path";

/**
 * Return process.env with common tool paths guaranteed present.
 * The Electron main process resolves the user's login shell PATH at startup
 * and sets process.env.PATH before spawning the server. This function exists
 * as a safety net for dev mode or if the main-process resolution missed something.
 */
let resolved: NodeJS.ProcessEnv | undefined;

export async function getShellEnv(): Promise<NodeJS.ProcessEnv> {
  if (resolved) return resolved;

  const home = homedir();
  const extraPaths = [
    join(home, ".local", "bin"),
    join(home, ".claude", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
  ];

  const parts = (process.env.PATH || "").split(":");
  for (const p of extraPaths) {
    if (!parts.includes(p)) parts.push(p);
  }
  resolved = { ...process.env, PATH: parts.join(":") };
  return resolved;
}
