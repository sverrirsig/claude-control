"use client";

import { useScreens } from "@/hooks/useScreens";

interface Props {
  targetScreen: number | null;
  onChange: (screen: number | null) => void;
}

export function ScreenPicker({ targetScreen, onChange }: Props) {
  const screens = useScreens();

  if (screens.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-zinc-500">Open apps on:</span>
      <select
        value={targetScreen ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
        className="text-[11px] bg-zinc-900 border border-zinc-700/50 rounded-md px-2 py-1 text-zinc-300 outline-none focus:border-zinc-500 cursor-pointer"
      >
        <option value="">Same screen</option>
        {screens.map((s) => (
          <option key={s.index} value={s.index}>
            {s.name} ({s.resolution})
          </option>
        ))}
      </select>
    </div>
  );
}
