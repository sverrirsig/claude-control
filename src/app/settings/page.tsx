"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ScreenPicker } from "@/components/ScreenPicker";

interface OptionDef {
  id: string;
  label: string;
}

interface AppOptionDef extends OptionDef {
  installed: boolean;
}

interface DependencyDef {
  id: string;
  label: string;
  description: string;
  installed: boolean;
  url: string;
}

interface SettingsData {
  config: {
    codeDirectories: string[];
    editor: string;
    gitGui: string;
    browser: string;
    notifications: boolean;
    notificationSound: boolean;
    alwaysNotify: boolean;
    terminalApp: string;
    terminalOpenIn: string;
    terminalUseTmux: boolean;
    terminalTmuxMode: string;
    initialPrompt: string;
    createPrPrompt: string;
    defaultBaseBranch: string;
    showKeyboardHints: boolean;
  };
  options: {
    editors: AppOptionDef[];
    gitGuis: AppOptionDef[];
    browsers: AppOptionDef[];
    terminalApps: AppOptionDef[];
    terminalOpenIn: OptionDef[];
    terminalTmuxModes: OptionDef[];
  };
  dependencies: DependencyDef[];
}

function Toggle({
  enabled,
  onChange,
  label,
  description,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-white/4 last:border-0">
      <div>
        <h3 className="text-sm font-medium text-zinc-200">{label}</h3>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${enabled ? "bg-emerald-500" : "bg-zinc-700"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200 ${enabled ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}

function SettingRow<T extends OptionDef>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: T[];
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-white/4">
      <div className="flex-1 min-w-0 mr-4">
        <h3 className="text-sm font-medium text-zinc-200">{label}</h3>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="shrink-0 bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-hidden focus:border-zinc-600 w-[200px]"
      >
        {options.map((opt) => {
          const installed = "installed" in opt ? (opt as AppOptionDef).installed : true;
          return (
            <option key={opt.id} value={opt.id} disabled={!installed}>
              {opt.label}
              {!installed ? " (not installed)" : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [saved, setSaved] = useState(false);
  const [addingDir, setAddingDir] = useState(false);
  const [targetScreen, setTargetScreen] = useState<number | null>(null);
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const [prPromptDraft, setPrPromptDraft] = useState<string | null>(null);
  const [baseBranchDraft, setBaseBranchDraft] = useState<string | null>(null);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseBranchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const s = localStorage.getItem("targetScreen");
    if (s !== null) setTargetScreen(s === "" ? null : parseInt(s, 10));
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: SettingsData) => {
        setData(d);
        setPromptDraft(d.config.initialPrompt ?? "");
        setPrPromptDraft(d.config.createPrPrompt ?? "");
        setBaseBranchDraft(d.config.defaultBaseBranch ?? "main");
      })
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

  const savePromptDebounced = useCallback(
    (value: string) => {
      setPromptDraft(value);
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
      promptTimerRef.current = setTimeout(() => {
        save({ initialPrompt: value });
      }, 500);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save is intentionally excluded (unstable reference)
    [data],
  );

  const savePrPromptDebounced = useCallback(
    (value: string) => {
      setPrPromptDraft(value);
      if (prPromptTimerRef.current) clearTimeout(prPromptTimerRef.current);
      prPromptTimerRef.current = setTimeout(() => {
        save({ createPrPrompt: value });
      }, 500);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save is intentionally excluded (unstable reference)
    [data],
  );

  const saveBaseBranchDebounced = useCallback(
    (value: string) => {
      setBaseBranchDraft(value);
      if (baseBranchTimerRef.current) clearTimeout(baseBranchTimerRef.current);
      baseBranchTimerRef.current = setTimeout(() => {
        save({ defaultBaseBranch: value });
      }, 500);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save is intentionally excluded (unstable reference)
    [data],
  );

  // Flush pending saves on unmount
  useEffect(() => {
    return () => {
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
      if (prPromptTimerRef.current) clearTimeout(prPromptTimerRef.current);
      if (baseBranchTimerRef.current) clearTimeout(baseBranchTimerRef.current);
    };
  }, []);

  const addDirectory = async () => {
    setAddingDir(true);
    try {
      const api = (
        window as unknown as { electronAPI?: { pickFolder: () => Promise<{ cancelled?: boolean; path?: string }> } }
      ).electronAPI;
      if (!api) {
        console.error("Folder picker is only available in the desktop app");
        setAddingDir(false);
        return;
      }
      const { path, cancelled } = await api.pickFolder();
      if (cancelled || !path || !data) {
        setAddingDir(false);
        return;
      }
      const dirs = [...data.config.codeDirectories];
      if (!dirs.includes(path)) {
        dirs.push(path);
        await save({ codeDirectories: dirs });
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
          {saved && <span className="text-xs text-emerald-400 animate-pulse">Saved</span>}
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

      {/* Dependencies section */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Dependencies</h2>
        <div className="rounded-xl border border-white/6 bg-[#0a0a0f]/80 px-5">
          {data.dependencies.map((dep, i) => (
            <div
              key={dep.id}
              className={`flex items-center justify-between py-4 ${i < data.dependencies.length - 1 ? "border-b border-white/4" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${dep.installed ? "bg-emerald-400" : "bg-red-400"}`} />
                <div>
                  <h3 className="text-sm font-medium text-zinc-200">{dep.label}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{dep.description}</p>
                </div>
              </div>
              {!dep.installed && (
                <a
                  href={dep.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 ml-4 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 bg-white/4 hover:bg-white/8 border border-white/7 hover:border-white/15 transition-colors"
                >
                  Install
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Tools section */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Tools</h2>
        <div className="rounded-xl border border-white/6 bg-[#0a0a0f]/80 px-5">
          <SettingRow
            label="Browser"
            description="Used for opening pull request links"
            value={data.config.browser}
            options={data.options.browsers}
            onChange={(browser) => save({ browser })}
          />
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
        </div>
      </section>

      {/* Terminal section */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Terminal</h2>
        <div className="rounded-xl border border-white/6 bg-[#0a0a0f]/80 px-5">
          <SettingRow
            label="Terminal App"
            description="Which terminal to use for focusing sessions and creating new ones"
            value={data.config.terminalApp}
            options={data.options.terminalApps}
            onChange={(terminalApp) => save({ terminalApp })}
          />
          <SettingRow
            label="Open In"
            description="Open new sessions in a tab or window"
            value={data.config.terminalOpenIn}
            options={data.options.terminalOpenIn}
            onChange={(terminalOpenIn) => save({ terminalOpenIn })}
          />
          <Toggle
            label="Use tmux"
            description="Run claude sessions inside tmux for background operation and send-keys support"
            enabled={data.config.terminalUseTmux ?? false}
            onChange={(terminalUseTmux) => save({ terminalUseTmux })}
          />
          {data.config.terminalUseTmux && (
            <SettingRow
              label="Tmux Session"
              description="Group by project name automatically, or pick a session each time"
              value={data.config.terminalTmuxMode ?? "per-project"}
              options={data.options.terminalTmuxModes}
              onChange={(terminalTmuxMode) => save({ terminalTmuxMode })}
            />
          )}
        </div>
      </section>

      {/* Notifications section */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Notifications</h2>
        <div className="rounded-xl border border-white/6 bg-[#0a0a0f]/80 px-5">
          <Toggle
            label="Desktop Notifications"
            description="Show a macOS notification when a session finishes working"
            enabled={data.config.notifications ?? true}
            onChange={(notifications) => save({ notifications })}
          />
          <Toggle
            label="Notification Sound"
            description="Play a chime when a session finishes working"
            enabled={data.config.notificationSound ?? true}
            onChange={(notificationSound) => save({ notificationSound })}
          />
          <Toggle
            label="Always Send Notification"
            description="Show notifications even when the app is focused"
            enabled={data.config.alwaysNotify ?? false}
            onChange={(alwaysNotify) => save({ alwaysNotify })}
          />
        </div>
      </section>

      {/* Display section */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Display</h2>
        <div className="rounded-xl border border-white/6 bg-[#0a0a0f]/80 px-5">
          <div className="flex items-center justify-between py-4 border-b border-white/4">
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
          <Toggle
            label="Keyboard Shortcuts Bar"
            description="Show the hotkey hints bar at the bottom of the dashboard"
            enabled={data.config.showKeyboardHints ?? true}
            onChange={(showKeyboardHints) => {
              save({ showKeyboardHints } as Partial<SettingsData["config"]>);
              localStorage.setItem("showKeyboardHints", String(showKeyboardHints));
            }}
          />
        </div>
      </section>

      {/* Session defaults section */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Session Defaults</h2>
        <div className="rounded-xl border border-white/6 bg-[#0a0a0f]/80 px-5 py-4 space-y-5">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Initial Prompt</h3>
            <p className="text-xs text-zinc-500 mt-0.5 mb-2">
              Default prompt used when creating new sessions with a branch name
            </p>
            <textarea
              rows={4}
              value={promptDraft ?? ""}
              onChange={(e) => savePromptDebounced(e.target.value)}
              placeholder="e.g. Read the CLAUDE.md and implement the ticket..."
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700/50 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-hidden focus:border-zinc-600 transition-colors resize-y min-h-20"
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Create PR Prompt</h3>
            <p className="text-xs text-zinc-500 mt-0.5 mb-2">
              Message sent to Claude when you click the PR button on a session card
            </p>
            <textarea
              rows={3}
              value={prPromptDraft ?? ""}
              onChange={(e) => savePrPromptDebounced(e.target.value)}
              placeholder="e.g. /create-pr or a natural language instruction"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700/50 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-hidden focus:border-zinc-600 transition-colors resize-y min-h-16"
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Default Base Branch</h3>
            <p className="text-xs text-zinc-500 mt-0.5 mb-2">Base branch used when creating worktree sessions</p>
            <input
              type="text"
              value={baseBranchDraft ?? "main"}
              onChange={(e) => saveBaseBranchDebounced(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700/50 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-hidden focus:border-zinc-600 transition-colors"
            />
          </div>
        </div>
      </section>

      {/* Code directories section */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Code Directories</h2>
        <div className="rounded-xl border border-white/6 bg-[#0a0a0f]/80 px-5 py-3">
          <p className="text-xs text-zinc-500 mb-3">
            Folders that are scanned for git repositories when creating new sessions.
          </p>
          {data.config.codeDirectories.length > 0 ? (
            <div className="space-y-2 mb-3">
              {data.config.codeDirectories.map((dir) => (
                <div
                  key={dir}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/3 border border-white/4"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 bg-white/4 hover:bg-white/8 border border-white/7 hover:border-white/15 transition-colors disabled:opacity-40"
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
