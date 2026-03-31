"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import type { TerminalEntry } from "@/lib/types";

interface ElectronTerminalAPI {
  ptySpawn: (opts: { cols: number; rows: number; cwd: string; tmuxSession?: string; command?: string; wrapInTmux?: boolean }) => Promise<{ ptyId: number }>;
  ptyWrite: (ptyId: number, data: string) => void;
  ptyResize: (ptyId: number, cols: number, rows: number) => void;
  ptyKill: (ptyId: number, killTmuxSession?: boolean) => Promise<void>;
  ptyReattach: (ptyId: number) => Promise<{ alive: boolean; buffer: string }>;
  onPtyData: (callback: (ptyId: number, data: string) => void) => () => void;
  onPtyExit: (callback: (ptyId: number, info: { exitCode: number; signal: number }) => void) => () => void;
  getFilePath: (file: File) => string;
  ptyListInlineTmux: () => Promise<Array<{ name: string; cwd: string; dead: boolean }>>;
}

function getElectronAPI(): ElectronTerminalAPI | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { electronAPI?: ElectronTerminalAPI }).electronAPI;
  return api?.ptySpawn ? api : null;
}

export function TerminalInstance({
  entry,
  visible,
  existingPtyId,
  onPtySpawned,
  onPtyExited,
}: {
  entry: TerminalEntry;
  visible: boolean;
  existingPtyId?: number | null;
  onPtySpawned: (dir: string, ptyId: number) => void;
  onPtyExited: (dir: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<number | null>(null);
  const [exited, setExited] = useState(false);

  // Spawn or reattach PTY and set up xterm on mount.
  // On unmount: cleanup xterm and listeners but DON'T kill the PTY —
  // it stays alive in the main process for reattachment after route changes.
  // PTY killing is handled explicitly by the parent (close button).
  useEffect(() => {
    let cancelled = false;
    const api = getElectronAPI();
    if (!api || !containerRef.current) return;

    // Capture ref before the async boundary — React may null it before cleanup
    const container = containerRef.current;

    // Hoist variables that cleanup needs access to
    let cleanupData: (() => void) | null = null;
    let cleanupExit: (() => void) | null = null;
    let observer: ResizeObserver | null = null;
    let safetyFit: ReturnType<typeof setTimeout> | null = null;

    // Wait for fonts to load before initializing xterm.
    // xterm.js measures character cell dimensions on open(); if the font
    // hasn't loaded yet, measurements will be wrong causing misaligned text
    // and broken box-drawing characters.
    document.fonts.ready.then(() => {
      if (cancelled) return;

      const resolvedFont = getComputedStyle(document.body)
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
      term.open(container);

      // Double-RAF ensures the container has its final layout dimensions before fitting
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (cancelled) return;
        fitAddon.fit();
        try {
          term.loadAddon(new WebglAddon());
        } catch (e) {
          console.warn("[terminal] WebGL unavailable, using canvas:", e);
        }
      }));

      function attachToPty(id: number) {
        ptyIdRef.current = id;

        cleanupData = api!.onPtyData((evId, data) => {
          if (evId === id) term.write(data);
        });

        cleanupExit = api!.onPtyExit((evId) => {
          if (evId === id) {
            term.write("\r\n\x1b[90m[Session ended]\x1b[0m\r\n");
            setExited(true);
            onPtyExited(entry.workingDirectory);
          }
        });

        term.onData((data) => {
          if (ptyIdRef.current !== null) api!.ptyWrite(ptyIdRef.current, data);
        });
      }

      // If we have an existing PTY, try to reattach; otherwise spawn fresh
      if (existingPtyId != null) {
        api.ptyReattach(existingPtyId)
          .then((result) => {
            if (cancelled) return;
            if (result.alive) {
              // Write buffered scrollback then attach for live data
              if (result.buffer) term.write(result.buffer);
              attachToPty(existingPtyId!);
              onPtySpawned(entry.workingDirectory, existingPtyId!);
              // Trigger resize to refresh terminal content (double-RAF for layout settle)
              requestAnimationFrame(() => requestAnimationFrame(() => {
                fitAddon.fit();
                api!.ptyResize(existingPtyId!, term.cols, term.rows);
              }));
            } else {
              // PTY died while we were away — mark as exited
              term.write("\x1b[90m[Session ended]\x1b[0m\r\n");
              setExited(true);
              onPtyExited(entry.workingDirectory);
            }
          })
          .catch(() => {
            if (!cancelled) {
              term.write("\x1b[31mFailed to reattach terminal\x1b[0m\r\n");
            }
          });
      } else {
        api
          .ptySpawn({
            cols: term.cols,
            rows: term.rows,
            cwd: entry.workingDirectory,
            tmuxSession: entry.spawnCommand ? undefined : (entry.tmuxSession ?? undefined),
            command: entry.spawnCommand,
            wrapInTmux: entry.wrapInTmux,
          })
          .then((result) => {
            if (cancelled) {
              // Effect was cleaned up before spawn completed (React 18 strict mode).
              api.ptyKill(result.ptyId).catch(() => {});
              return;
            }
            attachToPty(result.ptyId);
            onPtySpawned(entry.workingDirectory, result.ptyId);
            // Re-fit after attach to send correct dimensions to the PTY (double-RAF for layout settle)
            requestAnimationFrame(() => requestAnimationFrame(() => {
              fitAddon.fit();
              api.ptyResize(result.ptyId, term.cols, term.rows);
            }));
          })
          .catch((err) => {
            if (!cancelled) {
              term.write(`\x1b[31mFailed to spawn terminal: ${err.message}\x1b[0m\r\n`);
            }
          });
      }

      observer = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          fitAddon.fit();
          if (ptyIdRef.current !== null) {
            api.ptyResize(ptyIdRef.current, term.cols, term.rows);
          }
        });
      });
      observer.observe(container);

      // Safety-net fit after layout has fully settled (covers startup/recovery)
      safetyFit = setTimeout(() => {
        if (!cancelled) {
          fitAddon.fit();
          if (ptyIdRef.current !== null) {
            api.ptyResize(ptyIdRef.current, term.cols, term.rows);
          }
        }
      }, 200);
    });

    return () => {
      cancelled = true;
      if (safetyFit) clearTimeout(safetyFit);
      observer?.disconnect();
      cleanupData?.();
      cleanupExit?.();
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      // DON'T kill PTY — it stays alive for reattachment.
      // PTY killing is handled by explicit close actions.
      ptyIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.workingDirectory]);

  // Re-fit when becoming visible (double-RAF to ensure layout is settled)
  useEffect(() => {
    if (!visible) return;
    const doFit = () => {
      fitAddonRef.current?.fit();
      const api = getElectronAPI();
      const term = termRef.current;
      if (api && term && ptyIdRef.current !== null) {
        api.ptyResize(ptyIdRef.current, term.cols, term.rows);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(doFit));
  }, [visible]);

  // Re-fit on window resize (fullscreen toggle, etc.)
  useEffect(() => {
    if (!visible) return;
    const onResize = () => {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        const api = getElectronAPI();
        const term = termRef.current;
        if (api && term && ptyIdRef.current !== null) {
          api.ptyResize(ptyIdRef.current, term.cols, term.rows);
        }
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [visible]);

  // Drag-and-drop: use capture-phase native listeners so we intercept
  // events before xterm.js's internal elements can swallow them.
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Prevent Electron's default file-drop-navigates behavior globally
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => {
      document.removeEventListener("dragover", prevent);
      document.removeEventListener("drop", prevent);
    };
  }, []);

  const handleDrop = (e: DragEvent | React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const term = termRef.current;
    const api = getElectronAPI();
    const id = ptyIdRef.current;
    const dt = "nativeEvent" in e ? (e as React.DragEvent).nativeEvent.dataTransfer : e.dataTransfer;
    if (!term || !api || id === null || !dt) return;

    const files = Array.from(dt.files);
    if (files.length === 0) return;

    const paths = files
      .map((f) => api.getFilePath(f))
      .filter(Boolean);
    if (paths.length > 0) {
      // Shell-escape paths that contain spaces, then send to the PTY
      // wrapped in explicit bracketed paste sequences so Claude Code
      // (and other apps that enable DECSET 2004) detect the file drop.
      const escaped = paths.map((p) => (p.includes(" ") ? `"${p}"` : p));
      const text = escaped.join(" ");
      api.ptyWrite(id, `\x1b[200~${text}\x1b[201~`);
      term.focus();
    }
  };

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    wrapper.addEventListener("dragover", onDragOver, { capture: true });
    wrapper.addEventListener("drop", handleDrop as EventListener, { capture: true });

    return () => {
      wrapper.removeEventListener("dragover", onDragOver, { capture: true });
      wrapper.removeEventListener("drop", handleDrop as EventListener, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0"
      style={{ display: visible ? "block" : "none" }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 px-1 py-1"
        data-exited={exited ? "true" : undefined}
      />
    </div>
  );
}
