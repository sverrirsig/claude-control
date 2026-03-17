import useSWR from "swr";
import { usePathname } from "next/navigation";
import { ClaudeSession } from "@/lib/types";
import { POLL_INTERVAL_MS } from "@/lib/constants";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useSessions() {
  const pathname = usePathname();
  const isOnDashboard = pathname === "/";

  const { data, error, isLoading, mutate } = useSWR<{ sessions: ClaudeSession[] }>(
    isOnDashboard ? "/api/sessions" : null,
    fetcher,
    { refreshInterval: POLL_INTERVAL_MS, revalidateOnFocus: false, keepPreviousData: true }
  );

  return {
    sessions: data?.sessions ?? [],
    error,
    isLoading,
    refresh: mutate,
  };
}
