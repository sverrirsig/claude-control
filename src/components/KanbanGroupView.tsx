"use client";

import { useKanbanConfig } from "@/hooks/useKanbanConfig";
import { useKanbanState } from "@/hooks/useKanbanState";
import { useKanbanTick } from "@/hooks/useKanbanTick";
import type { ClaudeSession, KanbanColumn } from "@/lib/types";
import { type ReactNode, useCallback, useState } from "react";
import { KanbanBoard } from "./KanbanBoard";
import { KanbanColumnEditor } from "./KanbanColumnEditor";

interface Props {
  repoName: string;
  sessions: ClaudeSession[];
  renderCard: (session: ClaudeSession) => ReactNode;
}

export function KanbanGroupView({ repoName, sessions, renderCard }: Props) {
  const { config, addColumn, updateColumn, removeColumn } = useKanbanConfig(repoName);
  const { state, moveCard, unassignCard, refreshState } = useKanbanState(repoName);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [showNewColumnEditor, setShowNewColumnEditor] = useState(false);

  useKanbanTick(repoName, sessions, state.placements, refreshState);

  const handleMoveCard = useCallback(
    (sessionId: string, toColumnId: string) => {
      moveCard(sessionId, toColumnId);
    },
    [moveCard],
  );

  const handleEditColumn = useCallback((columnId: string) => {
    setEditingColumnId(columnId);
  }, []);

  const handleAddColumn = useCallback(() => {
    setShowNewColumnEditor(true);
  }, []);

  const handleSaveColumn = useCallback(
    (column: KanbanColumn) => {
      if (editingColumnId) {
        updateColumn(editingColumnId, column);
      } else {
        addColumn(column);
      }
      setEditingColumnId(null);
      setShowNewColumnEditor(false);
    },
    [editingColumnId, updateColumn, addColumn],
  );

  const handleDeleteColumn = useCallback(() => {
    if (editingColumnId) {
      removeColumn(editingColumnId);
      setEditingColumnId(null);
    }
  }, [editingColumnId, removeColumn]);

  const handleCloseEditor = useCallback(() => {
    setEditingColumnId(null);
    setShowNewColumnEditor(false);
  }, []);

  if (!config || config.columns.length === 0) return null;

  const editingColumn = editingColumnId ? config.columns.find((c) => c.id === editingColumnId) ?? null : null;

  return (
    <>
      <KanbanBoard
        config={config}
        state={state}
        sessions={sessions}
        renderCard={renderCard}
        onMoveCard={handleMoveCard}
        onUnstageCard={unassignCard}
        onEditColumn={handleEditColumn}
        onAddColumn={handleAddColumn}
      />

      {(editingColumnId || showNewColumnEditor) && (
        <KanbanColumnEditor
          column={editingColumn}
          onSave={handleSaveColumn}
          onDelete={editingColumnId ? handleDeleteColumn : undefined}
          onClose={handleCloseEditor}
        />
      )}
    </>
  );
}
