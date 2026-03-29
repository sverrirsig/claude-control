"use client";

import type { DashboardLayout } from "@/lib/dashboard-layout";
import { useCallback, useRef, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useDashboardLayout() {
  const { data } = useSWR<DashboardLayout>("/api/layout", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 0,
  });

  // Local state is the source of truth for rendering (optimistic updates)
  const [localLayout, setLocalLayout] = useState<DashboardLayout | null>(null);
  const initialized = useRef(false);

  // Merge server data once on first load
  const layout: DashboardLayout | null = localLayout ?? data ?? null;

  // Sync server data into local state on first fetch
  if (data && !initialized.current) {
    initialized.current = true;
    if (!localLayout) {
      setLocalLayout(data);
    }
  }

  const saveToServer = useCallback((updates: Partial<DashboardLayout>) => {
    fetch("/api/layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }).catch((err) => console.error("Failed to save layout:", err));
  }, []);

  const reorderSections = useCallback(
    (newOrder: string[]) => {
      setLocalLayout((prev) => {
        const next = { sectionOrder: newOrder, cardOrder: prev?.cardOrder ?? {} };
        saveToServer({ sectionOrder: newOrder });
        return next;
      });
    },
    [saveToServer],
  );

  const reorderCards = useCallback(
    (repoPath: string, newOrder: string[]) => {
      setLocalLayout((prev) => {
        const next = {
          sectionOrder: prev?.sectionOrder ?? [],
          cardOrder: { ...(prev?.cardOrder ?? {}), [repoPath]: newOrder },
        };
        saveToServer({ cardOrder: { [repoPath]: newOrder } });
        return next;
      });
    },
    [saveToServer],
  );

  return { layout, reorderSections, reorderCards };
}
