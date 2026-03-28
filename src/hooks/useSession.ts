import { useState, useEffect } from "react";
import { SessionDetail } from "@/lib/types";

export function useSession(id: string) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const es = new EventSource(`/api/sessions/${encodeURIComponent(id)}/stream`);

    es.addEventListener("session", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setSession(data);
        setError(null);
        setIsLoading(false);
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("error", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data ?? "{}");
        setError(new Error(data.error ?? "Stream error"));
        setIsLoading(false);
      } catch {
        // connection-level error — EventSource will auto-reconnect
      }
    });

    return () => es.close();
  }, [id]);

  return { session, error, isLoading };
}
