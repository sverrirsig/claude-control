import useSWR from "swr";
import { ClaudeSession, PrStatus } from "@/lib/types";

const PR_POLL_MS = 30_000;

async function fetchPrStatuses(sessions: ClaudeSession[]): Promise<Record<string, PrStatus | null>> {
  const withPr = sessions.filter((s) => s.prUrl);
  if (withPr.length === 0) return {};

  const res = await fetch("/api/pr-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prUrls: withPr.map((s) => s.prUrl),
      cwds: withPr.map((s) => s.workingDirectory),
    }),
  });

  if (!res.ok) return {};
  const data = await res.json();
  return data.statuses ?? {};
}

export function usePrStatus(sessions: ClaudeSession[]) {
  // Build a stable key from the set of PR URLs so SWR re-fetches when PRs change
  const prUrls = sessions.filter((s) => s.prUrl).map((s) => s.prUrl).sort().join(",");

  const { data } = useSWR<Record<string, PrStatus | null>>(
    prUrls ? `pr-status:${prUrls}` : null,
    () => fetchPrStatuses(sessions),
    { refreshInterval: PR_POLL_MS, revalidateOnFocus: false }
  );

  return data ?? {};
}
