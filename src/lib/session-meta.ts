import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".claude-control");
const META_FILE = join(CONFIG_DIR, "session-meta.json");

export interface SessionMetaOverrides {
  title?: string;
  description?: string;
}

type SessionMetaStore = Record<string, SessionMetaOverrides>;

// In-memory cache — only re-read the file when mtime changes
let cache: SessionMetaStore = {};
let cachedMtime = 0;

export async function loadSessionMeta(): Promise<SessionMetaStore> {
  try {
    const s = await stat(META_FILE);
    if (s.mtimeMs === cachedMtime) return cache;

    const raw = await readFile(META_FILE, "utf-8");
    cache = JSON.parse(raw);
    cachedMtime = s.mtimeMs;
    return cache;
  } catch {
    return cache;
  }
}

export async function saveSessionMeta(
  sessionId: string,
  overrides: { title?: string | null; description?: string | null },
): Promise<void> {
  const store = await loadSessionMeta();

  const entry: SessionMetaOverrides = store[sessionId] ?? {};

  if (overrides.title === null || overrides.title === "") {
    delete entry.title;
  } else if (overrides.title !== undefined) {
    entry.title = overrides.title;
  }

  if (overrides.description === null || overrides.description === "") {
    delete entry.description;
  } else if (overrides.description !== undefined) {
    entry.description = overrides.description;
  }

  if (Object.keys(entry).length === 0) {
    delete store[sessionId];
  } else {
    store[sessionId] = entry;
  }

  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(META_FILE, JSON.stringify(store, null, 2));

  // Update cache immediately after write
  cache = store;
  const s = await stat(META_FILE);
  cachedMtime = s.mtimeMs;
}
