import Image from "next/image";
import Link from "next/link";
import { ViewMode } from "@/lib/types";

interface Props {
  sessionCount: number;
  onNewSession?: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function DashboardHeader({ sessionCount, onNewSession, viewMode, onViewModeChange }: Props) {
  return (
    <header className="mb-10">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-3.5">
          <Image src="/logo.png" alt="Claudio Control" width={44} height={44} className="rounded-xl" unoptimized />
          <div>
            <h1 className="text-2xl tracking-tight font-(family-name:--font-pixel) text-gradient">Claudio Control</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {sessionCount === 0
                ? "No active sessions"
                : `${sessionCount} active session${sessionCount !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center bg-zinc-900/80 border border-zinc-800/50 rounded-lg titlebar-no-drag">
            <button
              onClick={() => onViewModeChange("grid")}
              className={`has-tooltip flex items-center justify-center w-8 h-8 rounded-l-lg transition-colors ${viewMode === "grid" ? "text-zinc-200 bg-zinc-800" : "text-zinc-600 hover:text-zinc-400"}`}
              data-tip="Grid view (⌘1)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                />
              </svg>
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              className={`has-tooltip flex items-center justify-center w-8 h-8 rounded-r-lg transition-colors ${viewMode === "list" ? "text-zinc-200 bg-zinc-800" : "text-zinc-600 hover:text-zinc-400"}`}
              data-tip="List view (⌘2)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
                />
              </svg>
            </button>
          </div>
          {onNewSession && (
            <button
              onClick={onNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/50 hover:border-zinc-700 transition-colors titlebar-no-drag"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New
            </button>
          )}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800/50">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-zinc-400">Live</span>
          </div>
          <Link
            href="/settings"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-200 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/50 hover:border-zinc-700 transition-colors titlebar-no-drag"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
        </div>
      </div>
      <div className="mt-4 h-px bg-linear-to-r from-zinc-800 via-zinc-700/50 to-transparent" />
    </header>
  );
}
