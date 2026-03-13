"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ScreenPicker } from "@/components/ScreenPicker";

interface OptionDef {
  id: string;
  label: string;
}

interface SettingsData {
  config: {
    codeDirectories: string[];
    editor: string;
    gitGui: string;
    browser: string;
  };
  options: {
    editors: OptionDef[];
    gitGuis: OptionDef[];
    browsers: OptionDef[];
  };
}

function SettingRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: OptionDef[];
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-white/[0.04]">
      <div>
        <h3 className="text-sm font-medium text-zinc-200">{label}</h3>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600 min-w-[180px]"
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [saved, setSaved] = useState(false);
  const [addingDir, setAddingDir] = useState(false);
  const [targetScreen, setTargetScreen] = useState<number | null>(null);

  useEffect(() => {
    const s = localStorage.getItem("targetScreen");
    if (s !== null) setTargetScreen(s === "" ? null : parseInt(s, 10));
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  const save = async (updates: Partial<SettingsData["config"]>) => {
    if (!data) return;
    const newConfig = { ...data.config, ...updates };
    setData({ ...data, config: newConfig });
        try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    } catch (err) {
      console.error("Failed to save:", err);
    }
  };

  const addDirectory = async () => {
    setAddingDir(true);
    try {
      const res = await fetch("/api/pick-folder");
      const { path } = await res.json();
      if (path && data) {
        const dirs = [...data.config.codeDirectories];
        if (!dirs.includes(path)) {
          dirs.push(path);
          await save({ codeDirectories: dirs });
        }
      }
    } catch (err) {
      console.error("Failed to add directory:", err);
    }
    setAddingDir(false);
  };

  const removeDirectory = (dir: string) => {
    if (!data) return;
    const dirs = data.config.codeDirectories.filter((d) => d !== dir);
    save({ codeDirectories: dirs });
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gradient">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Configure your tools and preferences</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs text-emerald-400 animate-pulse">Saved</span>
          )}
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/50 hover:border-zinc-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back
          </Link>
        </div>
      </div>

      {/* Tools section */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Tools</h2>
        <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0f]/80 px-5">
          <SettingRow
            label="Code Editor"
            description="Opens when you click the editor button on a session card"
            value={data.config.editor}
            options={data.options.editors}
            onChange={(editor) => save({ editor })}
          />
          <SettingRow
            label="Git GUI"
            description="Opens when you click the git button on a session card"
            value={data.config.gitGui}
            options={data.options.gitGuis}
            onChange={(gitGui) => save({ gitGui })}
          />
          <SettingRow
            label="Browser"
            description="Used for opening pull request links"
            value={data.config.browser}
            options={data.options.browsers}
            onChange={(browser) => save({ browser })}
          />
        </div>
      </section>

      {/* Display section */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Display</h2>
        <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0f]/80 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-zinc-200">Target Screen</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Which screen to open apps on when using quick actions</p>
            </div>
            <ScreenPicker
              targetScreen={targetScreen}
              onChange={(screen) => {
                setTargetScreen(screen);
                localStorage.setItem("targetScreen", screen === null ? "" : String(screen));
              }}
            />
          </div>
        </div>
      </section>

      {/* Code directories section */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Code Directories</h2>
        <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0f]/80 px-5 py-3">
          <p className="text-xs text-zinc-500 mb-3">
            Folders that are scanned for git repositories when creating new sessions.
          </p>
          {data.config.codeDirectories.length > 0 ? (
            <div className="space-y-2 mb-3">
              {data.config.codeDirectories.map((dir) => (
                <div
                  key={dir}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]"
                >
                  <span className="text-sm text-zinc-300 font-mono truncate">{dir}</span>
                  <button
                    onClick={() => removeDirectory(dir)}
                    className="ml-3 shrink-0 text-zinc-600 hover:text-red-400 transition-colors"
                    title="Remove directory"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-600 italic mb-3">No directories configured</p>
          )}
          <button
            onClick={addDirectory}
            disabled={addingDir}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] hover:border-white/[0.15] transition-colors disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {addingDir ? "Selecting..." : "Add Directory"}
          </button>
        </div>
      </section>
    </div>
  );
}
