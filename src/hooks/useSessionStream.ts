import { useState, useEffect, useRef } from "react";
import { SessionDetail, ConversationMessage } from "@/lib/types";

export function useSessionStream(id: string) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    const url = `/api/sessions/${encodeURIComponent(id)}/stream`;

    const connect = () => {
      esRef.current?.close();
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("init", (e: MessageEvent) => {
        const data: SessionDetail = JSON.parse(e.data);
        setSession(data);
        setIsLoading(false);
      });

      es.addEventListener("message", (e: MessageEvent) => {
        const msg: ConversationMessage = JSON.parse(e.data);
        setSession((prev) => {
          if (!prev) return prev;
          return { ...prev, conversation: [...prev.conversation, msg] };
        });

        setIsStreaming(true);
        if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
        streamingTimerRef.current = setTimeout(() => setIsStreaming(false), 2000);
      });

      es.onerror = () => {
        setError(new Error("Stream disconnected"));
        es.close();
        setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
    };
  }, [id]);

  return { session, isLoading, error, isStreaming };
}
