"use client";

import type { KanbanCardPlacement, KanbanState } from "@/lib/types";
import { useCallback, useRef, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useKanbanState(repoName: string | null) {
  const { data, mutate } = useSWR<KanbanState>(
    repoName ? `/api/kanban/${encodeURIComponent(repoName)}/state` : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5000 },
  );

  const [localState, setLocalState] = useState<KanbanState | null>(null);
  const initialized = useRef(false);

  const state: KanbanState = localState ?? data ?? { placements: [], outputHistory: {} };

  if (data && !initialized.current) {
    initialized.current = true;
    if (!localState) setLocalState(data);
  }

  // Sync server state when it changes (e.g., after tick processes a queued move)
  const lastServerRef = useRef(data);
  if (data && data !== lastServerRef.current) {
    lastServerRef.current = data;
    // Only overwrite local state if server has new placements (from tick)
    if (data.placements.length > 0) {
      setLocalState(data);
    }
  }

  const moveCard = useCallback(
    async (sessionId: string, toColumnId: string): Promise<{ queued: boolean }> => {
      if (!repoName) return { queued: false };

      // Remember original columnId for potential revert (output prompt keeps card in place)
      const originalColumnId = state.placements.find((p) => p.sessionId === sessionId)?.columnId;

      // Optimistic update: move placement locally
      setLocalState((prev) => {
        const s = prev ?? { placements: [], outputHistory: {} };
        const existing = s.placements.find((p) => p.sessionId === sessionId);
        let placements: KanbanCardPlacement[];
        if (existing) {
          placements = s.placements.map((p) =>
            p.sessionId === sessionId ? { ...p, columnId: toColumnId, queuedColumnId: undefined } : p,
          );
        } else {
          placements = [...s.placements, { sessionId, columnId: toColumnId }];
        }
        return { ...s, placements };
      });

      // Call server
      try {
        const res = await fetch(`/api/kanban/${encodeURIComponent(repoName)}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, toColumnId }),
        });
        const result = await res.json();

        if (result.queued) {
          // Revert optimistic move — card stays in current column with a queue badge
          setLocalState((prev) => {
            if (!prev) return prev;
            const placements = prev.placements.map((p) =>
              p.sessionId === sessionId
                ? { ...p, columnId: originalColumnId ?? p.columnId, queuedColumnId: toColumnId, pendingOutputPrompt: true }
                : p,
            );
            return { ...prev, placements };
          });
        }

        return { queued: !!result.queued };
      } catch (err) {
        console.error("Failed to move card:", err);
        // Revert: re-fetch from server
        mutate();
        return { queued: false };
      }
    },
    [repoName, state.placements, mutate],
  );

  const assignCard = useCallback(
    (sessionId: string, columnId: string) => {
      if (!repoName) return;
      setLocalState((prev) => {
        const s = prev ?? { placements: [], outputHistory: {} };
        const existing = s.placements.find((p) => p.sessionId === sessionId);
        let placements: KanbanCardPlacement[];
        if (existing) {
          placements = s.placements.map((p) =>
            p.sessionId === sessionId ? { ...p, columnId } : p,
          );
        } else {
          placements = [...s.placements, { sessionId, columnId }];
        }
        const next = { ...s, placements };
        // Save to server
        fetch(`/api/kanban/${encodeURIComponent(repoName)}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        }).catch((err) => console.error("Failed to save state:", err));
        return next;
      });
    },
    [repoName],
  );

  const unassignCard = useCallback(
    (sessionId: string) => {
      if (!repoName) return;
      setLocalState((prev) => {
        const s = prev ?? { placements: [], outputHistory: {} };
        const placements = s.placements.filter((p) => p.sessionId !== sessionId);
        const next = { ...s, placements };
        mutate(next, false);
        fetch(`/api/kanban/${encodeURIComponent(repoName)}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        }).catch((err) => console.error("Failed to save state:", err));
        return next;
      });
    },
    [repoName, mutate],
  );

  const refreshState = useCallback(() => mutate(), [mutate]);

  return { state, moveCard, assignCard, unassignCard, refreshState };
}
