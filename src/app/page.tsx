"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSessions } from "@/hooks/useSessions";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { DashboardHeader } from "@/components/DashboardHeader";
import { SessionGrid } from "@/components/SessionGrid";
import { NewSessionModal } from "@/components/NewSessionModal";
import { SessionStatus } from "@/lib/types";

export default function Dashboard() {
  const { sessions, isLoading, error } = useSessions();
  const [targetScreen, setTargetScreen] = useState<number | null>(null);
  const [freshlyChanged, setFreshlyChanged] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ repoPath?: string; repoName?: string } | null>(null);

  // Track confirmed statuses (only update after a status has been stable for 2 polls)
  const rawStatuses = useRef<Map<string, SessionStatus>>(new Map());
  const confirmedStatuses = useRef<Map<string, SessionStatus>>(new Map());
  const pollCount = useRef<Map<string, number>>(new Map());
  const playChime = useNotificationSound();

  // Persist screen preference
  useEffect(() => {
    const saved = localStorage.getItem("targetScreen");
    if (saved !== null) setTargetScreen(saved === "" ? null : parseInt(saved, 10));
  }, []);

  // Detect status transitions → sound + pulse (with debounce)
  useEffect(() => {
    if (sessions.length === 0) return;

    const changed = new Set<string>();

    for (const session of sessions) {
      const prevRaw = rawStatuses.current.get(session.id);
      const count = pollCount.current.get(session.id) ?? 0;

      if (prevRaw === session.status) {
        pollCount.current.set(session.id, count + 1);
      } else {
        pollCount.current.set(session.id, 1);
      }
      rawStatuses.current.set(session.id, session.status);

      const stableCount = pollCount.current.get(session.id) ?? 0;
      if (stableCount >= 2) {
        const prevConfirmed = confirmedStatuses.current.get(session.id);
        if (prevConfirmed && prevConfirmed !== session.status) {
          if (
            prevConfirmed === "working" &&
            (session.status === "waiting" || session.status === "idle" || session.status === "finished")
          ) {
            changed.add(session.id);
          }
        }
        confirmedStatuses.current.set(session.id, session.status);
      }
    }

    if (changed.size > 0) {
      playChime();
      setFreshlyChanged(changed);
      setTimeout(() => setFreshlyChanged(new Set()), 2000);
    }
  }, [sessions, playChime]);

  const handleScreenChange = (screen: number | null) => {
    setTargetScreen(screen);
    localStorage.setItem("targetScreen", screen === null ? "" : String(screen));
  };

  const handleNewGlobal = useCallback(() => {
    setModal({});
  }, []);

  const handleNewInRepo = useCallback((repoPath: string, repoName: string) => {
    setModal({ repoPath, repoName });
  }, []);

  return (
    <>
      <DashboardHeader
        sessionCount={sessions.length}
        targetScreen={targetScreen}
        onScreenChange={handleScreenChange}
        onNewSession={handleNewGlobal}
      />

      {isLoading && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="w-10 h-10 rounded-full border-2 border-zinc-800 border-t-zinc-500 animate-spin mb-4" />
          <p className="text-zinc-500 text-sm">Scanning for sessions...</p>
        </div>
      )}

      {error && !isLoading && (
        <div className="text-center py-10 px-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            Failed to load sessions. Retrying...
          </div>
        </div>
      )}

      <SessionGrid
        sessions={sessions}
        targetScreen={targetScreen}
        freshlyChanged={freshlyChanged}
        onNewSessionInRepo={handleNewInRepo}
      />

      {modal && (
        <NewSessionModal
          repoPath={modal.repoPath}
          repoName={modal.repoName}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
