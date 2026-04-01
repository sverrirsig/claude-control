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
  repoId: string | null,
  sessions: ClaudeSession[],
  placements: KanbanCardPlacement[],
  onTickComplete?: () => void,
) {
  const previousStatuses = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!repoId || sessions.length === 0) return;

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

      // Fire periodic ticks for idle sessions in columns (auto-cascade settle checking).
      // Without this, the tick only fires on the working→idle transition when idleAge≈0,
      // but processIdleTransitions requires idleAge >= settleMs (default 30s).
      if (placement && !placement.queuedColumnId &&
          (session.status === "idle" || session.status === "finished" || session.status === "errored")) {
        shouldTick = true;
      }
    }

    if (shouldTick) {
      fetch(`/api/kanban/${encodeURIComponent(repoId)}/tick`, { method: "POST" })
        .then(() => onTickComplete?.())
        .catch((err) => console.error("Kanban tick failed:", err));
    }
  }, [repoId, sessions, placements, onTickComplete]);
}
