"use client";

import type { ClaudeSession, KanbanCardPlacement } from "@/lib/types";
import { useEffect, useRef } from "react";

/**
 * Watches sessions for idle transitions and triggers kanban tick processing.
 * Fires the tick endpoint when:
 * 1. A session transitions from "working" to a non-working state
 * 2. Any session has a queued move and is no longer working
 */
export function useKanbanTick(
  repoName: string | null,
  sessions: ClaudeSession[],
  placements: KanbanCardPlacement[],
  onTickComplete?: () => void,
) {
  const previousStatuses = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!repoName || sessions.length === 0) return;

    const prev = previousStatuses.current;
    let shouldTick = false;

    for (const session of sessions) {
      const prevStatus = prev.get(session.id);
      if (prevStatus && prevStatus !== session.status) {
        if (
          prevStatus === "working" &&
          session.status !== "working"
        ) {
          shouldTick = true;
        }
      }
      prev.set(session.id, session.status);

      // Also tick if there's a queued move and session is no longer working
      const placement = placements.find((p) => p.sessionId === session.id);
      if (placement?.queuedColumnId && session.status !== "working") {
        shouldTick = true;
      }
    }

    if (shouldTick) {
      fetch(`/api/kanban/${encodeURIComponent(repoName)}/tick`, { method: "POST" })
        .then(() => onTickComplete?.())
        .catch((err) => console.error("Kanban tick failed:", err));
    }
  }, [repoName, sessions, placements, onTickComplete]);
}
