import { NextResponse } from "next/server";
import { readdir, stat, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const CONFIG_DIR = join(homedir(), ".claude-control");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface RepoInfo {
  name: string;
  path: string;
  isGitRepo: boolean;
}

interface Config {
  codeDirectories: string[];
}

async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { codeDirectories: [] };
  }
}

async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["-C", dirPath, "rev-parse", "--git-dir"], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function scanForRepos(baseDir: string): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [];
  try {
    const entries = await readdir(baseDir);
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const fullPath = join(baseDir, entry);
      try {
        const s = await stat(fullPath);
        if (!s.isDirectory()) continue;

        const gitRepo = await isGitRepo(fullPath);
        if (gitRepo) {
          repos.push({ name: entry, path: fullPath, isGitRepo: true });
        } else {
          // Not a git repo — scan one level deeper (e.g. ~/Code/org-name/repo)
          const children = await readdir(fullPath);
          for (const child of children) {
            if (child.startsWith(".")) continue;
            const childPath = join(fullPath, child);
            try {
              const cs = await stat(childPath);
              if (!cs.isDirectory()) continue;
              const childGit = await isGitRepo(childPath);
              if (childGit) {
                repos.push({ name: `${entry}/${child}`, path: childPath, isGitRepo: true });
              }
            } catch {
              continue;
            }
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // can't read directory
  }
  return repos;
}

export async function GET() {
  try {
    const config = await loadConfig();

    if (config.codeDirectories.length === 0) {
      return NextResponse.json({ repos: [], needsSetup: true });
    }

    const allRepos: RepoInfo[] = [];
    const seen = new Set<string>();

    for (const dir of config.codeDirectories) {
      const repos = await scanForRepos(dir);
      for (const repo of repos) {
        if (!seen.has(repo.path)) {
          seen.add(repo.path);
          allRepos.push(repo);
        }
      }
    }

    allRepos.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ repos: allRepos, needsSetup: false });
  } catch (error) {
    console.error("Failed to list repos:", error);
    return NextResponse.json({ repos: [], needsSetup: true });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { directory } = body as { directory: string };

    if (!directory) {
      return NextResponse.json({ error: "Missing directory" }, { status: 400 });
    }

    // Expand ~ to home directory
    if (directory.startsWith("~/")) {
      directory = join(homedir(), directory.slice(2));
    } else if (directory === "~") {
      directory = homedir();
    }

    // Verify it exists
    try {
      await stat(directory);
    } catch {
      return NextResponse.json({ error: "Directory does not exist" }, { status: 404 });
    }

    const config = await loadConfig();
    if (!config.codeDirectories.includes(directory)) {
      config.codeDirectories.push(directory);
      await saveConfig(config);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save config:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
