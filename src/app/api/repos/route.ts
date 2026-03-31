import { readdir, stat } from "fs/promises";
import { NextResponse } from "next/server";
import { homedir } from "os";
import { join } from "path";
import { loadConfig, saveConfig } from "@/lib/config";

interface RepoInfo {
  name: string;
  path: string;
  isGitRepo: boolean;
}

async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await stat(join(dirPath, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function scanForRepos(baseDir: string): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [];
  try {
    const entries = await readdir(baseDir);
    const visible = entries.filter((e) => !e.startsWith("."));

    await Promise.all(
      visible.map(async (entry) => {
        const fullPath = join(baseDir, entry);
        try {
          const s = await stat(fullPath);
          if (!s.isDirectory()) return;

          if (await isGitRepo(fullPath)) {
            repos.push({ name: entry, path: fullPath, isGitRepo: true });
          } else {
            // Not a git repo — scan one level deeper (e.g. ~/Code/org-name/repo)
            try {
              const children = await readdir(fullPath);
              await Promise.all(
                children
                  .filter((c) => !c.startsWith("."))
                  .map(async (child) => {
                    const childPath = join(fullPath, child);
                    try {
                      const cs = await stat(childPath);
                      if (!cs.isDirectory()) return;
                      if (await isGitRepo(childPath)) {
                        repos.push({ name: `${entry}/${child}`, path: childPath, isGitRepo: true });
                      }
                    } catch {
                      // skip
                    }
                  }),
              );
            } catch {
              // can't read subdir
            }
          }
        } catch {
          // skip
        }
      }),
    );
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

    const results = await Promise.all(config.codeDirectories.map(scanForRepos));
    for (const repos of results) {
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
