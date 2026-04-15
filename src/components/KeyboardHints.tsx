"use client";

import { useSettings } from "@/hooks/useSettings";
import { ClaudeSession } from "@/lib/types";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-sm bg-white/6 border border-white/10 text-[10px] font-semibold font-(family-name:--font-geist-mono) text-zinc-400">
      {children}
    </kbd>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600">
      <Kbd>{keys}</Kbd>
      <span>{label}</span>
    </span>
  );
}

export function KeyboardHints({
  selectedSession,
  actionFeedback,
  staleCount,
  hideStale,
  onDismiss,
}: {
  selectedSession: ClaudeSession | null;
  actionFeedback?: { label: string; color: string } | null;
  staleCount?: number;
  hideStale?: boolean;
  onDismiss?: () => void;
}) {
  const isWaiting = selectedSession?.status === "waiting" && selectedSession?.hasPendingToolUse;
  const { editorAvailable, gitGuiAvailable } = useSettings();
  const showStaleHint = (staleCount ?? 0) > 0;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      <div className="max-w-7xl mx-auto px-6 pb-4">
        <div className="relative flex items-center justify-center gap-4 flex-wrap px-4 py-2 rounded-xl bg-[#0a0a0f]/90 backdrop-blur-md border border-white/6 pointer-events-auto">
          {actionFeedback ? (
            <span
              className={`text-xs font-medium cleanup-slide-in ${
                actionFeedback.color === "emerald"
                  ? "text-emerald-400"
                  : actionFeedback.color === "red"
                    ? "text-red-400"
                    : "text-blue-400"
              }`}
            >
              {actionFeedback.label}
            </span>
          ) : (
            <>
              <Hint keys="1-9" label="select" />
              {showStaleHint && <Hint keys="S" label={hideStale ? "show stale" : "hide stale"} />}
              {selectedSession ? (
                <>
                  <span className="w-px h-3 bg-zinc-800" />
                  <Hint keys="Enter" label="terminal" />
                  {editorAvailable && <Hint keys="E" label="editor" />}
                  {gitGuiAvailable && <Hint keys="G" label="git" />}
                  <Hint keys="F" label="finder" />
                  <Hint keys="R" label="rename" />
                  {selectedSession.prUrl && <Hint keys="P" label="PR" />}
                  {isWaiting && (
                    <>
                      <span className="w-px h-3 bg-zinc-800" />
                      <Hint keys="A" label="approve" />
                      <Hint keys="X" label="reject" />
                    </>
                  )}
                  <span className="w-px h-3 bg-zinc-800" />
                  <Hint keys="Esc" label="deselect" />
                </>
              ) : null}
            </>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-700 hover:text-zinc-400 hover:bg-white/4 transition-colors"
              title="Hide keyboard hints"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
