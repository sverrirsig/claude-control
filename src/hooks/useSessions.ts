import useSWR from "swr";
import { ClaudeSession } from "@/lib/types";
import { POLL_INTERVAL_MS } from "@/lib/constants";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSessions() {
  const { data, error, isLoading } = useSWR<{ sessions: ClaudeSession[] }>(
    "/api/sessions",
    fetcher,
    { refreshInterval: POLL_INTERVAL_MS }
  );

  return {
    sessions: data?.sessions ?? [],
    error,
    isLoading,
  };
}
