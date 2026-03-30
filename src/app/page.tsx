"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { KeyboardHints } from "@/components/KeyboardHints";
import { NewSessionModal } from "@/components/NewSessionModal";
import { SessionGrid } from "@/components/SessionGrid";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { useDesktopNotification } from "@/hooks/useDesktopNotification";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { usePrStatus } from "@/hooks/usePrStatus";
import { useSessions } from "@/hooks/useSessions";
import { useSettings } from "@/hooks/useSettings";
import { flattenGroupedSessions } from "@/lib/group-sessions";
import { SessionStatus, ViewMode } from "@/lib/types";

const EMPTY_SET: Set<string> = new Set();

export default function Dashboard() {
  const { sessions, isLoading, error, hooksActive, refresh } = useSessions();
  const { layout, reorderSections, reorderCards } = useDashboardLayout();
  const [targetScreen, setTargetScreen] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("targetScreen");
    return saved !== null ? (saved === "" ? null : parseInt(saved, 10)) : null;
  });
  const [freshlyChanged, setFreshlyChanged] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ repoPath?: string; repoName?: string } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    const saved = localStorage.getItem("viewMode");
    return saved === "grid" || saved === "list" ? saved : "grid";
  });
  const [showKeyboardHints, setShowKeyboardHints] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("showKeyboardHints") !== "false";
  });
  const [dismissToast, setDismissToast] = useState(false);
  // Optimistic approve/reject state: sessionId → { action, timestamp }
  const [actedSessions, setActedSessions] = useState<Record<string, { action: "approve" | "reject"; at: number }>>({});
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  const handleApproveReject = useCallback((sessionId: string, action: "approve" | "reject") => {
    setActedSessions((prev) => ({ ...prev, [sessionId]: { action, at: Date.now() } }));
  }, []);

  const handleNewGlobal = useCallback(() => {
    setModal({});
  }, []);

  const handleNewInRepo = useCallback((repoPath: string, repoName: string) => {
    setModal({ repoPath, repoName });
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("viewMode", mode);
  }, []);

  const handleStartEdit = useCallback((sessionId: string) => {
    setEditingSessionId(sessionId);
  }, []);

  const handleSaveMeta = useCallback(
    async (sessionId: string, updates: { title?: string; description?: string }) => {
      try {
        await fetch(`/api/sessions/${sessionId}/meta`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        setEditingSessionId(null);
        refresh();
      } catch (err) {
        console.error("Failed to save session meta:", err);
      }
    },
    [refresh],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingSessionId(null);
  }, []);

  const { selectedIndex, setSelectedIndex, selectedSession, actionFeedback } = useKeyboardShortcuts({
    sessions,
    targetScreen,
    onNewGlobal: handleNewGlobal,
    onNewInRepo: handleNewInRepo,
    onApproveReject: handleApproveReject,
    onViewModeChange: handleViewModeChange,
    onStartEdit: handleStartEdit,
    layout,
  });

  // Clear optimistic state when backend catches up or after timeout
  useEffect(() => {
    const ids = Object.keys(actedSessions);
    if (ids.length === 0) return;

    const now = Date.now();
    const toRemove: string[] = [];
    for (const id of ids) {
      const entry = actedSessions[id];
      const session = sessions.find((s) => s.id === id);
      const elapsed = now - entry.at;
      // Clear if backend status left "waiting" (and at least 1s has passed) or after 10s
      if (!session || (session.status !== "waiting" && elapsed > 1000) || elapsed >= 10_000) {
        toRemove.push(id);
      }
    }
    if (toRemove.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- timer-based cleanup of optimistic state
      setActedSessions((prev) => {
        const next = { ...prev };
        for (const id of toRemove) delete next[id];
        return next;
      });
    } else {
      // Schedule cleanup for the nearest timeout
      const nearest = Math.min(...ids.map((id) => 10_000 - (now - actedSessions[id].at)));
      const timer = setTimeout(
        () =>
          setActedSessions((prev) => {
            const next = { ...prev };
            const now2 = Date.now();
            for (const id of Object.keys(next)) {
              if (now2 - next[id].at >= 10_000) delete next[id];
            }
            return next;
          }),
        Math.max(nearest, 100),
      );
      return () => clearTimeout(timer);
    }
  }, [sessions, actedSessions]);
  const prStatuses = usePrStatus(sessions);
  const { notifications: notificationsEnabled, notificationSound: soundEnabled, alwaysNotify } = useSettings();

  // Track confirmed statuses (only update after a status has been stable for 2 polls)
  const rawStatuses = useRef<Map<string, SessionStatus>>(new Map());
  const confirmedStatuses = useRef<Map<string, SessionStatus>>(new Map());
  const pollCount = useRef<Map<string, number>>(new Map());
  const playChime = useNotificationSound();
  const handleNotificationClick = useCallback(
    (sessionId: string) => {
      const ordered = flattenGroupedSessions(sessions);
      const idx = ordered.findIndex((s) => s.id === sessionId);
      if (idx >= 0) setSelectedIndex(idx);
    },
    [sessions, setSelectedIndex],
  );
  const sendNotification = useDesktopNotification(alwaysNotify, handleNotificationClick);

  // Preferences are initialized via lazy useState initializers above

  // Pending "idle" notifications — delayed to avoid false notifications from brief
  // idle gaps between turns (e.g. Stop → UserPromptSubmit within seconds).
  const pendingIdleNotifications = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Detect status transitions → sound + pulse
  // With hooks: statuses are authoritative, so react immediately.
  // Without hooks: require 2 consecutive polls with the same status to confirm (debounce flicker).
  useEffect(() => {
    if (sessions.length === 0) return;

    const changed = new Set<string>();

    for (const session of sessions) {
      if (hooksActive) {
        const prev = confirmedStatuses.current.get(session.id);

        // If session returned to "working", cancel any pending idle notification
        if (session.status === "working" && pendingIdleNotifications.current.has(session.id)) {
          clearTimeout(pendingIdleNotifications.current.get(session.id));
          pendingIdleNotifications.current.delete(session.id);
        }

        if (
          prev &&
          prev !== session.status &&
          (session.status === "waiting" || session.status === "idle" || session.status === "finished")
        ) {
          // "idle" gets a delayed notification to avoid false triggers between turns
          if (session.status === "idle") {
            if (!pendingIdleNotifications.current.has(session.id)) {
              const sid = session.id;
              const timer = setTimeout(() => {
                pendingIdleNotifications.current.delete(sid);
                if (soundEnabled) playChime();
                if (notificationsEnabled) {
                  const s = sessions.find((x) => x.id === sid);
                  if (s) sendNotification(s, s.status);
                }
                setFreshlyChanged(new Set([sid]));
                setTimeout(() => setFreshlyChanged(EMPTY_SET), 2000);
              }, 6000);
              pendingIdleNotifications.current.set(sid, timer);
            }
          } else {
            // "waiting" and "finished" notify immediately
            changed.add(session.id);
          }
        }
        confirmedStatuses.current.set(session.id, session.status);
      } else {
        // Heuristic fallback — require 2 stable polls before confirming
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
    }

    if (changed.size > 0) {
      if (soundEnabled) playChime();
      if (notificationsEnabled) {
        changed.forEach((id) => {
          const session = sessions.find((s) => s.id === id);
          if (session) sendNotification(session, session.status);
        });
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- notification highlight with delayed clear
      setFreshlyChanged(changed);
      setTimeout(() => setFreshlyChanged(EMPTY_SET), 2000);
    }
  }, [sessions, hooksActive, playChime, sendNotification, soundEnabled, notificationsEnabled]);

  return (
    <>
      <DashboardHeader
        sessionCount={sessions.length}
        onNewSession={handleNewGlobal}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            Failed to load sessions. Retrying...
          </div>
        </div>
      )}

      {!(isLoading && sessions.length === 0) && (
        <SessionGrid
          sessions={sessions}
          viewMode={viewMode}
          targetScreen={targetScreen}
          freshlyChanged={freshlyChanged}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
          actionFeedback={actionFeedback}
          prStatuses={prStatuses}
          onNewSessionInRepo={handleNewInRepo}
          actedSessions={actedSessions}
          onApproveReject={handleApproveReject}
          editingSessionId={editingSessionId}
          onStartEdit={handleStartEdit}
          onSaveMeta={handleSaveMeta}
          onCancelEdit={handleCancelEdit}
          layout={layout}
          onReorderSections={reorderSections}
          onReorderCards={reorderCards}
        />
      )}

      {sessions.length > 0 && showKeyboardHints && (
        <KeyboardHints
          selectedSession={selectedSession}
          actionFeedback={actionFeedback}
          onDismiss={() => {
            setShowKeyboardHints(false);
            localStorage.setItem("showKeyboardHints", "false");
            fetch("/api/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ showKeyboardHints: false }),
            }).catch(() => {});
            setDismissToast(true);
            setTimeout(() => setDismissToast(false), 4000);
          }}
        />
      )}

      {dismissToast && (
        <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
          <div className="max-w-7xl mx-auto px-6 pb-4">
            <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#0a0a0f]/90 backdrop-blur-md border border-white/6 pointer-events-auto text-xs text-zinc-500">
              Keyboard hints hidden. Re-enable in{" "}
              <Link
                href="/settings"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
              >
                Settings
              </Link>
            </div>
          </div>
        </div>
      )}

      {modal && <NewSessionModal repoPath={modal.repoPath} repoName={modal.repoName} onClose={() => setModal(null)} onCreated={refresh} />}
    </>
  );
}
