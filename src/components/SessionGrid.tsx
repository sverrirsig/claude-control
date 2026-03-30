"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { sendKeystrokeAction } from "@/lib/actions";
import { applyLayout } from "@/lib/apply-layout";
import type { DashboardLayout } from "@/lib/dashboard-layout";
import { groupSessions } from "@/lib/group-sessions";
import { ClaudeSession, PrStatus, ViewMode } from "@/lib/types";
import { useRef, useState } from "react";
import { SessionCard } from "./SessionCard";
import { SessionRow } from "./SessionRow";
import { SortableCard } from "./SortableCard";
import { SortableSection } from "./SortableSection";

function prettifyName(name: string): string {
  return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const REPO_ACCENTS = [
  {
    dot: "bg-blue-400",
    glow: "shadow-[0_0_8px_rgba(96,165,250,0.6)]",
    text: "text-blue-300/80",
    line: "from-blue-500/30",
  },
  {
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_8px_rgba(52,211,153,0.6)]",
    text: "text-emerald-300/80",
    line: "from-emerald-500/30",
  },
  {
    dot: "bg-violet-400",
    glow: "shadow-[0_0_8px_rgba(167,139,250,0.6)]",
    text: "text-violet-300/80",
    line: "from-violet-500/30",
  },
  {
    dot: "bg-amber-400",
    glow: "shadow-[0_0_8px_rgba(251,191,36,0.6)]",
    text: "text-amber-300/80",
    line: "from-amber-500/30",
  },
  {
    dot: "bg-rose-400",
    glow: "shadow-[0_0_8px_rgba(251,113,133,0.6)]",
    text: "text-rose-300/80",
    line: "from-rose-500/30",
  },
  {
    dot: "bg-cyan-400",
    glow: "shadow-[0_0_8px_rgba(34,211,238,0.6)]",
    text: "text-cyan-300/80",
    line: "from-cyan-500/30",
  },
  {
    dot: "bg-orange-400",
    glow: "shadow-[0_0_8px_rgba(251,146,60,0.6)]",
    text: "text-orange-300/80",
    line: "from-orange-500/30",
  },
  {
    dot: "bg-pink-400",
    glow: "shadow-[0_0_8px_rgba(244,114,182,0.6)]",
    text: "text-pink-300/80",
    line: "from-pink-500/30",
  },
  {
    dot: "bg-teal-400",
    glow: "shadow-[0_0_8px_rgba(45,212,191,0.6)]",
    text: "text-teal-300/80",
    line: "from-teal-500/30",
  },
  {
    dot: "bg-indigo-400",
    glow: "shadow-[0_0_8px_rgba(129,140,248,0.6)]",
    text: "text-indigo-300/80",
    line: "from-indigo-500/30",
  },
];

// Assign accents by hashing each group name individually so colors stay stable after reorder.
function buildAccentMap(groupNames: string[]): Map<string, (typeof REPO_ACCENTS)[0]> {
  const map = new Map<string, (typeof REPO_ACCENTS)[0]>();
  for (const name of groupNames) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    map.set(name, REPO_ACCENTS[Math.abs(hash) % REPO_ACCENTS.length]);
  }
  return map;
}

export function SessionGrid({
  sessions,
  viewMode,
  targetScreen,
  freshlyChanged,
  selectedIndex,
  onSelectIndex,
  actionFeedback,
  prStatuses,
  onNewSessionInRepo,
  actedSessions,
  onApproveReject,
  editingSessionId,
  onStartEdit,
  onSaveMeta,
  onCancelEdit,
  layout,
  onReorderSections,
  onReorderCards,
}: {
  sessions: ClaudeSession[];
  viewMode: ViewMode;
  targetScreen?: number | null;
  freshlyChanged?: Set<string>;
  selectedIndex?: number | null;
  onSelectIndex?: (idx: number | null) => void;
  actionFeedback?: { label: string; color: string } | null;
  prStatuses?: Record<string, PrStatus | null>;
  onNewSessionInRepo?: (repoPath: string, repoName: string) => void;
  actedSessions?: Record<string, { action: "approve" | "reject"; at: number }>;
  onApproveReject?: (sessionId: string, action: "approve" | "reject") => void;
  editingSessionId?: string | null;
  onStartEdit?: (sessionId: string) => void;
  onSaveMeta?: (sessionId: string, updates: { title?: string; description?: string }) => void;
  onCancelEdit?: () => void;
  layout?: DashboardLayout | null;
  onReorderSections?: (newOrder: string[]) => void;
  onReorderCards?: (repoPath: string, newOrder: string[]) => void;
}) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragType, setActiveDragType] = useState<"section" | "card" | null>(null);
  const isDragging = activeDragId !== null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>
        <p className="text-zinc-400 text-base font-medium">No sessions detected</p>
        <p className="text-zinc-600 text-sm mt-1.5 max-w-xs text-center leading-relaxed">
          Start a Claude Code session in your terminal and it will appear here automatically.
        </p>
      </div>
    );
  }

  const rawGroups = groupSessions(sessions);
  const groups = applyLayout(rawGroups, layout ?? null);

  // Freeze groups during drag to prevent SWR poll from disrupting layout
  const stableGroupsRef = useRef(groups);
  if (!isDragging) {
    stableGroupsRef.current = groups;
  }
  const displayGroups = stableGroupsRef.current;

  // Build a flat index map: session id → flat index (for keyboard shortcuts)
  const flatIndexMap = new Map<string, number>();
  let flatIdx = 0;
  for (const group of displayGroups) {
    for (const session of group.sessions) {
      flatIndexMap.set(`${session.id}-${session.pid}`, flatIdx);
      flatIdx++;
    }
  }

  const getSessionProps = (session: ClaudeSession) => {
    const key = `${session.id}-${session.pid}`;
    const idx = flatIndexMap.get(key) ?? -1;
    const hasSelection = selectedIndex !== null && selectedIndex !== undefined;
    const isSelected = hasSelection && idx === selectedIndex;
    const acted = actedSessions?.[session.id];
    const displayStatus = acted
      ? acted.action === "reject"
        ? ("idle" as const)
        : ("working" as const)
      : session.status;

    return { key, idx, isSelected, acted, displayStatus };
  };

  const sendKeystrokeForRow = async (
    pid: number,
    keystroke: string,
    sessionId: string,
    action: "approve" | "reject",
  ) => {
    onApproveReject?.(sessionId, action);
    try {
      await sendKeystrokeAction(pid, keystroke);
    } catch (err) {
      console.error("Keystroke failed:", err);
    }
  };

  const renderCard = (session: ClaudeSession) => {
    const { key, idx, isSelected } = getSessionProps(session);
    return (
      <SessionCard
        key={key}
        session={session}
        targetScreen={targetScreen}
        pulse={freshlyChanged?.has(session.id)}
        selected={isSelected}
        shortcutNumber={idx < 9 ? idx + 1 : undefined}
        actionFeedback={isSelected ? actionFeedback : undefined}
        prStatus={session.prUrl ? (prStatuses?.[session.prUrl] ?? undefined) : undefined}
        onSelect={() => onSelectIndex?.(isSelected ? null : idx)}
        actedOn={actedSessions?.[session.id]}
        onApproveReject={onApproveReject ? (action) => onApproveReject(session.id, action) : undefined}
        editing={editingSessionId === session.id}
        onStartEdit={onStartEdit ? () => onStartEdit(session.id) : undefined}
        onSaveMeta={onSaveMeta ? (updates) => onSaveMeta(session.id, updates) : undefined}
        onCancelEdit={onCancelEdit}
      />
    );
  };

  const renderRow = (session: ClaudeSession) => {
    const { key, idx, isSelected, displayStatus } = getSessionProps(session);
    return (
      <SessionRow
        key={key}
        session={session}
        selected={isSelected}
        shortcutNumber={idx < 9 ? idx + 1 : undefined}
        prStatus={session.prUrl ? (prStatuses?.[session.prUrl] ?? undefined) : undefined}
        onSelect={() => onSelectIndex?.(isSelected ? null : idx)}
        displayStatus={displayStatus}
        onApproveReject={
          session.pid
            ? (action) => {
                sendKeystrokeForRow(session.pid!, action === "approve" ? "return" : "escape", session.id, action);
              }
            : undefined
        }
      />
    );
  };

  const renderSortableCards = (items: ClaudeSession[], repoPath: string) => {
    const sessionIds = items.map((s) => s.id);
    const strategy = viewMode === "list" ? verticalListSortingStrategy : rectSortingStrategy;

    return (
      <SortableContext items={sessionIds} strategy={strategy}>
        {viewMode === "list" ? (
          <div className="space-y-1">
            {items.map((session) => (
              <SortableCard key={`${session.id}-${session.pid}`} id={session.id}>
                {renderRow(session)}
              </SortableCard>
            ))}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 items-start">
            {items.map((session) => (
              <SortableCard key={`${session.id}-${session.pid}`} id={session.id}>
                {renderCard(session)}
              </SortableCard>
            ))}
          </div>
        )}
      </SortableContext>
    );
  };

  const accentMap = buildAccentMap(displayGroups.map((g) => g.repoName));

  const renderGroupHeader = (group: (typeof displayGroups)[0], showCount = true) => {
    const accent = accentMap.get(group.repoName) ?? REPO_ACCENTS[0];
    return (
      <div className={`flex items-center gap-3 ${viewMode === "list" ? "mb-2" : "mb-4"}`}>
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full ${accent.dot} ${accent.glow}`} />
          <h2 className={`text-sm font-semibold ${accent.text}`}>{prettifyName(group.repoName)}</h2>
        </div>
        {showCount && (
          <span className="text-[11px] text-zinc-600 font-(family-name:--font-geist-mono)">
            {group.sessions.length} session{group.sessions.length !== 1 ? "s" : ""}
          </span>
        )}
        {onNewSessionInRepo && (
          <button
            onClick={() => onNewSessionInRepo(group.repoPath, group.repoName)}
            className="has-tooltip flex items-center justify-center w-5 h-5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            data-tip={`New session`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        )}
        <div className={`flex-1 h-px bg-linear-to-r ${accent.line} to-transparent`} />
      </div>
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const type = active.data.current?.type as "section" | "card" | undefined;
    setActiveDragId(active.id as string);
    setActiveDragType(type ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setActiveDragType(null);

    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type;

    if (activeType === "section") {
      const sectionIds = displayGroups.map((g) => g.repoPath);
      const oldIndex = sectionIds.indexOf(active.id as string);
      const overType = over.data.current?.type;
      let newIndex: number;
      if (overType === "section") {
        newIndex = sectionIds.indexOf(over.id as string);
      } else {
        return;
      }
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(sectionIds, oldIndex, newIndex);
      onReorderSections?.(newOrder);
    } else if (activeType === "card") {
      // Find which group the active card belongs to
      for (const group of displayGroups) {
        const sessionIds = group.sessions.map((s) => s.id);
        const oldIndex = sessionIds.indexOf(active.id as string);
        if (oldIndex === -1) continue;

        const newIndex = sessionIds.indexOf(over.id as string);
        if (newIndex === -1) return;

        const newOrder = arrayMove(sessionIds, oldIndex, newIndex);
        onReorderCards?.(group.repoPath, newOrder);
        break;
      }
    }
  };

  // If there's only one group with one session, skip the grouping chrome
  if (displayGroups.length === 1 && displayGroups[0].sessions.length === 1) {
    return viewMode === "list" ? (
      <div className="space-y-1">{displayGroups[0].sessions.map(renderRow)}</div>
    ) : (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 items-start">
        {displayGroups[0].sessions.map(renderCard)}
      </div>
    );
  }

  const sectionIds = displayGroups.map((g) => g.repoPath);
  const hasCustomOrder = layout && layout.sectionOrder.length > 0;

  // When custom order exists, render all groups uniformly in a single vertical list
  if (hasCustomOrder) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-8">
            {displayGroups.map((group) => (
              <SortableSection key={group.repoPath} id={group.repoPath} header={renderGroupHeader(group)}>
                {renderSortableCards(group.sessions, group.repoPath)}
              </SortableSection>
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeDragId && activeDragType === "section" && (
            <div className="bg-zinc-900/90 backdrop-blur-sm rounded-lg px-4 py-2 border border-zinc-700 shadow-xl">
              <span className="text-sm text-zinc-300">
                {prettifyName(displayGroups.find((g) => g.repoPath === activeDragId)?.repoName ?? "")}
              </span>
            </div>
          )}
          {activeDragId && activeDragType === "card" && (() => {
            const session = sessions.find((s) => s.id === activeDragId);
            if (!session) return null;
            return (
              <div className="pointer-events-none opacity-90 shadow-2xl shadow-black/50 rounded-xl ring-1 ring-white/10" style={{ width: viewMode === "list" ? "100%" : 380 }}>
                {viewMode === "list" ? renderRow(session) : renderCard(session)}
              </div>
            );
          })()}
        </DragOverlay>
      </DndContext>
    );
  }

  // Default layout: sections are sortable, cards within sections are sortable
  const multiSessionGroups = displayGroups.filter((g) => g.sessions.length > 1);
  const singleSessionGroups = displayGroups.filter((g) => g.sessions.length === 1);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-8">
          {/* Multi-session groups: full-width with their own grid */}
          {multiSessionGroups.map((group) => (
            <SortableSection key={group.repoPath} id={group.repoPath} header={renderGroupHeader(group)}>
              {renderSortableCards(group.sessions, group.repoPath)}
            </SortableSection>
          ))}

          {/* Single-session groups: compact side-by-side layout */}
          {singleSessionGroups.length > 0 && viewMode === "grid" && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 items-start">
              {singleSessionGroups.map((group) => (
                <SortableSection key={group.repoPath} id={group.repoPath} header={renderGroupHeader(group, false)}>
                  {renderCard(group.sessions[0])}
                </SortableSection>
              ))}
            </div>
          )}

          {/* Single-session groups in list mode: keep stacked */}
          {singleSessionGroups.length > 0 && viewMode === "list" && (
            <>
              {singleSessionGroups.map((group) => (
                <SortableSection key={group.repoPath} id={group.repoPath} header={renderGroupHeader(group)}>
                  <div className="space-y-1">{group.sessions.map(renderRow)}</div>
                </SortableSection>
              ))}
            </>
          )}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeDragId && activeDragType === "section" && (
          <div className="bg-zinc-900/90 backdrop-blur-sm rounded-lg px-4 py-2 border border-zinc-700 shadow-xl">
            <span className="text-sm text-zinc-300">
              {prettifyName(displayGroups.find((g) => g.repoPath === activeDragId)?.repoName ?? "")}
            </span>
          </div>
        )}
        {activeDragId && activeDragType === "card" && (() => {
          const session = sessions.find((s) => s.id === activeDragId);
          if (!session) return null;
          return (
            <div className="pointer-events-none opacity-90 shadow-2xl shadow-black/50 rounded-xl ring-1 ring-white/10" style={{ width: viewMode === "list" ? "100%" : 380 }}>
              {viewMode === "list" ? renderRow(session) : renderCard(session)}
            </div>
          );
        })()}
      </DragOverlay>
    </DndContext>
  );
}
