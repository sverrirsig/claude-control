# Stale Sessions

## Problem

A user may have many open Claude Code sessions but only be actively working
on a few. The rest are open because they're waiting on something external
(another human, a deploy, an API response). The dashboard treats all open
sessions equally, so passive sessions visually crowd the active ones.

We want to:

1. Mark sessions that have had no activity for an extended period as **stale**.
2. Visually de-emphasise stale sessions so they don't compete for attention.
3. Provide a one-click filter to hide them entirely, with a counter that keeps
   them discoverable.

## Definition of "stale"

A session is stale if `Date.now() - lastActivity > thresholdMinutes`.

- `lastActivity` already exists on `ClaudeSession`. It's set from the JSONL
  file's mtime, which advances whenever Claude or the user does anything in
  the session.
- The threshold is configurable in Settings (default **90 minutes**).
- Status is irrelevant to the determination. Working/waiting sessions naturally
  refresh their JSONL and so won't fall into the stale window.

## User experience

### When stale sessions are shown (default)

- The card/row dims to ~60% opacity and loses its status glow. Hover restores
  full opacity for inspection.
- A small `STALE` pill renders next to the status badge. Pill styling matches
  the existing `Worktree` pill but in cool zinc (`bg-zinc-700/15`,
  `text-zinc-400`).
- The existing `"2h ago"` timestamp at the bottom of the card already conveys
  duration; the pill is only the tag.
- A header pill `[👁 5 stale]` becomes the discoverable trigger to hide them.

### When stale sessions are hidden

- Filtered out of the grid before grouping. All-stale groups vanish naturally.
- Header pill becomes `[👁‍🗨 5 hidden]` with a more muted tone.
- Session counter in the header subtitle continues to count *visible* sessions
  to match what's on screen.
- If the currently-selected session is hidden, selection is cleared.

### Header pill behaviour

- Lives between the view-mode toggle and the "New" button. Same visual
  family as the `Live` pill (rounded-full, `bg-zinc-900/80`,
  `border-zinc-800/50`).
- Renders only when `staleCount > 0`.
- Click toggles `hideStale`. Tooltip flips between "Hide stale sessions" and
  "Show stale sessions".
- `staleCount` is computed from the unfiltered session list so it stays
  stable across toggles.

### Default state

Stale sessions are **shown by default**. Rationale: hiding by default risks
users thinking the dashboard is missing sessions ("there's a bug, it didn't
pick up X"). Showing-with-dim-and-pill teaches the feature; the user opts in
to hiding once they understand it.

## Architecture

### Where computation lives

Client-side, derived from existing `lastActivity` field. No changes to the
server-side discovery pipeline or the `ClaudeSession` type.

Reasoning:

- The threshold is a UI preference; round-tripping a derived boolean through
  the API just adds latency to threshold changes.
- The data is already there.
- Recomputation cost is one date subtraction per session per render — trivial.

### New code

**`src/lib/stale.ts`** (new file)

```ts
export function isSessionStale(lastActivity: string, thresholdMinutes: number): boolean {
  return Date.now() - new Date(lastActivity).getTime() > thresholdMinutes * 60_000;
}
```

**`src/lib/config.ts`** — add to `AppConfig` and `DEFAULT_CONFIG`

```ts
staleThresholdMinutes: number;  // default: 90
```

The existing PATCH `/api/settings` writes arbitrary `AppConfig` keys, so no
new endpoint is needed.

**`src/hooks/useSettings.ts`** — expose `staleThresholdMinutes` on the hook
return value.

**`src/components/StalePill.tsx`** (new file) — small zinc pill, "STALE"
label, used in card and row.

### Modified code

**`src/components/SessionCard.tsx`**

- Accept `isStale: boolean` prop.
- When stale and not selected, apply `opacity-60`, drop the glow class,
  and tone down the border. Hover overrides via Tailwind's `hover:` variant
  (`hover:opacity-100`).
- Render `<StalePill />` next to `<StatusBadge />` in the header row.

**`src/components/SessionRow.tsx`**

- Accept `isStale: boolean` prop.
- When stale, apply `opacity-55` to the row.
- Render an inline `STALE` micro-label in the same place the `Orphaned`
  label renders.

**`src/components/DashboardHeader.tsx`**

- Accept `staleCount: number`, `hideStale: boolean`, and
  `onToggleHideStale: () => void` props.
- When `staleCount > 0`, render the toggle pill between the view-mode
  segmented control and the `New` button.

**`src/app/page.tsx`** (the dashboard)

- Read `staleThresholdMinutes` from `useSettings`.
- Persist `hideStale` in localStorage alongside `viewMode`.
- Compute `staleCount` from the full session list.
- Compute `visibleSessions = hideStale ? sessions.filter(notStale) : sessions`.
- Pass `visibleSessions` into `<SessionGrid />`.
- Pass `isStale` per session into the grid (or the grid recomputes — simpler
  to recompute inside the grid using the threshold prop).
- When `hideStale` toggles to `true` and the selected session is now hidden,
  clear `selectedIndex`.

**`src/components/SessionGrid.tsx`**

- Accept `staleThresholdMinutes: number` prop and pass `isStale` into
  `SessionCard` / `SessionRow`.

**`src/app/settings/page.tsx`**

- Add a single number input `Stale threshold` with helper text "Sessions
  older than this are marked stale." Validated as integer ≥ 5, debounced save.

## Edge cases

| Case | Behaviour |
|---|---|
| Working session | JSONL mtime is fresh; never stale. No code needed. |
| Waiting session sitting unhandled past threshold | Marked stale, dimmed, pill shown. Approve/reject quick-reply remains rendered and clickable. |
| Orphaned + stale | Both badges shown. Orphaned (orange) takes visual precedence. |
| Selection of a stale session that gets hidden | Clear `selectedIndex` on toggle. |
| Threshold lowered while viewing | Next render reflects new threshold; no special handling. |
| All sessions are stale | Grid is empty; existing empty-state message renders. |
| `staleCount === 0` | Header pill not rendered. |

## Testing

- `src/lib/stale.test.ts` — unit tests for `isSessionStale` boundary cases
  (just-before, exactly-at, just-after threshold; edge values like
  `lastActivity` in the future).
- `src/lib/group-sessions.test.ts` — extend with a test confirming that
  filtering before grouping correctly omits all-stale groups.
- Visual treatment verified manually via `npm run electron:dev`.

## Out of scope

- "Going stale" intermediate state (rejected as more visual noise).
- Per-session stale override / pinning (different feature; tracked in IDEAS.md
  as Session Pinning).
- Persisting `hideStale` server-side. localStorage is sufficient — the toggle
  is a per-machine view preference, like `viewMode`.
- Stale-aware notifications.
