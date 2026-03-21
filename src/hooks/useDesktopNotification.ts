import { useCallback, useEffect, useRef } from "react";
import { ClaudeSession } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  waiting: "#3b82f6", // blue-500
  idle: "#f59e0b", // amber-500
  finished: "#71717a", // zinc-500
};

// Generate a colored circle icon as a blob URL (cached per color)
const iconCache = new Map<string, string>();
function getStatusIcon(status: string): string | undefined {
  const color = STATUS_COLORS[status];
  if (!color) return undefined;
  if (iconCache.has(color)) return iconCache.get(color);

  try {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    // Glow
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, color + "88");
    gradient.addColorStop(1, color + "00");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Solid dot
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const url = canvas.toDataURL("image/png");
    iconCache.set(color, url);
    return url;
  } catch {
    return undefined;
  }
}

function prettifyName(name: string): string {
  return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getRepoLabel(session: ClaudeSession): string {
  const raw =
    session.isWorktree && session.parentRepo
      ? session.parentRepo.split("/").filter(Boolean).pop() || session.repoName || "Session"
      : session.repoName || "Session";
  return prettifyName(raw);
}

export function useDesktopNotification(alwaysNotify: boolean = false, onSelectSession?: (sessionId: string) => void) {
  const permissionGranted = useRef(false);
  const alwaysNotifyRef = useRef(alwaysNotify);
  const onSelectRef = useRef(onSelectSession);
  useEffect(() => {
    alwaysNotifyRef.current = alwaysNotify;
    onSelectRef.current = onSelectSession;
  });

  useEffect(() => {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        permissionGranted.current = true;
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((p) => {
          permissionGranted.current = p === "granted";
        });
      }
    }
  }, []);

  const notify = useCallback((session: ClaudeSession, newStatus: string) => {
    if (!permissionGranted.current) return;
    if (!("Notification" in window)) return;

    // Don't notify if the window is focused — unless alwaysNotify is on
    if (document.hasFocus() && !alwaysNotifyRef.current) return;

    const repo = getRepoLabel(session);
    const icon = getStatusIcon(newStatus);
    const parts: string[] = [];
    if (session.branch) parts.push(session.branch);
    if (session.taskSummary?.title) parts.push(session.taskSummary.title);
    const body = parts.join("\n") || undefined;

    const notification = new Notification(repo, {
      body,
      silent: true,
      icon,
    });

    setTimeout(() => notification.close(), 5000);

    notification.onclick = () => {
      window.focus();
      notification.close();
      onSelectRef.current?.(session.id);
    };
  }, []);

  return notify;
}
