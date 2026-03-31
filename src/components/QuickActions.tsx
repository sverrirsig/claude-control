"use client";

import { useState } from "react";
import { useSettings } from "@/hooks/useSettings";

const iconBtnClass =
  "flex items-center justify-center h-8 rounded-lg bg-white/4 hover:bg-white/10 border border-white/7 hover:border-white/15 text-zinc-500 hover:text-zinc-200 transition-all duration-150";

function IconButton({
  onClick,
  tip,
  className,
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  tip: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className={`has-tooltip ${className || iconBtnClass}`} data-tip={tip}>
      {children}
    </button>
  );
}

const prIcon = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
    />
  </svg>
);

export function QuickActions({
  path,
  pid,
  targetScreen,
  status,
  prUrl,
  orphaned,
  tmuxSession,
  onCleanup,
  onOpenTerminal,
  hasActiveTerminal,
  hasInlineTerminal,
}: {
  path: string;
  pid?: number | null;
  targetScreen?: number | null;
  status?: string;
  prUrl?: string | null;
  orphaned?: boolean;
  tmuxSession?: string | null;
  onCleanup?: (e: React.MouseEvent) => void;
  onOpenTerminal?: () => void;
  hasActiveTerminal?: boolean;
  hasInlineTerminal?: boolean;
}) {
  const [prSending, setPrSending] = useState(false);
  const [killing, setKilling] = useState(false);

  const killSession = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pid) return;
    setKilling(true);
    try {
      await fetch("/api/sessions/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid }),
      });
    } catch (err) {
      console.error("Kill failed:", err);
    }
    // Reset after 3s in case session doesn't disappear immediately
    setTimeout(() => setKilling(false), 3000);
  };

  const [reattaching, setReattaching] = useState(false);

  const { editorAvailable, gitGuiAvailable, inlineTerminal } = useSettings();

  const reattachSession = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!tmuxSession) return;
    // In inline mode, reattach via the inline terminal panel
    if (inlineTerminal && onOpenTerminal) {
      onOpenTerminal();
      return;
    }
    setReattaching(true);
    try {
      await fetch("/api/sessions/reattach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmuxSession, cwd: path }),
      });
    } catch (err) {
      console.error("Reattach failed:", err);
    }
    setTimeout(() => setReattaching(false), 3000);
  };

  const openAction = async (e: React.MouseEvent, action: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch("/api/actions/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          path,
          pid,
          targetScreen: targetScreen ?? undefined,
        }),
      });
    } catch (err) {
      console.error("Action failed:", err);
    }
  };

  const sendCreatePR = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pid) return;
    setPrSending(true);
    try {
      // Load the configured create-PR prompt
      const settingsRes = await fetch("/api/settings");
      const settings = await settingsRes.json();
      const message = settings.config?.createPrPrompt || "/create-pr";

      await fetch("/api/actions/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-message",
          path,
          pid,
          message,
        }),
      });
    } catch (err) {
      console.error("Send PR message failed:", err);
    }
    setTimeout(() => setPrSending(false), 2000);
  };

  const openPrUrl = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!prUrl) return;
    try {
      await fetch("/api/actions/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open-url", url: prUrl }),
      });
    } catch {
      // Fallback
      window.open(prUrl, "_blank");
    }
  };

  const showPRButton = pid && (status === "idle" || status === "waiting");

  return (
    <div className="flex items-center gap-1.5 w-full">
      {/* PR button: grey to send /create-pr, green if PR exists (links to it) */}
      {prUrl ? (
        <IconButton
          onClick={openPrUrl}
          tip="Open pull request"
          className="flex-1 flex items-center justify-center h-8 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/22 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 hover:text-emerald-300 transition-all duration-150"
        >
          {prIcon}
        </IconButton>
      ) : showPRButton ? (
        <IconButton
          onClick={sendCreatePR}
          tip={prSending ? "Sent!" : "Create PR"}
          className={`flex-1 flex items-center justify-center h-8 rounded-lg border transition-all duration-150 ${
            prSending
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-white/4 hover:bg-white/10 border-white/7 hover:border-white/15 text-zinc-500 hover:text-zinc-200"
          }`}
        >
          {prIcon}
        </IconButton>
      ) : null}

      {pid && orphaned ? (
        <>
          {tmuxSession && (
            <IconButton
              onClick={reattachSession}
              tip={reattaching ? "Reattaching..." : "Reattach tmux session"}
              className={`flex-1 flex items-center justify-center h-8 rounded-lg ${
                reattaching
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-white/4 hover:bg-emerald-500/12 border border-white/7 hover:border-emerald-500/25 text-zinc-500 hover:text-emerald-400"
              } transition-all duration-150`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 15l6-6m-5.5.5h.01m4.99 5h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </IconButton>
          )}
          <IconButton
            onClick={killSession}
            tip={killing ? "Killing..." : "Kill orphaned session"}
            className={`flex-1 flex items-center justify-center h-8 rounded-lg ${
              killing
                ? "bg-orange-500/10 border-orange-500/20 text-orange-400"
                : "bg-white/4 hover:bg-orange-500/12 border border-white/7 hover:border-orange-500/25 text-zinc-500 hover:text-orange-400"
            } transition-all duration-150`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </IconButton>
        </>
      ) : pid ? (
        <IconButton onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onOpenTerminal && (hasActiveTerminal || hasInlineTerminal)) {
            // This session has an inline terminal — show/focus it
            onOpenTerminal();
          } else {
            // No inline terminal for this session — focus the external terminal
            openAction(e, "focus");
          }
        }} tip={hasActiveTerminal ? "Show terminal" : "Terminal"} className={`flex-1 flex items-center justify-center h-8 rounded-lg border transition-all duration-150 ${
          hasActiveTerminal
            ? "bg-emerald-500/10 hover:bg-emerald-500/22 border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 hover:text-emerald-300"
            : "bg-white/4 hover:bg-white/10 border-white/7 hover:border-white/15 text-zinc-500 hover:text-zinc-200"
        }`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </IconButton>
      ) : null}
      {editorAvailable && (
        <IconButton onClick={(e) => openAction(e, "editor")} tip="Editor" className={`flex-1 ${iconBtnClass}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
            />
          </svg>
        </IconButton>
      )}
      {gitGuiAvailable && (
        <IconButton onClick={(e) => openAction(e, "git-gui")} tip="Git GUI" className={`flex-1 ${iconBtnClass}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9a3 3 0 01-3-3zm0 0a3 3 0 103-3 3 3 0 00-3 3z"
            />
          </svg>
        </IconButton>
      )}
      <IconButton onClick={(e) => openAction(e, "finder")} tip="Finder" className={`flex-1 ${iconBtnClass}`}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
          />
        </svg>
      </IconButton>
      {onCleanup && (
        <IconButton
          onClick={onCleanup}
          tip="Clean up"
          className={`flex-1 flex items-center justify-center h-8 rounded-lg bg-white/3 hover:bg-red-500/12 border border-white/5 hover:border-red-500/25 text-zinc-600 hover:text-red-400 transition-all duration-150`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
            />
          </svg>
        </IconButton>
      )}
    </div>
  );
}
