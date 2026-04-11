import { execFile } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Resolve the user's login shell PATH. macOS GUI apps (DMG builds) inherit a
 * minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) which doesn't include
 * user-installed CLI tools. We source the login shell once to pick up the
 * full PATH so spawned processes can find things like `claude`, `gh`, `cmux`, etc.
 *
 * The result is cached for the lifetime of the process.
 */
let resolved: NodeJS.ProcessEnv | undefined;

export async function getShellEnv(): Promise<NodeJS.ProcessEnv> {
  if (resolved) return resolved;
  try {
    const { stdout } = await execFileAsync("/bin/sh", ["-lc", "printenv PATH"], {
      timeout: 5000,
    });
    const shellPath = stdout.trim();
    resolved = { ...process.env, PATH: shellPath };
  } catch {
    // Fallback: augment current PATH with common install locations
    const home = homedir();
    const extra = [
      join(home, ".local", "bin"),
      join(home, ".claude", "bin"),
      "/usr/local/bin",
      "/opt/homebrew/bin",
    ].join(":");
    resolved = { ...process.env, PATH: `${extra}:${process.env.PATH ?? ""}` };
  }
  return resolved;
}
