"use client";

import { useCallback, useRef } from "react";
import type { ClaudeSession, TerminalEntry } from "@/lib/types";
import { TerminalInstance } from "./TerminalInstance";

const terminalIcon = (
  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
    />
  </svg>
);

export function TerminalContainer({
  terminals,
  activeDir,
  minimized,
  height,
  sessions,
  onClose,
  onMinimize,
  onSwitch,
  onPtySpawned,
  onPtyExited,
}: {
  terminals: Map<string, TerminalEntry>;
  activeDir: string | null;
  minimized: boolean;
  height: number;
  sessions: ClaudeSession[];
  onClose: (dir: string) => void;
  onMinimize: () => void;
  onSwitch: (dir: string) => void;
  onPtySpawned: (dir: string, ptyId: number) => void;
  onPtyExited: (dir: string) => void;
}) {
  const entries = Array.from(terminals.entries());

  const getLabel = useCallback(
    (entry: TerminalEntry) => {
      const session = sessions.find((s) => s.workingDirectory === entry.workingDirectory);
      const repoName = session?.repoName ?? entry.workingDirectory.split("/").filter(Boolean).pop() ?? "terminal";
      const branch = session?.git?.branch;
      return branch ? `${repoName}/${branch}` : repoName;
    },
    [sessions],
  );

  const tabButtons = entries.map(([dir, entry]) => (
    <button
      key={dir}
      onClick={() => onSwitch(dir)}
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(dir); } }}
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-(family-name:--font-geist-mono) whitespace-nowrap transition-colors ${
        dir === activeDir
          ? "bg-white/8 text-zinc-300 border border-white/10"
          : "text-zinc-600 hover:text-zinc-400 hover:bg-white/4"
      }`}
    >
      {!minimized && terminalIcon}
      {getLabel(entry)}
      {entry.exited && <span className="text-zinc-700 ml-1">(ended)</span>}
    </button>
  ));

  return (
    <div
      className="flex flex-col flex-shrink-0 bg-[#0a0a0f] border-t border-white/5"
      style={{ height: minimized ? "auto" : height }}
    >
      {/* Header / tab bar — always visible */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
          {minimized && <span className="text-zinc-600 mr-1">{terminalIcon}</span>}
          {tabButtons}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {minimized ? (
            /* When minimized, show count */
            <span className="text-[10px] text-zinc-700 mr-1">
              {entries.length} terminal{entries.length !== 1 ? "s" : ""}
            </span>
          ) : (
            /* Minimize button */
            <button
              onClick={onMinimize}
              className="flex items-center justify-center w-6 h-6 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-colors"
              title="Minimize"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
              </svg>
            </button>
          )}
          {/* Close button */}
          {activeDir && (
            <button
              onClick={() => onClose(activeDir)}
              className="flex items-center justify-center w-6 h-6 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-colors"
              title="Close terminal"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {/* Terminal instances — ALWAYS in the same tree position to prevent remount.
          Hidden when minimized via height:0, visible instances controlled by `visible` prop. */}
      <div
        className="flex-1 min-h-0 relative"
        style={minimized ? { height: 0, overflow: "hidden" } : undefined}
      >
        {entries.map(([dir, entry]) => (
          <TerminalInstance
            key={dir}
            entry={entry}
            visible={!minimized && dir === activeDir}
            existingPtyId={entry.ptyId}
            onPtySpawned={onPtySpawned}
            onPtyExited={onPtyExited}
          />
        ))}
      </div>
    </div>
  );
}
