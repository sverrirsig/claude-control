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
