import Image from "next/image";
import { ScreenPicker } from "./ScreenPicker";

interface Props {
  sessionCount: number;
  targetScreen: number | null;
  onScreenChange: (screen: number | null) => void;
  onNewSession?: () => void;
}

export function DashboardHeader({ sessionCount, targetScreen, onScreenChange, onNewSession }: Props) {
  return (
    <header className="mb-10">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-3.5">
          <Image
            src="/icon.png"
            alt="Claude Control"
            width={44}
            height={44}
            className="rounded-xl"
          />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gradient">
              Claude Control
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {sessionCount === 0
                ? "No active sessions"
                : `${sessionCount} active session${sessionCount !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
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
          <ScreenPicker targetScreen={targetScreen} onChange={onScreenChange} />
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800/50">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-zinc-400">Live</span>
          </div>
        </div>
      </div>
      <div className="mt-4 h-px bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-transparent" />
    </header>
  );
}
