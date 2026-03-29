"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

export function SortableCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: "card", sessionId: id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group/sortable relative">
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover/sortable:opacity-100 transition-opacity z-10"
      >
        <svg className="w-3.5 h-4 text-zinc-600 hover:text-zinc-400" viewBox="0 0 14 16" fill="currentColor">
          <circle cx="4" cy="2" r="1.5" />
          <circle cx="10" cy="2" r="1.5" />
          <circle cx="4" cy="8" r="1.5" />
          <circle cx="10" cy="8" r="1.5" />
          <circle cx="4" cy="14" r="1.5" />
          <circle cx="10" cy="14" r="1.5" />
        </svg>
      </div>
      <div className="pl-4 group-hover/sortable:pl-6 transition-[padding]">{children}</div>
    </div>
  );
}
