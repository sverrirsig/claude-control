import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { POLL_INTERVAL_MS } from "@/lib/constants";
import { ClaudeSession } from "@/lib/types";

const BACKGROUND_MULTIPLIER = 3;

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useSessions() {
  const pathname = usePathname();
  const isOnDashboard = pathname === "/";

  // Adaptive polling: poll faster when focused, slower when backgrounded
  const [pollInterval, setPollInterval] = useState(POLL_INTERVAL_MS);
  useEffect(() => {
    const onFocus = () => setPollInterval(POLL_INTERVAL_MS);
    const onBlur = () => setPollInterval(POLL_INTERVAL_MS * BACKGROUND_MULTIPLIER);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const { data, error, isLoading, mutate } = useSWR<{ sessions: ClaudeSession[]; hooksActive?: boolean }>(
    isOnDashboard ? "/api/sessions" : null,
    fetcher,
    {
      refreshInterval: pollInterval,
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  return {
    sessions: data?.sessions ?? [],
    hooksActive: data?.hooksActive ?? false,
    error,
    isLoading,
    refresh: mutate,
  };
}
