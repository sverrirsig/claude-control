"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSessionStream } from "@/hooks/useSessionStream";
import { StatusBadge } from "@/components/StatusBadge";
import { GitSummary } from "@/components/GitSummary";
import { ConversationView } from "@/components/ConversationView";
import { QuickActions } from "@/components/QuickActions";

export default function SessionDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? decodeURIComponent(params.id) : "";
  const { session, isLoading, error, isStreaming } = useSessionStream(id);
  const [targetScreen, setTargetScreen] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("targetScreen");
    return saved !== null ? (saved === "" ? null : parseInt(saved, 10)) : null;
  });

  if (isLoading && !session) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-10 h-10 rounded-full border-2 border-zinc-800 border-t-zinc-500 animate-spin mb-4" />
        <p className="text-zinc-500 text-sm">Loading session...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <p className="text-zinc-400 text-base mb-3">Session not found</p>
        <Link
          href="/"
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            {session.repoName || "Unknown"}
          </h1>
          <p className="text-sm text-zinc-500 font-(family-name:--font-geist-mono) mt-1">
            {session.workingDirectory}
          </p>
          {session.pid && (
            <p className="text-xs text-zinc-600 font-(family-name:--font-geist-mono) mt-1">
              PID {session.pid}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={session.status} />
          <QuickActions path={session.workingDirectory} pid={session.pid} targetScreen={targetScreen} />
        </div>
      </div>

      {/* Git panel */}
      {session.git && (
        <div className="mb-6 p-5 rounded-xl bg-[#0a0a0f]/80 border border-zinc-800/50 backdrop-blur-xs">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Git Status</h2>
          <GitSummary git={session.git} />
          {session.gitDiff && (
            <pre className="mt-4 p-3 rounded-lg bg-black/30 text-xs text-zinc-400 font-(family-name:--font-geist-mono) whitespace-pre-wrap overflow-x-auto border border-white/4">
              {session.gitDiff}
            </pre>
          )}
        </div>
      )}

      {/* Conversation panel */}
      <div className="p-5 rounded-xl bg-[#0a0a0f]/80 border border-zinc-800/50 backdrop-blur-xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">Conversation</h2>
        <ConversationView messages={session.conversation} isStreaming={isStreaming} />
      </div>
    </div>
  );
}
