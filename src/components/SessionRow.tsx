"use client";

import { ClaudeSession, SessionStatus, PrStatus, statusLabels } from "@/lib/types";
import { PrStatusBadge } from "./PrStatusBadge";

const statusColors: Record<SessionStatus, { dot: string; text: string }> = {
  working: { dot: "bg-emerald-500", text: "text-emerald-400" },
  idle: { dot: "bg-amber-500", text: "text-amber-400" },
  waiting: { dot: "bg-blue-500", text: "text-blue-400" },
  errored: { dot: "bg-red-500", text: "text-red-400" },
  finished: { dot: "bg-zinc-600", text: "text-zinc-500" },
};

export function SessionRow({
  session,
  selected,
  shortcutNumber,
  prStatus,
  onSelect,
  displayStatus,
  onApproveReject,
}: {
  session: ClaudeSession;
  selected?: boolean;
  shortcutNumber?: number;
  prStatus?: PrStatus | null;
  onSelect?: () => void;
  displayStatus: SessionStatus;
  onApproveReject?: (action: "approve" | "reject") => void;
}) {
  const colors = statusColors[displayStatus];
  const isWaiting = displayStatus === "waiting";

  const repoLabel = session.isWorktree && session.parentRepo
    ? session.workingDirectory.split("/").filter(Boolean).pop() || session.repoName
    : session.repoName || "Unknown";

  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-100 ${
        selected
          ? "bg-blue-500/[0.08] border border-blue-400/30 shadow-[0_0_20px_rgba(96,165,250,0.1)]"
          : "bg-white/[0.02] border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06]"
      }`}
    >
      {/* Shortcut number */}
      {shortcutNumber !== undefined && (
        <span className={`shrink-0 flex items-center justify-center rounded font-bold font-[family-name:var(--font-geist-mono)] ${
          selected
            ? "w-5 h-5 text-[10px] bg-blue-500 text-white"
            : "w-5 h-5 text-[10px] bg-white/[0.04] border border-white/[0.06] text-zinc-600"
        }`}>
          {shortcutNumber}
        </span>
      )}

      {/* Status dot + label */}
      <div className="shrink-0 flex items-center gap-2 w-[80px]">
        <span className="relative flex h-2 w-2 shrink-0">
          {displayStatus === "working" && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${colors.dot}`} />
        </span>
        <span className={`text-xs font-medium ${colors.text}`}>
          {statusLabels[displayStatus]}
        </span>
      </div>

      {/* Repo / branch name */}
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <span className="text-sm text-zinc-200 font-medium truncate">
          {repoLabel}
        </span>
        {session.isWorktree && (
          <span className="shrink-0 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider rounded bg-violet-500/10 border border-violet-500/20 text-violet-400">
            wt
          </span>
        )}
      </div>

      {/* Branch */}
      {session.git && (
        <span className="shrink-0 hidden sm:flex items-center gap-1 text-[11px] text-zinc-500 font-[family-name:var(--font-geist-mono)]">
          <svg className="w-3 h-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          <span className="truncate max-w-[120px]">{session.git.branch}</span>
        </span>
      )}

      {/* Git stats */}
      {session.git && session.git.changedFiles > 0 && (
        <div className="shrink-0 hidden md:flex items-center gap-1.5 text-[11px] font-[family-name:var(--font-geist-mono)]">
          {session.git.additions > 0 && (
            <span className="text-emerald-500">+{session.git.additions}</span>
          )}
          {session.git.deletions > 0 && (
            <span className="text-red-400">-{session.git.deletions}</span>
          )}
        </div>
      )}

      {/* PR status */}
      {prStatus && (
        <div className="shrink-0">
          <PrStatusBadge pr={prStatus} />
        </div>
      )}

      {/* Task title — only when NOT waiting (waiting shows tool context instead) */}
      {!isWaiting && session.taskSummary && (
        <span className="shrink-0 hidden lg:block text-[11px] text-zinc-600 truncate max-w-[180px]">
          {session.taskSummary.title}
        </span>
      )}

      {/* Pending tool context + Approve/Reject for waiting sessions */}
      {isWaiting && session.hasPendingToolUse && onApproveReject && (
        <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {session.preview.lastToolName && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/[0.06] border border-blue-500/[0.12] max-w-[320px]">
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/20 text-violet-300 font-mono text-[10px] font-medium">
                {session.preview.lastToolName}
              </span>
              {session.preview.lastToolInput && (
                <span className="text-[10px] text-zinc-400 font-mono truncate">
                  {session.preview.lastToolInput}
                </span>
              )}
            </div>
          )}
          <button
            onClick={() => onApproveReject("approve")}
            className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white transition-colors"
            title="Approve"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </button>
          <button
            onClick={() => onApproveReject("reject")}
            className="flex items-center justify-center w-6 h-6 rounded-md bg-white/[0.04] hover:bg-red-500/[0.15] border border-white/[0.07] hover:border-red-500/[0.25] text-zinc-500 hover:text-red-400 transition-colors"
            title="Reject"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
