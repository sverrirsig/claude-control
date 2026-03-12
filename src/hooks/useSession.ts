import useSWR from "swr";
import { SessionDetail } from "@/lib/types";
import { POLL_INTERVAL_MS } from "@/lib/constants";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSession(id: string) {
  const { data, error, isLoading } = useSWR<SessionDetail>(
    `/api/sessions/${encodeURIComponent(id)}`,
    fetcher,
    { refreshInterval: POLL_INTERVAL_MS }
  );

  return {
    session: data ?? null,
    error,
    isLoading,
  };
}
