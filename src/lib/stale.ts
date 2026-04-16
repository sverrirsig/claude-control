/**
 * A session is stale if it has had no activity (Claude or user) for longer
 * than the threshold. Determined purely from `lastActivity` (the JSONL
 * mtime), so working/waiting sessions naturally don't qualify because
 * their JSONL keeps being written.
 */
export function isSessionStale(lastActivity: string, thresholdMinutes: number): boolean {
  const elapsedMs = Date.now() - new Date(lastActivity).getTime();
  if (elapsedMs < 0) return false; // future timestamp — clock skew
  return elapsedMs > thresholdMinutes * 60_000;
}
