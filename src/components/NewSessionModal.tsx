"use client";

import { useState, useEffect, useRef } from "react";

interface RepoInfo {
  name: string;
  path: string;
  isGitRepo: boolean;
}

interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
}

interface TerminalConfig {
  terminalUseTmux: boolean;
  terminalTmuxMode: "per-project" | "choose";
}

interface Props {
  repoPath?: string;
  repoName?: string;
  onClose: () => void;
}

export function NewSessionModal({ repoPath, repoName, onClose }: Props) {
  const [branchName, setBranchName] = useState("");
  const [baseBranch, setBaseBranch] = useState("dev");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>(repoPath || "");
  const [selectedRepoName, setSelectedRepoName] = useState<string>(repoName || "");
  const [repoFilter, setRepoFilter] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupPath, setSetupPath] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reposLoading, setReposLoading] = useState(true);
  const [terminalConfig, setTerminalConfig] = useState<TerminalConfig | null>(null);
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([]);
  const [tmuxSessionsLoading, setTmuxSessionsLoading] = useState(false);
  const [selectedTmuxSession, setSelectedTmuxSession] = useState<string>("");
  const branchRef = useRef<HTMLInputElement>(null);
  const isRepoMode = !repoPath;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function fetchRepos() {
    setReposLoading(true);
    fetch("/api/repos")
      .then((r) => r.json())
      .then((data) => {
        setRepos(data.repos || []);
        setNeedsSetup(data.needsSetup === true);
        setReposLoading(false);
      })
      .catch(() => setReposLoading(false));
  }

  useEffect(() => {
    if (isRepoMode) fetchRepos();
  }, [isRepoMode]);

  // Load configured initial prompt from settings — only if user hasn't typed yet
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setPrompt((prev) => prev === null ? (data.config?.initialPrompt ?? "") : prev);
      })
      .catch(() => setPrompt((prev) => prev === null ? "" : prev));
  }, []);

  // Focus branch input when in repo-scoped mode
  useEffect(() => {
    if (!isRepoMode) {
      setTimeout(() => branchRef.current?.focus(), 100);
    }
  }, [isRepoMode]);

  // Fetch terminal config to determine if tmux picker should show
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const cfg: TerminalConfig = {
          terminalUseTmux: data.config?.terminalUseTmux ?? false,
          terminalTmuxMode: data.config?.terminalTmuxMode ?? "per-project",
        };
        setTerminalConfig(cfg);

        // If tmux enabled and mode is "choose", fetch live sessions and pre-fill project name
        if (cfg.terminalUseTmux && cfg.terminalTmuxMode === "choose") {
          if (repoName) setSelectedTmuxSession(repoName);
          setTmuxSessionsLoading(true);
          fetch("/api/tmux/sessions")
            .then((r) => r.json())
            .then((d) => setTmuxSessions(d.sessions ?? []))
            .catch(() => setTmuxSessions([]))
            .finally(() => setTmuxSessionsLoading(false));
        }
      })
      .catch(() => setTerminalConfig(null));
  }, [repoName]);

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(repoFilter.toLowerCase()) ||
      r.path.toLowerCase().includes(repoFilter.toLowerCase())
  );

  async function addDirectory(dir: string) {
    setSetupLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: dir }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add directory");
        setSetupLoading(false);
        return;
      }
      setNeedsSetup(false);
      setSetupPath("");
      setSetupLoading(false);
      fetchRepos();
    } catch {
      setError("Failed to save directory");
      setSetupLoading(false);
    }
  }

  async function handleSetup() {
    if (!setupPath.trim()) return;
    await addDirectory(setupPath.trim());
  }

  async function handleBrowse() {
    setSetupLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pick-folder", { method: "POST" });
      const data = await res.json();
      if (data.cancelled) {
        setSetupLoading(false);
        return;
      }
      if (data.path) {
        await addDirectory(data.path);
      }
    } catch {
      setError("Failed to open folder picker");
      setSetupLoading(false);
    }
  }

  async function handleCreate() {
    const targetRepo = repoPath || selectedRepo;
    if (!targetRepo) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sessions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoPath: targetRepo,
          branchName: branchName.trim() || undefined,
          baseBranch: branchName.trim() ? baseBranch.trim() || undefined : undefined,
          prompt: (prompt ?? "").trim() || undefined,
          tmuxSession: selectedTmuxSession || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create session");
        setLoading(false);
        return;
      }

      onClose();
    } catch {
      setError("Failed to create session");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md mx-4 rounded-2xl bg-[#0c0c14] border border-zinc-800 shadow-2xl shadow-black/50 overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-lg font-semibold text-zinc-100">
            {isRepoMode ? "New Session" : `New Session in ${repoName}`}
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {needsSetup
              ? "First, tell us where your code lives"
              : isRepoMode
              ? "Pick a repo and optionally create a worktree"
              : "Create a new worktree branch or open on the main branch"}
          </p>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* First-time setup */}
          {isRepoMode && needsSetup && (
            <div className="space-y-3">
              <div className="px-3 py-3 rounded-lg bg-blue-500/5 border border-blue-500/15">
                <p className="text-sm text-zinc-300">
                  Select the folder where your repositories live. We&apos;ll scan it for git repos.
                </p>
              </div>
              <button
                onClick={handleBrowse}
                disabled={setupLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {setupLoading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    Browse for Folder...
                  </>
                )}
              </button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full h-px bg-zinc-800" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[#0c0c14] px-3 text-xs text-zinc-600">or type a path</span>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="~/Code"
                  value={setupPath}
                  onChange={(e) => setSetupPath(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSetup()}
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors font-[family-name:var(--font-geist-mono)]"
                />
                <button
                  onClick={handleSetup}
                  disabled={setupLoading || !setupPath.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Repo picker (global mode, after setup) */}
          {isRepoMode && !needsSetup && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Repository</label>

              {/* Selected repo display / trigger */}
              <button
                onClick={() => setPickerOpen(!pickerOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-sm transition-colors"
              >
                {selectedRepo ? (
                  <div className="text-left min-w-0">
                    <span className="text-zinc-200 font-medium">{selectedRepoName}</span>
                    <p className="text-[11px] text-zinc-600 font-[family-name:var(--font-geist-mono)] truncate">
                      {selectedRepo}
                    </p>
                  </div>
                ) : (
                  <span className="text-zinc-600">Select a repository...</span>
                )}
                <svg
                  className={`w-4 h-4 text-zinc-500 shrink-0 ml-2 transition-transform ${pickerOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {/* Dropdown */}
              {pickerOpen && (
                <div className="mt-1.5 rounded-lg border border-zinc-800 bg-[#0a0a10] shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-zinc-800/50">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Filter repos..."
                      value={repoFilter}
                      onChange={(e) => setRepoFilter(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-zinc-800/30">
                    {reposLoading && (
                      <div className="px-3 py-4 text-sm text-zinc-600 text-center">Scanning for repos...</div>
                    )}
                    {!reposLoading && filteredRepos.length === 0 && (
                      <div className="px-3 py-4 text-sm text-zinc-600 text-center">No matching repos</div>
                    )}
                    {filteredRepos.map((repo) => (
                      <button
                        key={repo.path}
                        onClick={() => {
                          setSelectedRepo(repo.path);
                          setSelectedRepoName(repo.name);
                          if (terminalConfig?.terminalUseTmux && terminalConfig.terminalTmuxMode === "choose" && !selectedTmuxSession) {
                            setSelectedTmuxSession(repo.name);
                          }
                          setPickerOpen(false);
                          setRepoFilter("");
                          setTimeout(() => branchRef.current?.focus(), 50);
                        }}
                        className={`w-full text-left px-3 py-2 transition-colors hover:bg-zinc-800/50 ${
                          selectedRepo === repo.path ? "bg-blue-500/10" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-200">{repo.name}</span>
                        </div>
                        <p className="text-[11px] text-zinc-600 font-[family-name:var(--font-geist-mono)] mt-0.5 truncate">
                          {repo.path}
                        </p>
                      </button>
                    ))}
                  </div>
                  {/* Add another directory */}
                  <div className="border-t border-zinc-800/50 p-2 flex gap-1.5">
                    <button
                      onClick={() => {
                        setPickerOpen(false);
                        handleBrowse();
                      }}
                      className="flex-1 text-left px-2.5 py-1.5 rounded-md text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                    >
                      + Browse for another folder...
                    </button>
                    <button
                      onClick={() => {
                        setPickerOpen(false);
                        setNeedsSetup(true);
                      }}
                      className="px-2.5 py-1.5 rounded-md text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50 transition-colors"
                    >
                      Type path
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Branch name */}
          {!needsSetup && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Branch name <span className="text-zinc-600">(optional — creates a worktree)</span>
              </label>
              <input
                ref={branchRef}
                type="text"
                placeholder="e.g. HQ-1234"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors font-[family-name:var(--font-geist-mono)]"
              />
            </div>
          )}

          {/* Base branch (only shown when creating a worktree) */}
          {!needsSetup && branchName.trim() && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Base branch
              </label>
              <input
                type="text"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors font-[family-name:var(--font-geist-mono)]"
              />
            </div>
          )}

          {/* Initial prompt */}
          {!needsSetup && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Initial prompt <span className="text-zinc-600">(optional)</span>
              </label>
              <textarea
                rows={6}
                placeholder="e.g. Fix the login timeout bug"
                value={prompt ?? ""}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleCreate(); }}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-y min-h-[8rem]"
              />
            </div>
          )}

          {/* Tmux session picker (shown when tmux enabled + "choose" mode) */}
          {!needsSetup && terminalConfig?.terminalUseTmux && terminalConfig.terminalTmuxMode === "choose" && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Tmux session
              </label>
              {/* Existing sessions as clickable options */}
              {!tmuxSessionsLoading && tmuxSessions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tmuxSessions.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => setSelectedTmuxSession(s.name)}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                        selectedTmuxSession === s.name
                          ? "bg-blue-500/20 border-blue-500/40 text-blue-300 border"
                          : "bg-white/[0.04] border border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:border-white/[0.15]"
                      }`}
                    >
                      {s.name}
                      <span className="text-zinc-600 ml-1">
                        {s.windows}w{s.attached ? " attached" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {/* Text input for custom/new session name */}
              <input
                type="text"
                placeholder={repoName || selectedRepoName || "session name"}
                value={selectedTmuxSession}
                onChange={(e) => setSelectedTmuxSession(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors font-[family-name:var(--font-geist-mono)]"
              />
              <p className="text-[11px] text-zinc-600 mt-1">
                Pick an existing session above or type a name. Leave empty to use project name.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {!needsSetup && (
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || (isRepoMode && !selectedRepo)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Creating...
                  </span>
                ) : branchName ? (
                  "Create Worktree & Launch"
                ) : (
                  "Launch Claude"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
