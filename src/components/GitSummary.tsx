import { GitSummary as GitSummaryType } from "@/lib/types";

export function GitSummary({ git }: { git: GitSummaryType }) {
  const hasChanges = git.changedFiles > 0 || git.untrackedFiles > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/50 text-xs">
        <svg className="w-3 h-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        <span className="font-mono text-zinc-300">{git.branch}</span>
      </span>
      {hasChanges && (
        <span className="inline-flex items-center gap-2 px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/50 text-xs text-zinc-400">
          {git.changedFiles > 0 && (
            <span>{git.changedFiles} changed</span>
          )}
          {git.additions > 0 && <span className="text-emerald-400">+{git.additions}</span>}
          {git.deletions > 0 && <span className="text-red-400">-{git.deletions}</span>}
          {git.untrackedFiles > 0 && (
            <span className="text-amber-400">+{git.untrackedFiles} new</span>
          )}
        </span>
      )}
    </div>
  );
}
