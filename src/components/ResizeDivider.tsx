"use client";

import { useCallback, useRef } from "react";

export function ResizeDivider({ onResize }: { onResize: (height: number) => void }) {
  const dragging = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const height = window.innerHeight - ev.clientY;
        const clamped = Math.max(150, Math.min(height, window.innerHeight * 0.8));
        onResize(clamped);
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [onResize],
  );

  return (
    <div
      onMouseDown={onMouseDown}
      className="h-1 cursor-row-resize bg-white/5 hover:bg-blue-500/30 transition-colors flex-shrink-0"
    />
  );
}
