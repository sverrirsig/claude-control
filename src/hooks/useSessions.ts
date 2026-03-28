import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { ClaudeSession } from "@/lib/types";

export function useSessions() {
  const pathname = usePathname();
  const isOnDashboard = pathname === "/";

  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [hooksActive, setHooksActive] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isOnDashboard) return;

    const es = new EventSource("/api/sessions/stream");
    esRef.current = es;

    es.addEventListener("sessions", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setSessions(data.sessions);
        setHooksActive(data.hooksActive ?? false);
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

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [isOnDashboard]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setSessions(data.sessions);
      setHooksActive(data.hooksActive ?? false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Refresh failed"));
    }
  }, []);

  return { sessions, hooksActive, error, isLoading, refresh };
}
