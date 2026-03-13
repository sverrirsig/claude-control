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
      <h4 className="text-xs font-medium text-zinc-300 line-clamp-2 leading-relaxed">
        {task.ticketId && (
          <span className="text-zinc-500 mr-1.5">{task.ticketId}</span>
        )}
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
