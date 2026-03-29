import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".claude-control");
const LAYOUT_FILE = join(CONFIG_DIR, "dashboard-layout.json");

export interface DashboardLayout {
  sectionOrder: string[];
  cardOrder: Record<string, string[]>;
}

const EMPTY_LAYOUT: DashboardLayout = { sectionOrder: [], cardOrder: {} };

// In-memory cache — only re-read the file when mtime changes
let cache: DashboardLayout = { ...EMPTY_LAYOUT };
let cachedMtime = 0;

export async function loadDashboardLayout(): Promise<DashboardLayout> {
  try {
    const s = await stat(LAYOUT_FILE);
    if (s.mtimeMs === cachedMtime) return cache;

    const raw = await readFile(LAYOUT_FILE, "utf-8");
    cache = { ...EMPTY_LAYOUT, ...JSON.parse(raw) };
    cachedMtime = s.mtimeMs;
    return cache;
  } catch {
    return cache;
  }
}

export async function saveDashboardLayout(updates: Partial<DashboardLayout>): Promise<void> {
  const store = await loadDashboardLayout();

  if (updates.sectionOrder !== undefined) {
    store.sectionOrder = updates.sectionOrder;
  }

  if (updates.cardOrder !== undefined) {
    store.cardOrder = { ...store.cardOrder, ...updates.cardOrder };
  }

  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(LAYOUT_FILE, JSON.stringify(store, null, 2));

  // Update cache immediately after write
  cache = store;
  const s = await stat(LAYOUT_FILE);
  cachedMtime = s.mtimeMs;
}
