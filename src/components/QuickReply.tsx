"use client";

import { useState, useRef } from "react";
import { refreshAfterAction, sendKeystrokeAction } from "@/lib/actions";

export function QuickReply({
  pid,
  path,
  lastAssistantText,
  lastToolName,
  lastToolInput,
  hasPendingToolUse,
  onActed,
}: {
  pid: number;
  path: string;
  lastAssistantText: string | null;
  lastToolName: string | null;
  lastToolInput: string | null;
  hasPendingToolUse: boolean;
  onActed?: (action: "approve" | "reject" | "reply") => void;
}) {
  const [sending, setSending] = useState<string | null>(null);
  const [showReply, setShowReply] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const stopProp = (e: React.MouseEvent | React.FocusEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const sendKeystroke = async (keystroke: string, label: string) => {
    setSending(label);
    onActed?.(label === "approve" ? "approve" : "reject");
    try {
      await sendKeystrokeAction(pid, keystroke);
    } catch (err) {
      console.error("Failed to send keystroke:", err);
    }
    setTimeout(() => setSending(null), 1500);
  };

  const sendMessage = async () => {
    const text = message.trim();
    if (!text) return;
    setSending("reply");
    try {
      await fetch("/api/actions/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-message", path, pid, message: text }),
      });
      setMessage("");
      setShowReply(false);
      onActed?.("reply");
      refreshAfterAction();
    } catch (err) {
      console.error("Failed to send:", err);
    }
    setTimeout(() => setSending(null), 1500);
  };

  const isPermissionPrompt = hasPendingToolUse;

  return (
    <div onClick={stopProp} onMouseDown={stopProp} className="mt-3 cleanup-slide-in">
      {/* Show what's pending */}
      {isPermissionPrompt && lastToolName ? (
        <div className="mb-2.5 px-2.5 py-2 rounded-lg bg-blue-500/[0.06] border border-blue-500/[0.12]">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/20 text-violet-300 font-mono text-[10px] font-medium">
              {lastToolName}
            </span>
          </div>
          {lastToolInput && (
            <p className="text-[11px] text-zinc-400 font-mono truncate leading-relaxed">
              {lastToolInput}
            </p>
          )}
        </div>
      ) : lastAssistantText ? (
        <div className="mb-2.5 px-2.5 py-2 rounded-lg bg-blue-500/[0.06] border border-blue-500/[0.12]">
          <p className="text-[11px] text-blue-300/70 line-clamp-3 leading-relaxed">
            {lastAssistantText}
          </p>
        </div>
      ) : null}

      {isPermissionPrompt ? (
        /* Permission prompt: Approve / Reject buttons */
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { stopProp(e); sendKeystroke("return", "approve"); }}
            disabled={sending !== null}
            className={`flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors ${
              sending === "approve"
                ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                : "bg-emerald-600/80 hover:bg-emerald-500 text-white border border-emerald-500/30"
            } disabled:opacity-60`}
          >
            {sending === "approve" ? (
              "Sent!"
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Approve
              </>
            )}
          </button>
          <button
            onClick={(e) => { stopProp(e); sendKeystroke("escape", "reject"); }}
            disabled={sending !== null}
            className={`h-8 px-3 flex items-center justify-center gap-1.5 rounded-lg text-xs transition-colors ${
              sending === "reject"
                ? "bg-red-500/15 border border-red-500/25 text-red-400"
                : "bg-white/[0.04] hover:bg-red-500/[0.12] border border-white/[0.07] hover:border-red-500/[0.25] text-zinc-500 hover:text-red-400"
            } disabled:opacity-60`}
          >
            {sending === "reject" ? "Sent!" : "Reject"}
          </button>
          <button
            onClick={(e) => {
              stopProp(e);
              setShowReply(!showReply);
              if (!showReply) setTimeout(() => inputRef.current?.focus(), 100);
            }}
            className="has-tooltip h-8 w-8 flex items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-500 hover:text-zinc-300 transition-colors"
            data-tip="Reply"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          </button>
        </div>
      ) : (
        /* Conversational question: text reply by default */
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendMessage(); } }}
            onClick={stopProp}
            onFocus={stopProp}
            placeholder={sending === "reply" ? "Sent!" : "Reply to Claude..."}
            disabled={sending !== null}
            className="flex-1 h-8 px-3 rounded-lg text-xs bg-white/[0.06] border border-white/[0.10] focus:border-blue-500/40 focus:bg-white/[0.08] text-zinc-200 placeholder:text-zinc-600 outline-none transition-colors disabled:opacity-50"
          />
          <button
            onClick={(e) => { stopProp(e); sendMessage(); }}
            disabled={!message.trim() || sending !== null}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-blue-600/80 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      )}

      {/* Expandable reply input for permission prompts */}
      {isPermissionPrompt && showReply && (
        <div className="flex items-center gap-1.5 mt-1.5 cleanup-slide-in">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendMessage(); } }}
            onClick={stopProp}
            onFocus={stopProp}
            placeholder="Type a reply..."
            disabled={sending !== null}
            className="flex-1 h-8 px-3 rounded-lg text-xs bg-white/[0.06] border border-white/[0.10] focus:border-blue-500/40 focus:bg-white/[0.08] text-zinc-200 placeholder:text-zinc-600 outline-none transition-colors disabled:opacity-50"
          />
          <button
            onClick={(e) => { stopProp(e); sendMessage(); }}
            disabled={!message.trim() || sending !== null}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-blue-600/80 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
