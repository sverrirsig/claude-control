"use client";

import { useEffect, useRef, useState } from "react";
import { TaskSummary } from "@/lib/types";

interface TaskSummaryViewProps {
  task: TaskSummary;
  editing?: boolean;
  onSave?: (updates: { title?: string; description?: string }) => void;
  onCancel?: () => void;
  onStartEdit?: () => void;
}

export function TaskSummaryView({ task, editing, onSave, onCancel, onStartEdit }: TaskSummaryViewProps) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [prevTask, setPrevTask] = useState({ title: task.title, description: task.description });
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);

  // Sync state when task changes externally (React 19 "adjust state during render" pattern)
  if (!editing && (task.title !== prevTask.title || task.description !== prevTask.description)) {
    setPrevTask({ title: task.title, description: task.description });
    setTitle(task.title);
    setDescription(task.description ?? "");
  }

  // Auto-focus title input when entering edit mode
  useEffect(() => {
    if (editing) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [editing]);

  const stopProp = (e: React.MouseEvent | React.FocusEvent) => {
    e.stopPropagation();
  };

  const handleSave = () => {
    onSave?.({
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    }
  };

  if (editing) {
    return (
      <div onClick={stopProp} onMouseDown={stopProp} className="space-y-2">
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={stopProp}
          onFocus={stopProp}
          placeholder="Title"
          className="w-full px-2 py-1.5 rounded-md text-xs font-medium bg-white/6 border border-white/10 focus:border-blue-500/40 focus:bg-white/8 text-zinc-200 placeholder:text-zinc-600 outline-hidden transition-colors"
        />
        <input
          ref={descRef}
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={stopProp}
          onFocus={stopProp}
          placeholder="Description (optional)"
          className="w-full px-2 py-1.5 rounded-md text-[11px] bg-white/6 border border-white/10 focus:border-blue-500/40 focus:bg-white/8 text-zinc-400 placeholder:text-zinc-600 outline-hidden transition-colors"
        />
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => {
              stopProp(e);
              handleSave();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-blue-600/80 hover:bg-blue-500 text-white transition-colors"
          >
            Save
            <kbd className="ml-0.5 px-1 py-px rounded-sm bg-white/15 text-[9px] font-mono">&#x23CE;</kbd>
          </button>
          <button
            onClick={(e) => {
              stopProp(e);
              onCancel?.();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] text-zinc-500 hover:text-zinc-300 bg-white/4 hover:bg-white/8 transition-colors"
          >
            Cancel
            <kbd className="ml-0.5 px-1 py-px rounded-sm bg-white/6 text-[9px] font-mono">Esc</kbd>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => {
        if (task.description) {
          e.preventDefault();
          e.stopPropagation();
          setExpanded(!expanded);
        }
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onStartEdit?.();
      }}
      className={task.description ? "cursor-pointer" : ""}
    >
      <h4 className="text-xs font-medium text-zinc-300 line-clamp-2 leading-relaxed">
        {task.ticketId && <span className="text-zinc-500 mr-1.5">{task.ticketId}</span>}
        {task.title}
      </h4>
      {task.description && (
        <p
          className={`mt-1.5 text-[11px] text-zinc-500 leading-relaxed transition-all duration-200 ${
            expanded ? "" : "line-clamp-2"
          }`}
        >
          {task.description}
        </p>
      )}
    </div>
  );
}
