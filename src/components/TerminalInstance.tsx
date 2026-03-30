"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import type { TerminalEntry } from "@/lib/types";

interface ElectronTerminalAPI {
  ptySpawn: (opts: { cols: number; rows: number; cwd: string; tmuxSession?: string; command?: string }) => Promise<{ ptyId: number }>;
  ptyWrite: (ptyId: number, data: string) => void;
  ptyResize: (ptyId: number, cols: number, rows: number) => void;
  ptyKill: (ptyId: number) => Promise<void>;
  onPtyData: (callback: (ptyId: number, data: string) => void) => () => void;
  onPtyExit: (callback: (ptyId: number, info: { exitCode: number; signal: number }) => void) => () => void;
}

function getElectronAPI(): ElectronTerminalAPI | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { electronAPI?: ElectronTerminalAPI }).electronAPI;
  return api?.ptySpawn ? api : null;
}

export function TerminalInstance({
  entry,
  visible,
  onPtySpawned,
  onPtyExited,
}: {
  entry: TerminalEntry;
  visible: boolean;
  onPtySpawned: (dir: string, ptyId: number) => void;
  onPtyExited: (dir: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<number | null>(null);
  const [exited, setExited] = useState(false);

  // Spawn PTY and set up xterm on mount, clean up on unmount.
  // Uses a `cancelled` flag to handle React 18 strict mode double-mount:
  // if cleanup runs before the async ptySpawn resolves, the spawned PTY
  // is killed immediately when the promise settles.
  useEffect(() => {
    let cancelled = false;
    const api = getElectronAPI();
    if (!api || !containerRef.current) return;

    const resolvedFont = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-geist-mono")
      .trim();
    const fontFamily = resolvedFont || 'Menlo, Monaco, "Courier New", monospace';

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily,
      theme: {
        background: "#0a0a0f",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        selectionBackground: "#3b82f640",
        black: "#09090b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e4e4e7",
        brightBlack: "#52525b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#fafafa",
      },
    });
    termRef.current = term;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    requestAnimationFrame(() => {
      fitAddon.fit();
      try {
        term.loadAddon(new WebglAddon());
      } catch {
        // WebGL not available, fall back to canvas renderer
      }
    });

    let ptyId: number | null = null;
    let cleanupData: (() => void) | null = null;
    let cleanupExit: (() => void) | null = null;

    api
      .ptySpawn({
        cols: term.cols,
        rows: term.rows,
        cwd: entry.workingDirectory,
        tmuxSession: entry.spawnCommand ? undefined : (entry.tmuxSession ?? undefined),
        command: entry.spawnCommand,
      })
      .then((result) => {
        if (cancelled) {
          // Effect was cleaned up before spawn completed (React 18 strict mode).
          // Kill the orphaned PTY immediately.
          api.ptyKill(result.ptyId).catch(() => {});
          return;
        }

        ptyId = result.ptyId;
        ptyIdRef.current = ptyId;
        onPtySpawned(entry.workingDirectory, ptyId);

        cleanupData = api.onPtyData((id, data) => {
          if (id === ptyId) term.write(data);
        });

        cleanupExit = api.onPtyExit((id) => {
          if (id === ptyId) {
            term.write("\r\n\x1b[90m[Session ended]\x1b[0m\r\n");
            setExited(true);
            onPtyExited(entry.workingDirectory);
          }
        });

        term.onData((data) => {
          if (ptyId !== null) api.ptyWrite(ptyId, data);
        });
      })
      .catch((err) => {
        if (!cancelled) {
          term.write(`\x1b[31mFailed to spawn terminal: ${err.message}\x1b[0m\r\n`);
        }
      });

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        if (ptyIdRef.current !== null) {
          api.ptyResize(ptyIdRef.current, term.cols, term.rows);
        }
      });
    });
    observer.observe(containerRef.current);

    return () => {
      cancelled = true;
      observer.disconnect();
      cleanupData?.();
      cleanupExit?.();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      if (ptyIdRef.current !== null) {
        api.ptyKill(ptyIdRef.current).catch(() => {});
        ptyIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.workingDirectory]);

  // Re-fit when becoming visible
  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
      const api = getElectronAPI();
      const term = termRef.current;
      if (api && term && ptyIdRef.current !== null) {
        api.ptyResize(ptyIdRef.current, term.cols, term.rows);
      }
    });
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 px-1 py-1"
      style={{ display: visible ? "block" : "none" }}
      data-exited={exited ? "true" : undefined}
    />
  );
}
