"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { ClaudeSession, KanbanCardPlacement, KanbanColumn as KanbanColumnType } from "@/lib/types";
import type { ReactNode } from "react";

interface KanbanColumnProps {
  column: KanbanColumnType;
  sessions: ClaudeSession[];
  placements: KanbanCardPlacement[];
  renderCard: (session: ClaudeSession) => ReactNode;
  onEditColumn: (columnId: string) => void;
  isLast: boolean;
}

export function KanbanColumn({ column, sessions, placements, renderCard, onEditColumn, isLast }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: "kanban-column", columnId: column.id },
  });

  const sessionIds = sessions.map((s) => s.id);

  return (
    <div className="flex flex-col w-[380px] flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{column.name}</h3>
        <span className="text-[10px] text-zinc-600 font-(family-name:--font-geist-mono)">{sessions.length}</span>
        {column.autoCascade && !isLast && (
          <span className="text-[10px] text-amber-500/60 flex items-center gap-0.5" title="Auto-cascade enabled">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => onEditColumn(column.id)}
          className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          title="Edit column"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-lg border transition-colors p-2 space-y-3 ${
          isOver
            ? "border-zinc-500/50 bg-zinc-800/30"
            : "border-zinc-800/50 bg-zinc-900/20"
        }`}
      >
        <SortableContext items={sessionIds} strategy={verticalListSortingStrategy}>
          {sessions.map((session) => {
            const placement = placements.find((p) => p.sessionId === session.id);
            const isQueued = placement?.queuedColumnId != null;
            const isPendingOutput = placement?.pendingOutputPrompt === true;
            return (
              <div key={session.id} className="relative">
                {isQueued && (
                  <div className={`absolute -top-1 -right-1 z-10 px-1.5 py-0.5 rounded-full border ${
                    isPendingOutput ? "bg-blue-500/20 border-blue-500/30" : "bg-amber-500/20 border-amber-500/30"
                  }`}>
                    <span className={`text-[9px] font-medium ${isPendingOutput ? "text-blue-400" : "text-amber-400"}`}>
                      {isPendingOutput ? "FINISHING" : "QUEUED"}
                    </span>
                  </div>
                )}
                {renderCard(session)}
              </div>
            );
          })}
          {sessions.length === 0 && (
            <div className="flex items-center justify-center h-20 text-zinc-700 text-xs">
              Drop sessions here
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
