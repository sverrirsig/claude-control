"use client";

import { useState } from "react";
import { refreshAfterAction } from "@/lib/actions";
import { ClaudeSession, PrStatus, SessionStatus } from "@/lib/types";
import { GitSummary } from "./GitSummary";
import { OutputPreview } from "./OutputPreview";
import { PrStatusBadge } from "./PrStatusBadge";
import { QuickActions } from "./QuickActions";
import { QuickReply } from "./QuickReply";
import { StatusBadge } from "./StatusBadge";
import { TaskSummaryView } from "./TaskSummaryView";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const cardStyles: Record<SessionStatus, { border: string; glow: string; accent: string }> = {
  working: {
    border: "border-emerald-500/20 hover:border-emerald-500/40",
    glow: "glow-green",
    accent: "from-emerald-500/7 to-transparent",
  },
  idle: {
    border: "border-amber-500/15 hover:border-amber-500/30",
    glow: "glow-yellow",
    accent: "from-amber-500/5 to-transparent",
  },
  waiting: {
    border: "border-blue-500/20 hover:border-blue-500/40",
    glow: "glow-blue",
    accent: "from-blue-500/7 to-transparent",
  },
  errored: {
    border: "border-red-500/20 hover:border-red-500/40",
    glow: "glow-red",
    accent: "from-red-500/7 to-transparent",
  },
  finished: {
    border: "border-zinc-700/30 hover:border-zinc-600/50",
    glow: "glow-zinc",
    accent: "from-zinc-500/3 to-transparent",
  },
};

export function SessionCard({
  session,
  targetScreen,
  pulse,
  selected,
  shortcutNumber,
  actionFeedback,
  prStatus,
  onSelect,
  actedOn,
  onApproveReject,
  editing,
  onStartEdit,
  onSaveMeta,
  onCancelEdit,
  onOpenTerminal,
  hasActiveTerminal,
  hasInlineTerminal,
}: {
  session: ClaudeSession;
  targetScreen?: number | null;
  pulse?: boolean;
  selected?: boolean;
  shortcutNumber?: number;
  actionFeedback?: { label: string; color: string } | null;
  prStatus?: PrStatus | null;
  onSelect?: () => void;
  actedOn?: { action: "approve" | "reject"; at: number };
  onApproveReject?: (action: "approve" | "reject") => void;
  editing?: boolean;
  onStartEdit?: () => void;
  onSaveMeta?: (updates: { title?: string; description?: string }) => void;
  onCancelEdit?: () => void;
  onOpenTerminal?: () => void;
  hasActiveTerminal?: boolean;
  hasInlineTerminal?: boolean;
}) {
  const isSuppressed = !!actedOn;
  const showQuickReply = session.status === "waiting" && session.pid && !isSuppressed;
  const displayStatus = isSuppressed ? (actedOn!.action === "reject" ? "idle" : "working") : session.status;
  const styles = cardStyles[displayStatus];
  const [cleanupState, setCleanupState] = useState<"idle" | "confirm" | "cleaning" | "done">("idle");

  const canCleanup =
    session.isWorktree && (displayStatus === "idle" || displayStatus === "waiting" || displayStatus === "finished");

  async function handleCleanup(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (cleanupState === "idle") {
      setCleanupState("confirm");
      // Auto-reset after 4 seconds if not confirmed
      setTimeout(() => setCleanupState((s) => (s === "confirm" ? "idle" : s)), 4000);
      return;
    }

    if (cleanupState === "confirm") {
      setCleanupState("cleaning");
      try {
        const res = await fetch("/api/sessions/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pid: session.pid,
            workingDirectory: session.workingDirectory,
          }),
        });
        if (res.ok) {
          setCleanupState("done");
          refreshAfterAction();
        } else {
          setCleanupState("idle");
        }
      } catch {
        setCleanupState("idle");
      }
    }
  }

  function cancelCleanup(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCleanupState("idle");
  }

  if (cleanupState === "done") {
    return (
      <div className="relative block rounded-xl border border-zinc-800/20 bg-[#0a0a0f]/40 p-5 card-fade-out">
        <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
          <svg
            className="w-8 h-8 mb-2 text-emerald-500/50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm">Cleaned up</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        onClick={onSelect}
        className={`group relative flex flex-col rounded-xl border bg-[#0a0a0f]/80 backdrop-blur-xs p-5 card-hover cursor-pointer ${selected ? "ring-2 ring-blue-400 border-blue-400/50 shadow-[0_0_30px_rgba(96,165,250,0.25),0_0_60px_rgba(96,165,250,0.10)] scale-[1.02]" : styles.border} ${!selected ? styles.glow : ""} ${pulse ? "attention-pulse" : ""} ${cleanupState === "cleaning" ? "opacity-50 pointer-events-none" : ""}`}
      >
        {/* Gradient accent at top */}
        <div
          className={`absolute inset-x-0 top-0 h-24 rounded-t-xl bg-linear-to-b ${selected ? "from-blue-500/12 to-transparent" : styles.accent} pointer-events-none transition-colors duration-150`}
        />

        {/* Action feedback flash */}
        {actionFeedback && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/60 backdrop-blur-xs action-flash pointer-events-none">
            <span
              className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${
                actionFeedback.color === "emerald"
                  ? "text-emerald-300 bg-emerald-500/20"
                  : actionFeedback.color === "red"
                    ? "text-red-300 bg-red-500/20"
                    : "text-blue-300 bg-blue-500/20"
              }`}
            >
              {actionFeedback.label}
            </span>
          </div>
        )}

        <div className="relative flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {shortcutNumber !== undefined && (
                  <span
                    className={`shrink-0 flex items-center justify-center rounded-sm font-bold font-(family-name:--font-geist-mono) transition-all duration-150 ${selected ? "w-6 h-6 text-[11px] bg-blue-500 text-white shadow-[0_0_12px_rgba(96,165,250,0.5)]" : "w-5 h-5 text-[10px] bg-white/4 border border-white/6 text-zinc-600"}`}
                  >
                    {shortcutNumber}
                  </span>
                )}
                <h3 className="font-semibold text-[15px] text-zinc-100 truncate group-hover:text-white transition-colors">
                  {session.isWorktree && session.parentRepo
                    ? session.parentRepo.split("/").filter(Boolean).pop() || session.repoName
                    : session.repoName || "Unknown"}
                </h3>
                {session.isWorktree && (
                  <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-sm bg-violet-500/10 border border-violet-500/20 text-violet-400">
                    worktree
                  </span>
                )}
                {session.tmuxSession && (
                  <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-sm bg-sky-500/10 border border-sky-500/20 text-sky-400">
                    tmux
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-600 truncate font-(family-name:--font-geist-mono) mt-0.5">
                {session.workingDirectory.replace(/.*\/([^/]+\/[^/]+)$/, "$1")}
              </p>
            </div>
            <StatusBadge status={displayStatus} orphaned={session.orphaned} />
          </div>

          {/* Git info + PR status */}
          {(session.git || prStatus) && (
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              {session.git && <GitSummary git={session.git} />}
              {prStatus && <PrStatusBadge pr={prStatus} />}
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-white/4 mb-3" />

          {/* Task summary or output preview */}
          <div className="mb-4 h-24 overflow-hidden">
            {editing ? (
              <TaskSummaryView
                task={
                  session.taskSummary ?? {
                    title: "",
                    description: null,
                    source: "user",
                    ticketId: null,
                    ticketUrl: null,
                  }
                }
                editing
                onSave={onSaveMeta}
                onCancel={onCancelEdit}
              />
            ) : session.taskSummary ? (
              <TaskSummaryView task={session.taskSummary} onStartEdit={onStartEdit} />
            ) : (
              <OutputPreview preview={session.preview} status={session.status} />
            )}
          </div>

          {/* Quick reply for waiting sessions */}
          {showQuickReply && (
            <QuickReply
              pid={session.pid!}
              path={session.workingDirectory}
              lastAssistantText={session.preview.lastAssistantText}
              lastTools={session.preview.lastTools}
              hasPendingToolUse={session.hasPendingToolUse}
              onActed={(action) => {
                if (action !== "reply") onApproveReject?.(action);
              }}
            />
          )}

          {/* Time ago */}
          <div className="mb-3 mt-3">
            <span className="text-[11px] text-zinc-600 font-(family-name:--font-geist-mono)">
              {timeAgo(session.lastActivity)}
            </span>
          </div>

          {/* Confirmation bar — slides in over the actions */}
          {cleanupState === "confirm" ? (
            <div className="flex items-center gap-2 cleanup-slide-in">
              <span className="text-xs text-zinc-400 flex-1">Remove worktree and session?</span>
              <button
                onClick={cancelCleanup}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 bg-white/4 hover:bg-white/8 border border-white/7 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCleanup}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/8 hover:bg-red-500/18 border border-red-500/15 hover:border-red-500/30 transition-colors"
              >
                Confirm
              </button>
            </div>
          ) : cleanupState === "cleaning" ? (
            <div className="flex items-center justify-center gap-2 h-8">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-700 border-t-zinc-400 animate-spin" />
              <span className="text-xs text-zinc-500">Cleaning up...</span>
            </div>
          ) : (
            /* Actions — full width */
            <QuickActions
              path={session.workingDirectory}
              pid={session.pid}
              targetScreen={targetScreen}
              status={displayStatus}
              prUrl={session.prUrl}
              orphaned={session.orphaned}
              tmuxSession={session.tmuxSession}
              onCleanup={canCleanup ? handleCleanup : undefined}
              onOpenTerminal={onOpenTerminal}
              hasActiveTerminal={hasActiveTerminal}
              hasInlineTerminal={hasInlineTerminal}
            />
          )}
        </div>
      </div>
    </div>
  );
}
