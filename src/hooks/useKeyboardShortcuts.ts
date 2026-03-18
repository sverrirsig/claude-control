"use client";

import { useEffect, useCallback, useState, useMemo } from "react";
import { ClaudeSession, ViewMode } from "@/lib/types";
import { flattenGroupedSessions } from "@/lib/group-sessions";
import { sendKeystrokeAction } from "@/lib/actions";
import { useSettings } from "./useSettings";

interface UseKeyboardShortcutsOptions {
  sessions: ClaudeSession[];
  targetScreen?: number | null;
  onNewGlobal?: () => void;
  onNewInRepo?: (repoPath: string, repoName: string) => void;
  onApproveReject?: (sessionId: string, action: "approve" | "reject") => void;
  onViewModeChange?: (mode: ViewMode) => void;
}

export function useKeyboardShortcuts({ sessions, targetScreen, onNewGlobal, onNewInRepo, onApproveReject, onViewModeChange }: UseKeyboardShortcutsOptions) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ label: string; color: string } | null>(null);
  const { editorAvailable, gitGuiAvailable } = useSettings();

  // Use the same grouped+flattened order as the grid renders
  const orderedSessions = useMemo(() => flattenGroupedSessions(sessions), [sessions]);

  // Clamp selection when sessions change
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= orderedSessions.length) {
      setSelectedIndex(orderedSessions.length > 0 ? orderedSessions.length - 1 : null);
    }
  }, [orderedSessions.length, selectedIndex]);

  const selectedSession = selectedIndex !== null ? orderedSessions[selectedIndex] ?? null : null;

  const flash = useCallback((label: string, color: string = "blue") => {
    setActionFeedback({ label, color });
    setTimeout(() => setActionFeedback(null), 1200);
  }, []);

  const openAction = useCallback(
    async (action: string, session: ClaudeSession) => {
      try {
        await fetch("/api/actions/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            path: session.workingDirectory,
            pid: session.pid,
            targetScreen: targetScreen ?? undefined,
          }),
        });
      } catch (err) {
        console.error("Action failed:", err);
      }
    },
    [targetScreen]
  );

  const sendKeystroke = useCallback(async (pid: number, keystroke: string) => {
    try {
      await sendKeystrokeAction(pid, keystroke);
    } catch (err) {
      console.error("Keystroke failed:", err);
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Cmd+N / Cmd+Shift+N: new session
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (e.shiftKey) {
          onNewGlobal?.();
        } else if (selectedSession) {
          const repoPath = selectedSession.parentRepo || selectedSession.workingDirectory;
          const repoName = repoPath.split("/").filter(Boolean).pop() || repoPath;
          onNewInRepo?.(repoPath, repoName);
        } else {
          onNewGlobal?.();
        }
        return;
      }

      // Cmd+1, Cmd+2, etc. for view mode switching
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const viewModes: ViewMode[] = ["grid", "list"];
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < viewModes.length) {
          e.preventDefault();
          onViewModeChange?.(viewModes[idx]);
          return;
        }
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Arrow Up/Down: navigate sessions
      if (e.key === "ArrowDown") {
        if (orderedSessions.length === 0) return;
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null) return 0;
          if (prev >= orderedSessions.length - 1) return 0;
          return prev + 1;
        });
        return;
      }
      if (e.key === "ArrowUp") {
        if (orderedSessions.length === 0) return;
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null || prev === 0) return orderedSessions.length - 1;
          return prev - 1;
        });
        return;
      }

      // Tab / Shift+Tab: cycle through sessions
      if (e.key === "Tab") {
        if (orderedSessions.length === 0) return;
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (e.shiftKey) {
            // Shift+Tab: go backward
            if (prev === null || prev === 0) return orderedSessions.length - 1;
            return prev - 1;
          } else {
            // Tab: go forward
            if (prev === null) return 0;
            if (prev >= orderedSessions.length - 1) return 0;
            return prev + 1;
          }
        });
        return;
      }

      // Number keys 1-9: select session
      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (idx < orderedSessions.length) {
          e.preventDefault();
          setSelectedIndex((prev) => (prev === idx ? null : idx));
        }
        return;
      }

      // Escape: deselect
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedIndex(null);
        return;
      }

      // Actions on selected session
      if (selectedSession === null) return;

      switch (e.key.toLowerCase()) {
        case "enter":
          if (selectedSession.pid) {
            e.preventDefault();
            openAction("focus", selectedSession);
            flash("Terminal");
          }
          break;
        case "e":
          if (editorAvailable) {
            e.preventDefault();
            openAction("editor", selectedSession);
            flash("Editor");
          }
          break;
        case "g":
          if (gitGuiAvailable) {
            e.preventDefault();
            openAction("git-gui", selectedSession);
            flash("Git GUI");
          }
          break;
        case "f":
          e.preventDefault();
          openAction("finder", selectedSession);
          flash("Finder");
          break;
        case "a":
          if (selectedSession.status === "waiting" && selectedSession.pid && selectedSession.hasPendingToolUse) {
            e.preventDefault();
            onApproveReject?.(selectedSession.id, "approve");
            sendKeystroke(selectedSession.pid, "return");
            flash("Approved", "emerald");
          }
          break;
        case "x":
          if (selectedSession.status === "waiting" && selectedSession.pid && selectedSession.hasPendingToolUse) {
            e.preventDefault();
            onApproveReject?.(selectedSession.id, "reject");
            sendKeystroke(selectedSession.pid, "escape");
            flash("Rejected", "red");
          }
          break;
        case "p":
          if (selectedSession.prUrl) {
            e.preventDefault();
            flash("PR");
            fetch("/api/actions/open", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "open-url", url: selectedSession.prUrl }),
            }).catch(() => window.open(selectedSession.prUrl!, "_blank"));
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [orderedSessions, selectedSession, openAction, sendKeystroke, flash, onNewGlobal, onNewInRepo, onApproveReject, editorAvailable, gitGuiAvailable]);

  return { selectedIndex, setSelectedIndex, selectedSession, actionFeedback };
}
