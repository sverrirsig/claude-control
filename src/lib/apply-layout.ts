import type { DashboardLayout } from "./dashboard-layout";
import type { SessionGroup } from "./types";

/**
 * Merge a persisted DashboardLayout with the live SessionGroup[] from discovery.
 * - Groups are reordered according to `layout.sectionOrder`; unknown groups appended at end.
 * - Sessions within each group are reordered according to `layout.cardOrder`; unknown sessions appended.
 * - Stale entries (IDs no longer present) are silently ignored.
 */
export function applyLayout(groups: SessionGroup[], layout: DashboardLayout | null): SessionGroup[] {
  if (!layout || (layout.sectionOrder.length === 0 && Object.keys(layout.cardOrder).length === 0)) {
    return groups;
  }

  // Build a map for quick lookup
  const groupMap = new Map<string, SessionGroup>();
  for (const g of groups) {
    groupMap.set(g.repoPath, g);
  }

  const ordered: SessionGroup[] = [];
  const placed = new Set<string>();

  // Place groups in sectionOrder first
  for (const repoPath of layout.sectionOrder) {
    const group = groupMap.get(repoPath);
    if (group) {
      ordered.push(group);
      placed.add(repoPath);
    }
  }

  // Append remaining groups in their original order
  for (const group of groups) {
    if (!placed.has(group.repoPath)) {
      ordered.push(group);
    }
  }

  // Reorder sessions within each group
  for (const group of ordered) {
    const cardOrder = layout.cardOrder[group.repoPath];
    if (!cardOrder || cardOrder.length === 0) continue;

    const sessionMap = new Map(group.sessions.map((s) => [s.id, s]));
    const reordered = [];
    const placedSessions = new Set<string>();

    for (const sessionId of cardOrder) {
      const session = sessionMap.get(sessionId);
      if (session) {
        reordered.push(session);
        placedSessions.add(sessionId);
      }
    }

    // Append remaining sessions in their original order
    for (const session of group.sessions) {
      if (!placedSessions.has(session.id)) {
        reordered.push(session);
      }
    }

    group.sessions = reordered;
  }

  return ordered;
}
