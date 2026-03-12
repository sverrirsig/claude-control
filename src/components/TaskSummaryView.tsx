"use client";

import { useState } from "react";
import { TaskSummary } from "@/lib/types";

export function TaskSummaryView({ task }: { task: TaskSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={(e) => {
        if (task.description) {
          e.preventDefault();
          e.stopPropagation();
          setExpanded(!expanded);
        }
      }}
      className={task.description ? "cursor-pointer" : ""}
    >
      <div className="flex items-start gap-2">
        {task.ticketId && (
          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
            {task.ticketId}
          </span>
        )}
        <h4 className="text-xs font-medium text-zinc-300 line-clamp-2 leading-relaxed">
          {task.title}
        </h4>
      </div>
      {task.description && (
        <p
          className={`mt-1.5 text-[11px] text-zinc-500 leading-relaxed transition-all duration-200 ${
            expanded ? "" : "line-clamp-2"
          }`}
        >
          {task.description}
        </p>
      )}
      {task.description && !expanded && (
        <span className="text-[10px] text-zinc-600 mt-1 inline-block">
          Click to expand
        </span>
      )}
    </div>
  );
}
