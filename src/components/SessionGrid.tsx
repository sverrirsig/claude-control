"use client";

import { ClaudeSession, SessionGroup } from "@/lib/types";
import { SessionCard } from "./SessionCard";

function groupSessions(sessions: ClaudeSession[]): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();

  for (const session of sessions) {
    // Group key: parentRepo path for worktrees, or own workingDirectory for main repos
    const repoPath = session.parentRepo || session.workingDirectory;
    const repoName = repoPath.split("/").filter(Boolean).pop() || repoPath;

    if (!groups.has(repoPath)) {
      groups.set(repoPath, { repoName, repoPath, sessions: [] });
    }
    groups.get(repoPath)!.sessions.push(session);
  }

  // Sort groups: groups with more sessions first, then alphabetical
  return Array.from(groups.values()).sort((a, b) => {
    if (b.sessions.length !== a.sessions.length) return b.sessions.length - a.sessions.length;
    return a.repoName.localeCompare(b.repoName);
  });
}

export function SessionGrid({ sessions, targetScreen, freshlyChanged, onNewSessionInRepo }: { sessions: ClaudeSession[]; targetScreen?: number | null; freshlyChanged?: Set<string>; onNewSessionInRepo?: (repoPath: string, repoName: string) => void }) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <p className="text-zinc-400 text-base font-medium">No sessions detected</p>
        <p className="text-zinc-600 text-sm mt-1.5 max-w-xs text-center leading-relaxed">
          Start a Claude Code session in your terminal and it will appear here automatically.
        </p>
      </div>
    );
  }

  const groups = groupSessions(sessions);

  // If there's only one group with one session, skip the grouping chrome
  if (groups.length === 1 && groups[0].sessions.length === 1) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.map((session) => (
          <SessionCard key={`${session.id}-${session.pid}`} session={session} targetScreen={targetScreen} pulse={freshlyChanged?.has(session.id)} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.repoPath}>
          {/* Group header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              <h2 className="text-sm font-semibold text-zinc-300">{group.repoName}</h2>
            </div>
            <span className="text-[11px] text-zinc-600 font-[family-name:var(--font-geist-mono)]">
              {group.sessions.length} session{group.sessions.length !== 1 ? "s" : ""}
            </span>
            {onNewSessionInRepo && (
              <button
                onClick={() => onNewSessionInRepo(group.repoPath, group.repoName)}
                className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title={`New session in ${group.repoName}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            )}
            <div className="flex-1 h-px bg-zinc-800/50" />
          </div>

          {/* Sessions in this group */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {group.sessions.map((session) => (
              <SessionCard key={`${session.id}-${session.pid}`} session={session} targetScreen={targetScreen} pulse={freshlyChanged?.has(session.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
