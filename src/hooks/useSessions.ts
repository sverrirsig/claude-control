import { usePathname } from "next/navigation";
import useSWR from "swr";
import { POLL_INTERVAL_MS } from "@/lib/constants";
import { ClaudeSession } from "@/lib/types";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useSessions() {
  const pathname = usePathname();
  const isOnDashboard = pathname === "/";

  const { data, error, isLoading, mutate } = useSWR<{ sessions: ClaudeSession[]; hooksActive?: boolean }>(
    isOnDashboard ? "/api/sessions" : null,
    fetcher,
    {
      refreshInterval: POLL_INTERVAL_MS,
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
