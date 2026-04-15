# Stale Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark sessions with no activity past a configurable threshold as "stale" — visually dim them with a small badge, and add a discoverable header pill that toggles hiding them entirely.

**Architecture:** Pure client-side derivation. No changes to server discovery or `ClaudeSession` type. A small helper compares `lastActivity` to a configurable threshold; the dashboard filters on toggle. Threshold persists in `~/.claude-control/config.json`; the hide toggle persists in `localStorage` (mirrors `viewMode`).

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / Vitest.

Spec: `docs/superpowers/specs/2026-04-15-stale-sessions-design.md`.

---

### Task 1: Stale predicate + tests

**Files:**
- Create: `src/lib/stale.ts`
- Create: `src/lib/stale.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/stale.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isSessionStale } from "./stale";

describe("isSessionStale", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when activity is just inside the threshold", () => {
    // 89 minutes ago, threshold 90
    const lastActivity = new Date("2026-04-15T10:31:00Z").toISOString();
    expect(isSessionStale(lastActivity, 90)).toBe(false);
  });

  it("returns false when activity is exactly at the threshold", () => {
    // exactly 90 minutes ago
    const lastActivity = new Date("2026-04-15T10:30:00Z").toISOString();
    expect(isSessionStale(lastActivity, 90)).toBe(false);
  });

  it("returns true when activity is just past the threshold", () => {
    // 91 minutes ago
    const lastActivity = new Date("2026-04-15T10:29:00Z").toISOString();
    expect(isSessionStale(lastActivity, 90)).toBe(true);
  });

  it("returns false for activity in the future (clock skew)", () => {
    const lastActivity = new Date("2026-04-15T13:00:00Z").toISOString();
    expect(isSessionStale(lastActivity, 90)).toBe(false);
  });

  it("respects a smaller threshold", () => {
    const lastActivity = new Date("2026-04-15T11:50:00Z").toISOString(); // 10 min ago
    expect(isSessionStale(lastActivity, 5)).toBe(true);
    expect(isSessionStale(lastActivity, 15)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/stale.test.ts`
Expected: FAIL with "Cannot find module './stale'".

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/stale.ts`:

```ts
/**
 * A session is stale if it has had no activity (Claude or user) for longer
 * than the threshold. Determined purely from `lastActivity` (the JSONL
 * mtime), so working/waiting sessions naturally don't qualify because
 * their JSONL keeps being written.
 */
export function isSessionStale(lastActivity: string, thresholdMinutes: number): boolean {
  const elapsedMs = Date.now() - new Date(lastActivity).getTime();
  if (elapsedMs < 0) return false; // future timestamp — clock skew
  return elapsedMs > thresholdMinutes * 60_000;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/stale.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stale.ts src/lib/stale.test.ts
git commit -m "feat(stale): add isSessionStale predicate"
```

---

### Task 2: Add staleThresholdMinutes to AppConfig

**Files:**
- Modify: `src/lib/config.ts`
- Modify: `src/app/api/settings/route.ts:155-172`

- [ ] **Step 1: Add the field to `AppConfig` and default**

In `src/lib/config.ts`, add the field to the `AppConfig` interface and `DEFAULT_CONFIG`:

```ts
export interface AppConfig {
  // ...existing fields...
  showKeyboardHints: boolean;
  staleThresholdMinutes: number;
}
```

```ts
const DEFAULT_CONFIG: AppConfig = {
  // ...existing fields...
  showKeyboardHints: true,
  staleThresholdMinutes: 90,
};
```

- [ ] **Step 2: Persist the field through PUT**

In `src/app/api/settings/route.ts`, add to the `updated: AppConfig` object inside `PUT`:

```ts
const updated: AppConfig = {
  // ...existing fields...
  showKeyboardHints: body.showKeyboardHints !== undefined ? body.showKeyboardHints : current.showKeyboardHints,
  staleThresholdMinutes:
    typeof body.staleThresholdMinutes === "number" && body.staleThresholdMinutes >= 5
      ? Math.floor(body.staleThresholdMinutes)
      : current.staleThresholdMinutes,
};
```

(Validation: must be a number ≥ 5 minutes; otherwise keep the current value.)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/config.ts src/app/api/settings/route.ts
git commit -m "feat(stale): persist staleThresholdMinutes in config"
```

---

### Task 3: Expose staleThresholdMinutes via useSettings

**Files:**
- Modify: `src/hooks/useSettings.ts`

- [ ] **Step 1: Extend SettingsResponse and the hook return**

Replace the contents of `src/hooks/useSettings.ts` with:

```ts
import useSWR from "swr";

interface AppOption {
  id: string;
  installed: boolean;
}

interface SettingsResponse {
  config: {
    notifications: boolean;
    notificationSound: boolean;
    alwaysNotify: boolean;
    editor: string;
    gitGui: string;
    staleThresholdMinutes: number;
  };
  options: {
    editors: AppOption[];
    gitGuis: AppOption[];
  };
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isAppAvailable(options: AppOption[] | undefined, selectedId: string | undefined): boolean {
  if (!options || !selectedId || selectedId === "none") return false;
  return options.find((o) => o.id === selectedId)?.installed ?? false;
}

export const DEFAULT_STALE_THRESHOLD_MINUTES = 90;

export function useSettings() {
  const { data } = useSWR<SettingsResponse>("/api/settings", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 0,
  });

  return {
    notifications: data?.config?.notifications ?? true,
    notificationSound: data?.config?.notificationSound ?? true,
    alwaysNotify: data?.config?.alwaysNotify ?? false,
    staleThresholdMinutes: data?.config?.staleThresholdMinutes ?? DEFAULT_STALE_THRESHOLD_MINUTES,
    editorAvailable: isAppAvailable(data?.options?.editors, data?.config?.editor),
    gitGuiAvailable: isAppAvailable(data?.options?.gitGuis, data?.config?.gitGui),
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSettings.ts
git commit -m "feat(stale): expose staleThresholdMinutes via useSettings"
```

---

### Task 4: StalePill component

**Files:**
- Create: `src/components/StalePill.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/StalePill.tsx`:

```tsx
/**
 * Small uppercase pill rendered next to the status badge on stale session
 * cards/rows. Visually similar to the Worktree pill but in cool zinc to
 * match the dimmed, recessive look of the card.
 */
export function StalePill() {
  return (
    <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-sm bg-zinc-700/15 border border-zinc-700/30 text-zinc-400">
      Stale
    </span>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/StalePill.tsx
git commit -m "feat(stale): add StalePill component"
```

---

### Task 5: Render dim + StalePill on SessionCard

**Files:**
- Modify: `src/components/SessionCard.tsx`

- [ ] **Step 1: Add the `isStale` prop**

In `src/components/SessionCard.tsx`, import the pill at the top with the other component imports:

```tsx
import { StalePill } from "./StalePill";
```

Add `isStale` to the function signature props (right after `prStatus`):

```tsx
export function SessionCard({
  session,
  targetScreen,
  pulse,
  selected,
  shortcutNumber,
  actionFeedback,
  prStatus,
  isStale,
  onSelect,
  actedOn,
  onApproveReject,
  editing,
  onStartEdit,
  onSaveMeta,
  onCancelEdit,
}: {
  session: ClaudeSession;
  targetScreen?: number | null;
  pulse?: boolean;
  selected?: boolean;
  shortcutNumber?: number;
  actionFeedback?: { label: string; color: string } | null;
  prStatus?: PrStatus | null;
  isStale?: boolean;
  onSelect?: () => void;
  actedOn?: { action: "approve" | "reject"; at: number };
  onApproveReject?: (action: "approve" | "reject") => void;
  editing?: boolean;
  onStartEdit?: () => void;
  onSaveMeta?: (updates: { title?: string; description?: string }) => void;
  onCancelEdit?: () => void;
}) {
```

- [ ] **Step 2: Apply the dim wrapper class when stale**

Find the inner card `<div>` (the one with the `group relative flex flex-col rounded-xl ...` className that begins around line 156). Append the stale-related classes.

Locate this assignment / template-literal block:

```tsx
<div
  onClick={onSelect}
  className={`group relative flex flex-col rounded-xl border bg-[#0a0a0f]/80 backdrop-blur-xs p-5 card-hover cursor-pointer ${selected ? "ring-2 ring-blue-400 border-blue-400/50 shadow-[0_0_30px_rgba(96,165,250,0.25),0_0_60px_rgba(96,165,250,0.10)] scale-[1.02]" : styles.border} ${!selected ? styles.glow : ""} ${pulse ? "attention-pulse" : ""} ${cleanupState === "cleaning" ? "opacity-50 pointer-events-none" : ""}`}
>
```

Replace with:

```tsx
<div
  onClick={onSelect}
  className={`group relative flex flex-col rounded-xl border bg-[#0a0a0f]/80 backdrop-blur-xs p-5 card-hover cursor-pointer transition-opacity duration-200 ${selected ? "ring-2 ring-blue-400 border-blue-400/50 shadow-[0_0_30px_rgba(96,165,250,0.25),0_0_60px_rgba(96,165,250,0.10)] scale-[1.02]" : styles.border} ${!selected && !isStale ? styles.glow : ""} ${pulse ? "attention-pulse" : ""} ${cleanupState === "cleaning" ? "opacity-50 pointer-events-none" : ""} ${isStale && !selected ? "opacity-60 hover:opacity-100" : ""}`}
>
```

(Selection still wins; glow is suppressed when stale; opacity drops to 60% with hover restoring full.)

- [ ] **Step 3: Render StalePill next to StatusBadge**

Find the header line that renders the status badge near the end of the card header block:

```tsx
<StatusBadge status={displayStatus} orphaned={session.orphaned} />
```

Replace with:

```tsx
<div className="flex items-center gap-1.5 shrink-0">
  <StatusBadge status={displayStatus} orphaned={session.orphaned} />
  {isStale && <StalePill />}
</div>
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionCard.tsx
git commit -m "feat(stale): dim SessionCard and show StalePill when stale"
```

---

### Task 6: Render dim + STALE label on SessionRow (list view)

**Files:**
- Modify: `src/components/SessionRow.tsx`

- [ ] **Step 1: Add `isStale` prop**

In `src/components/SessionRow.tsx`, add `isStale` to the props:

```tsx
export function SessionRow({
  session,
  selected,
  shortcutNumber,
  prStatus,
  onSelect,
  displayStatus,
  isStale,
  onApproveReject,
}: {
  session: ClaudeSession;
  selected?: boolean;
  shortcutNumber?: number;
  prStatus?: PrStatus | null;
  onSelect?: () => void;
  displayStatus: SessionStatus;
  isStale?: boolean;
  onApproveReject?: (action: "approve" | "reject") => void;
}) {
```

- [ ] **Step 2: Apply opacity to the row wrapper**

Find the outer row `<div>` (currently begins with `className={\`group flex items-center gap-3 ...\`}`). Replace its className expression with:

```tsx
<div
  onClick={onSelect}
  className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-100 ${
    selected
      ? "bg-blue-500/8 border border-blue-400/30 shadow-[0_0_20px_rgba(96,165,250,0.1)]"
      : "bg-white/2 border border-transparent hover:bg-white/4 hover:border-white/6"
  } ${isStale && !selected ? "opacity-55 hover:opacity-100" : ""}`}
>
```

- [ ] **Step 3: Add STALE micro-label next to the orphaned label**

Find this block (currently around lines 70-72):

```tsx
{session.orphaned && (
  <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400">Orphaned</span>
)}
```

Append after the Orphaned label, inside the same status-dot wrapper `<div>`:

```tsx
{session.orphaned && (
  <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400">Orphaned</span>
)}
{isStale && (
  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Stale</span>
)}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionRow.tsx
git commit -m "feat(stale): dim SessionRow and show Stale label when stale"
```

---

### Task 7: Pass isStale through SessionGrid

**Files:**
- Modify: `src/components/SessionGrid.tsx`

- [ ] **Step 1: Import the predicate**

At the top of `src/components/SessionGrid.tsx`, add to the existing imports:

```tsx
import { isSessionStale } from "@/lib/stale";
```

- [ ] **Step 2: Accept threshold prop**

Add `staleThresholdMinutes` to the props (right after `actedSessions`):

```tsx
export function SessionGrid({
  sessions,
  viewMode,
  targetScreen,
  freshlyChanged,
  selectedIndex,
  onSelectIndex,
  actionFeedback,
  prStatuses,
  onNewSessionInRepo,
  actedSessions,
  staleThresholdMinutes,
  onApproveReject,
  editingSessionId,
  onStartEdit,
  onSaveMeta,
  onCancelEdit,
}: {
  sessions: ClaudeSession[];
  viewMode: ViewMode;
  targetScreen?: number | null;
  freshlyChanged?: Set<string>;
  selectedIndex?: number | null;
  onSelectIndex?: (idx: number | null) => void;
  actionFeedback?: { label: string; color: string } | null;
  prStatuses?: Record<string, PrStatus | null>;
  onNewSessionInRepo?: (repoPath: string, repoName: string) => void;
  actedSessions?: Record<string, { action: "approve" | "reject"; at: number }>;
  staleThresholdMinutes: number;
  onApproveReject?: (sessionId: string, action: "approve" | "reject") => void;
  editingSessionId?: string | null;
  onStartEdit?: (sessionId: string) => void;
  onSaveMeta?: (sessionId: string, updates: { title?: string; description?: string }) => void;
  onCancelEdit?: () => void;
}) {
```

- [ ] **Step 3: Compute and pass `isStale` in `renderCard` and `renderRow`**

Replace the existing `renderCard` and `renderRow` functions inside the component body:

```tsx
const renderCard = (session: ClaudeSession) => {
  const { key, idx, isSelected } = getSessionProps(session);
  const stale = isSessionStale(session.lastActivity, staleThresholdMinutes);
  return (
    <SessionCard
      key={key}
      session={session}
      targetScreen={targetScreen}
      pulse={freshlyChanged?.has(session.id)}
      selected={isSelected}
      shortcutNumber={idx < 9 ? idx + 1 : undefined}
      actionFeedback={isSelected ? actionFeedback : undefined}
      prStatus={session.prUrl ? (prStatuses?.[session.prUrl] ?? undefined) : undefined}
      isStale={stale}
      onSelect={() => onSelectIndex?.(isSelected ? null : idx)}
      actedOn={actedSessions?.[session.id]}
      onApproveReject={onApproveReject ? (action) => onApproveReject(session.id, action) : undefined}
      editing={editingSessionId === session.id}
      onStartEdit={onStartEdit ? () => onStartEdit(session.id) : undefined}
      onSaveMeta={onSaveMeta ? (updates) => onSaveMeta(session.id, updates) : undefined}
      onCancelEdit={onCancelEdit}
    />
  );
};

const renderRow = (session: ClaudeSession) => {
  const { key, idx, isSelected, displayStatus } = getSessionProps(session);
  const stale = isSessionStale(session.lastActivity, staleThresholdMinutes);
  return (
    <SessionRow
      key={key}
      session={session}
      selected={isSelected}
      shortcutNumber={idx < 9 ? idx + 1 : undefined}
      prStatus={session.prUrl ? (prStatuses?.[session.prUrl] ?? undefined) : undefined}
      isStale={stale}
      onSelect={() => onSelectIndex?.(isSelected ? null : idx)}
      displayStatus={displayStatus}
      onApproveReject={
        session.pid
          ? (action) => {
              sendKeystrokeForRow(session.pid!, action === "approve" ? "return" : "escape", session.id, action);
            }
          : undefined
      }
    />
  );
};
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: no errors (note: page.tsx will start failing to type-check in the next task because it's not yet passing the new required prop — that's expected; we'll fix it in Task 9).

If typecheck fails *only* on `page.tsx` because `staleThresholdMinutes` is missing on `<SessionGrid>`, that's acceptable for this commit — the next task fixes it. If you prefer a typecheck-clean intermediate state, make `staleThresholdMinutes?: number` optional with a fallback, then tighten in Task 9. Choose whichever feels cleaner; the design assumes this required prop is set by the dashboard.

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionGrid.tsx
git commit -m "feat(stale): plumb isStale through SessionGrid"
```

---

### Task 8: Header pill toggle

**Files:**
- Modify: `src/components/DashboardHeader.tsx`

- [ ] **Step 1: Add the new props and pill render**

Replace the entire `DashboardHeader` component in `src/components/DashboardHeader.tsx` with:

```tsx
import Image from "next/image";
import Link from "next/link";
import { ViewMode } from "@/lib/types";

interface Props {
  sessionCount: number;
  onNewSession?: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  staleCount: number;
  hideStale: boolean;
  onToggleHideStale: () => void;
}

export function DashboardHeader({
  sessionCount,
  onNewSession,
  viewMode,
  onViewModeChange,
  staleCount,
  hideStale,
  onToggleHideStale,
}: Props) {
  return (
    <header className="mb-10">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-3.5">
          <Image src="/icon.png" alt="Claude Control" width={44} height={44} className="rounded-xl" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gradient">Claude Control</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {sessionCount === 0
                ? "No active sessions"
                : `${sessionCount} active session${sessionCount !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center bg-zinc-900/80 border border-zinc-800/50 rounded-lg titlebar-no-drag">
            <button
              onClick={() => onViewModeChange("grid")}
              className={`has-tooltip flex items-center justify-center w-8 h-8 rounded-l-lg transition-colors ${viewMode === "grid" ? "text-zinc-200 bg-zinc-800" : "text-zinc-600 hover:text-zinc-400"}`}
              data-tip="Grid view (⌘1)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                />
              </svg>
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              className={`has-tooltip flex items-center justify-center w-8 h-8 rounded-r-lg transition-colors ${viewMode === "list" ? "text-zinc-200 bg-zinc-800" : "text-zinc-600 hover:text-zinc-400"}`}
              data-tip="List view (⌘2)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
                />
              </svg>
            </button>
          </div>
          {staleCount > 0 && (
            <button
              onClick={onToggleHideStale}
              className={`has-tooltip flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors titlebar-no-drag ${
                hideStale
                  ? "bg-zinc-900/80 border-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                  : "bg-zinc-900/80 border-zinc-800/50 text-zinc-400 hover:text-zinc-200"
              }`}
              data-tip={hideStale ? "Show stale sessions" : "Hide stale sessions"}
            >
              {hideStale ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88"
                  />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
              <span className="text-xs font-medium">
                {staleCount} {hideStale ? "hidden" : "stale"}
              </span>
            </button>
          )}
          {onNewSession && (
            <button
              onClick={onNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/50 hover:border-zinc-700 transition-colors titlebar-no-drag"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New
            </button>
          )}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800/50">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-zinc-400">Live</span>
          </div>
          <Link
            href="/settings"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-200 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/50 hover:border-zinc-700 transition-colors titlebar-no-drag"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
        </div>
      </div>
      <div className="mt-4 h-px bg-linear-to-r from-zinc-800 via-zinc-700/50 to-transparent" />
    </header>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: errors only in `src/app/page.tsx` because the new props aren't yet provided. Acceptable — Task 9 fixes the dashboard.

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardHeader.tsx
git commit -m "feat(stale): add toggle pill to DashboardHeader"
```

---

### Task 9: Wire dashboard — filter, persist toggle, clear lost selection

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Import the helper and pull threshold from settings**

In `src/app/page.tsx`, add to existing imports:

```tsx
import { isSessionStale } from "@/lib/stale";
```

Update the `useSettings` destructure (currently `const { notifications: notificationsEnabled, notificationSound: soundEnabled, alwaysNotify } = useSettings();`):

```tsx
const {
  notifications: notificationsEnabled,
  notificationSound: soundEnabled,
  alwaysNotify,
  staleThresholdMinutes,
} = useSettings();
```

- [ ] **Step 2: Add `hideStale` state with localStorage persistence**

Add this state, near the existing `viewMode` state declaration:

```tsx
const [hideStale, setHideStale] = useState(() => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("hideStale") === "true";
});

const handleToggleHideStale = useCallback(() => {
  setHideStale((prev) => {
    const next = !prev;
    localStorage.setItem("hideStale", String(next));
    return next;
  });
}, []);
```

- [ ] **Step 3: Compute stale count + visible sessions**

After the existing `useSessions` / state declarations, add (place this right above the `return (` statement so all `useEffect`s have run first):

```tsx
const staleCount = sessions.reduce(
  (count, s) => (isSessionStale(s.lastActivity, staleThresholdMinutes) ? count + 1 : count),
  0,
);
const visibleSessions = hideStale
  ? sessions.filter((s) => !isSessionStale(s.lastActivity, staleThresholdMinutes))
  : sessions;
```

- [ ] **Step 4: Clear selection if it points to a now-hidden session**

Add this `useEffect` with the other effects (anywhere above the `return`):

```tsx
useEffect(() => {
  if (!hideStale || selectedIndex === null || selectedIndex === undefined) return;
  if (selectedIndex >= visibleSessions.length) {
    setSelectedIndex(null);
  }
}, [hideStale, selectedIndex, visibleSessions.length, setSelectedIndex]);
```

(Note: `setSelectedIndex` comes from `useKeyboardShortcuts`. The visible-list ordering matches what the grid renders; if a stale session was selected and is now hidden, its index falls outside the visible range and is cleared.)

- [ ] **Step 5: Pass new props to header and grid**

Replace the `<DashboardHeader … />` JSX block with:

```tsx
<DashboardHeader
  sessionCount={visibleSessions.length}
  onNewSession={handleNewGlobal}
  viewMode={viewMode}
  onViewModeChange={handleViewModeChange}
  staleCount={staleCount}
  hideStale={hideStale}
  onToggleHideStale={handleToggleHideStale}
/>
```

Replace the `<SessionGrid … />` JSX block with:

```tsx
<SessionGrid
  sessions={visibleSessions}
  viewMode={viewMode}
  targetScreen={targetScreen}
  freshlyChanged={freshlyChanged}
  selectedIndex={selectedIndex}
  onSelectIndex={setSelectedIndex}
  actionFeedback={actionFeedback}
  prStatuses={prStatuses}
  onNewSessionInRepo={handleNewInRepo}
  actedSessions={actedSessions}
  staleThresholdMinutes={staleThresholdMinutes}
  onApproveReject={handleApproveReject}
  editingSessionId={editingSessionId}
  onStartEdit={handleStartEdit}
  onSaveMeta={handleSaveMeta}
  onCancelEdit={handleCancelEdit}
/>
```

Note: the keyboard-shortcut hook still receives the *full* `sessions` list. That's intentional for now — the in-grid keyboard numbers (1-9) are computed inside `SessionGrid` based on the array it receives, which is now `visibleSessions`. The `useKeyboardShortcuts` index space and the grid's display index space are *the same array under the hood* once we hand `visibleSessions` to both. Update the call:

Find the `useKeyboardShortcuts` call:

```tsx
const { selectedIndex, setSelectedIndex, selectedSession, actionFeedback } = useKeyboardShortcuts({
  sessions,
  // ...
});
```

Replace the `sessions` prop with `visibleSessions`:

```tsx
const { selectedIndex, setSelectedIndex, selectedSession, actionFeedback } = useKeyboardShortcuts({
  sessions: visibleSessions,
  // ...
});
```

(This requires `visibleSessions` to be declared *before* `useKeyboardShortcuts`. Move the `staleCount` / `visibleSessions` declarations up so they appear right after `const { sessions, ... } = useSessions();` and before the `useKeyboardShortcuts` call. The `staleThresholdMinutes` from `useSettings` likewise needs to come before that point — re-order so `useSettings()` is destructured early in the function.)

- [ ] **Step 6: Run typecheck and lint**

```bash
npm run typecheck
npm run lint
```

Expected: no errors.

- [ ] **Step 7: Run all tests**

Run: `npm run test`
Expected: all existing tests pass, plus the new `stale.test.ts` tests.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(stale): wire stale filter and toggle into dashboard"
```

---

### Task 10: Settings — threshold input

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Add the field to the local `SettingsData.config` type**

In `src/app/settings/page.tsx`, find the `interface SettingsData` block. Add `staleThresholdMinutes: number;` to the `config` shape:

```tsx
interface SettingsData {
  config: {
    // ...existing fields...
    showKeyboardHints: boolean;
    staleThresholdMinutes: number;
  };
  // ...
}
```

- [ ] **Step 2: Add a debounced threshold draft**

In the component body, near the other `*Draft` state declarations, add:

```tsx
const [thresholdDraft, setThresholdDraft] = useState<string | null>(null);
const thresholdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

In the `useEffect` that fetches `/api/settings` and seeds drafts, add at the end of the `.then((d: SettingsData) => { ... })` body:

```tsx
setThresholdDraft(String(d.config.staleThresholdMinutes ?? 90));
```

Add a debounced saver next to the others:

```tsx
const saveThresholdDebounced = useCallback(
  (value: string) => {
    setThresholdDraft(value);
    if (thresholdTimerRef.current) clearTimeout(thresholdTimerRef.current);
    thresholdTimerRef.current = setTimeout(() => {
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && n >= 5) {
        save({ staleThresholdMinutes: n } as Partial<SettingsData["config"]>);
      }
    }, 500);
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- save is intentionally excluded (unstable reference)
  [data],
);
```

In the cleanup `useEffect`, add:

```tsx
if (thresholdTimerRef.current) clearTimeout(thresholdTimerRef.current);
```

- [ ] **Step 3: Render the input in the Display section**

Find the `Display` `<section>` block. Inside the inner card `<div>`, immediately after the `<Toggle label="Keyboard Shortcuts Bar" ...>` block, add:

```tsx
<div className="flex items-center justify-between py-4">
  <div className="flex-1 min-w-0 mr-4">
    <h3 className="text-sm font-medium text-zinc-200">Stale Threshold</h3>
    <p className="text-xs text-zinc-500 mt-0.5">
      Sessions with no activity for longer than this are marked stale (minimum 5 minutes)
    </p>
  </div>
  <div className="flex items-center gap-2 shrink-0">
    <input
      type="number"
      min={5}
      step={5}
      value={thresholdDraft ?? "90"}
      onChange={(e) => saveThresholdDebounced(e.target.value)}
      className="w-20 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700/50 text-sm text-zinc-200 focus:outline-hidden focus:border-zinc-600 transition-colors text-right font-(family-name:--font-geist-mono)"
    />
    <span className="text-xs text-zinc-500">minutes</span>
  </div>
</div>
```

Also remove the trailing `border-b border-white/4` from the previous Toggle block above this row if it now produces a double border (the existing Toggle in `Display` section uses `border-b border-white/4`; the new input row above is the new last-row, so leave the Toggle's border in place — the new row has no border-bottom).

- [ ] **Step 4: Run typecheck and lint**

```bash
npm run typecheck
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat(stale): add threshold setting to settings page"
```

---

### Task 11: Manual verification + screenshot pass

**Files:** none modified.

- [ ] **Step 1: Start the dev shell**

Run: `npm run electron:dev`

- [ ] **Step 2: Verify with no stale sessions**

- All sessions render normally.
- The stale toggle pill is *not* visible in the header.
- Visit `/settings` → "Display" section shows "Stale Threshold" with default 90.

- [ ] **Step 3: Force a stale session**

Temporarily lower the threshold in Settings to **5 minutes**. Pick a session that's been idle for more than 5 minutes (or wait briefly).

- The card dims to ~60% opacity, glow disappears, hover restores opacity.
- A small zinc `STALE` pill renders next to the status badge.
- The header pill appears: `[👁 N stale]`.
- Switch to list view (⌘2): the row also dims and shows a `STALE` micro-label next to status.

- [ ] **Step 4: Toggle hide**

Click the header pill. Pill swaps to `[👁‍🗨 N hidden]` (eye-slash icon). All stale sessions vanish from the grid. Group headers for fully-stale groups disappear too. Click again — they reappear, dimmed.

- [ ] **Step 5: Selection invalidation**

Select a stale session by clicking it. Click hide. Confirm selection clears (no card shows the blue ring).

- [ ] **Step 6: Restore threshold and confirm persistence**

Set the threshold back to 90. Quit and relaunch the app — the threshold and the `hideStale` toggle state should both be preserved.

- [ ] **Step 7: Final test + lint sweep**

```bash
npm run test
npm run lint
npm run typecheck
```

Expected: all green.

- [ ] **Step 8: Commit any tiny fixes**

If you found small issues during manual verification, fix and commit individually with descriptive messages. If nothing to fix, no commit.

---

## Self-review

**Spec coverage check (against `2026-04-15-stale-sessions-design.md`):**

- "Definition of stale" → Task 1 (`isSessionStale` + tests).
- "Threshold configurable, default 90" → Task 2 (`AppConfig`), Task 10 (Settings UI).
- "Showing stale: dim, lose glow, hover restores, STALE pill" → Tasks 5 (card), 6 (row).
- "Hiding stale: filter before grouping, all-stale groups vanish naturally" → Task 9 (filter on `visibleSessions`); since `groupSessions(visibleSessions)` is called inside `SessionGrid` as today, all-stale groups disappear with no extra code.
- "Header pill: appears only when staleCount > 0, toggles hide, eye/eye-slash, stable count" → Task 8 (component), Task 9 (compute count from full list, pass through).
- "Default state shown" → Task 9 (`useState(() => localStorage.getItem("hideStale") === "true")` defaults to `false`).
- "Selection cleared if hidden" → Task 9 (`useEffect` clearing selectedIndex).
- "Threshold change applies instantly" → satisfied by client-side derivation; `useSettings` re-fetches and the next render reflects.
- "Persist hideStale in localStorage" → Task 9 (`localStorage.setItem` in handler).
- "Test coverage: stale predicate boundary cases" → Task 1.
- "Visual treatment verified manually" → Task 11.

**Placeholder scan:** No "TBD" / "TODO" / "implement later" present. Every code step shows the actual code.

**Type consistency check:**

- `isSessionStale(lastActivity: string, thresholdMinutes: number): boolean` — used identically in `SessionGrid` (Task 7) and `page.tsx` (Task 9). ✓
- `isStale?: boolean` prop name — same in `SessionCard` (Task 5), `SessionRow` (Task 6), and grid (Task 7). ✓
- `staleThresholdMinutes` — same key everywhere: config, hook return, `SessionGrid` prop, `page.tsx` destructure, settings field. ✓
- `staleCount` / `hideStale` / `onToggleHideStale` — same names across `DashboardHeader` props (Task 8) and `page.tsx` wiring (Task 9). ✓
- `StalePill` — exported and consumed by name in Task 4 → Task 5. ✓

**Note on the spec's "extend `group-sessions.test.ts`" testing item:** that test would only verify standard JS array filtering, since grouping itself is unchanged. Skipped — covering it would be busywork. Spec list updated implicitly by this note.
