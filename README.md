<p align="center">
  <img src="public/icon.png" alt="Claude Control" width="128" height="128">
</p>

<h1 align="center">Claude Control</h1>

<p align="center">
  A native macOS desktop app for monitoring and managing multiple <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a> sessions in real time.
</p>

When you're running several Claude Code instances across different repos and worktrees, it's hard to keep track of what each one is doing. Claude Control auto-discovers all running sessions and gives you a single dashboard with live status, git changes, conversation previews, and quick actions — without leaving the app.

![Dashboard](docs/screenshot.png)

## Features

- **Auto-discovery** — Detects all running `claude` CLI processes via the process table, uses hook events for authoritative PID-to-JSONL mapping with mtime-based fallback; optionally reads from a macOS process bridge file for use when running containerized
- **Token usage** — Shows per-model input, output, and cache token counts on each session card
- **Live status** — Classifies each session as Working, Idle, Waiting (needs input), Errored, or Finished using real-time hook events from Claude Code, with CPU/JSONL heuristic fallback
- **Git integration** — Shows branch name, changed files, additions/deletions, and detects open pull requests via `gh`
- **PR status badges** — Live CI check rollup (passing/failing/pending), review decision, unresolved threads, merge conflicts, and merged/closed state
- **Task context** — Extracts Linear issue titles and descriptions from MCP tool results to show what each session is working on
- **Conversation preview** — Status-aware preview on each card: working sessions show the active prompt prominently; idle sessions show the completion summary with bullet-point formatting; waiting sessions show the assistant's question
- **Approve/reject from dashboard** — Approve or reject tool-use permission prompts directly from the dashboard without switching to the terminal
- **Keyboard shortcuts** — Number keys (1-9) to select sessions, Tab/Shift+Tab to cycle, A/X to approve/reject, Enter to focus terminal, E/G/F/P for editor/git/finder/PR
- **Desktop notifications** — Native macOS notifications when sessions finish working or need attention (configurable)
- **Notification sounds** — Subtle two-tone chime on status transitions (configurable)
- **Action bridge** — Optional HTTP companion server (`npm run bridge:start`) proxies desktop actions (focus, editor, Finder, git GUI, URL) from a Docker container to the host Mac via `host.docker.internal`
- **Quick actions** — One-click buttons to focus the terminal tab, open your editor, git GUI, Finder, or PR link for any session
- **Multiple terminal support** — Works with iTerm2, Terminal.app, Ghostty, kitty, WezTerm, and Alacritty
- **tmux integration** — Run sessions inside tmux with per-project session grouping or manual session selection; approve/reject without terminal focus via `send-keys`
- **Configurable tools** — Choose your preferred terminal, code editor (VS Code, Cursor, Zed, etc.), git GUI (Fork, Sublime Merge, etc.), and browser (Chrome, Arc, Safari, etc.)
- **New session creation** — Create new Claude Code sessions with git worktree support, repo browsing, and custom initial prompts
- **PR workflow** — Send `/create-pr` to idle sessions and see PR links once created
- **Worktree cleanup** — Remove worktrees, branches, and kill sessions with a two-step confirmation flow
- **Multi-monitor support** — Target which display apps open on

## Requirements

- **macOS** (uses AppleScript for terminal integration, native folder picker, etc.)
- **Node.js** >= 18 (LTS 24 recommended — see `.node-version`)
- [**Claude Code CLI**](https://docs.anthropic.com/en/docs/claude-code) installed and running
- A supported terminal: [iTerm2](https://iterm2.com/) (default), Terminal.app, [Ghostty](https://ghostty.org/), [kitty](https://sw.kovidgoyal.net/kitty/), [WezTerm](https://wezfurlong.org/wezterm/), or [Alacritty](https://alacritty.org/)
- [**tmux**](https://github.com/tmux/tmux) for tmux integration (optional)
- [**GitHub CLI**](https://cli.github.com/) (`gh`) for PR detection (optional)

A `.node-version` file is included for version managers like [fnm](https://github.com/Schniz/fnm) and [nvm](https://github.com/nvm-sh/nvm). With auto-switching enabled, both will pick up the correct version when you `cd` into the project. Otherwise, run `fnm use` or `nvm use`.

## Install from DMG

Download the latest `.dmg` from the [Releases](../../releases) page, open it, and drag the app to Applications. Both Apple Silicon and Intel builds are available.

## Build from source

```bash
# Clone the repo
git clone https://github.com/sverrirsig/claude-control.git
cd claude-control

# Install dependencies
npm install

# Run in development mode (hot-reload)
npm run electron:dev

# Or build a distributable DMG
npm run electron:build
```

The development server runs on port 2875 (mnemonic: CTRL on a phone keypad). The Electron shell loads it automatically.

### Scripts

| Command | Description |
|---|---|
| `npm run electron:dev` | Dev mode with hot-reload (Next.js + Electron) |
| `npm run electron:build` | Production build → DMG + ZIP in `dist/` |
| `npm run electron:pack` | Production build → unpacked app in `dist/` |
| `npm run dev` | Next.js dev server only (no Electron shell) |
| `npm run build` | Next.js production build only |
| `npm run test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run bridge:start` | Start the macOS process bridge (background) |
| `npm run bridge:stop` | Stop the process bridge |
| `npm run bridge:restart` | Restart the process bridge |
| `npm run bridge:status` | Show bridge status and last write age |

## Running in Docker

The app can run as a containerized web server. This is useful for accessing the dashboard from any browser on the same machine, or for running headlessly without Electron.

```bash
# Build and start
docker compose up -d

# Dashboard is available at:
open http://localhost:2875
```

The container mounts `~/.claude` (read-only) and `~/.claude-control` (read-write). Because Docker on macOS cannot see host processes directly, you must run the process bridge natively so the container can discover Claude sessions:

```bash
npm run bridge:start
```

The bridge polls the macOS process table every second and writes `~/.claude-control/processes.json`. The container reads this file (freshness-checked) and falls back to its own process scan if the file is absent or stale.

Enable the process bridge in settings or directly in `~/.claude-control/config.json`:

```json
{
  "processBridge": {
    "enabled": true,
    "intervalMs": 1000,
    "maxAgeMs": 5000
  }
}
```

### Action bridge (Docker)

When running in Docker, desktop actions (open terminal, editor, Finder, git GUI, browser URLs) cannot execute macOS commands directly. The same `bridge.js` daemon also serves an HTTP action proxy on port 27184.

Enable it in settings or in `~/.claude-control/config.json`:

```json
{
  "actionBridge": {
    "enabled": true,
    "port": 27184
  }
}
```

With both bridges enabled the dashboard inside Docker has full feature parity with the native Electron app — session discovery, status, and all quick actions work transparently.

The `docker-compose.yml` injects `HOST_HOME` from the host shell so that session paths (stored internally as `/root/...`) are reverse-mapped back to the host path (e.g. `/Users/name/...`) before being sent to the bridge. This is required for Finder and Editor actions to locate the correct directory on macOS.

When the action bridge is enabled, the Settings page dependency and installed-app checks are also proxied through the bridge so they reflect what is actually installed on the host rather than inside the container.

## How it works

### Session discovery

1. Finds all processes named `claude` via `ps`
2. Filters out Claude Desktop (only CLI instances)
3. Gets each process's working directory via `lsof`
4. Reads hook event files (`~/.claude-control/events/<pid>.json`) for authoritative PID→JSONL mapping and session status
5. Falls back to mtime-based JSONL discovery for sessions without hook events
6. Reads the tail of each JSONL file to extract conversation preview and task context

Hook events are installed automatically into `~/.claude/settings.json` on first launch. Each Claude process writes its status, session ID, and transcript path to a `<pid>.json` file on every lifecycle event.

The hook script uses `$HOME` to locate the events directory at runtime, so it works correctly whether the dashboard runs natively on macOS or inside Docker (where the app's home is `/root` but the hooks execute on the host with a different home path).

### Status classification

**Primary (hook events):**

| Status | Hook Event |
|---|---|
| **Working** | `UserPromptSubmit`, `SubagentStart`, `PostToolUseFailure` |
| **Waiting** | `PermissionRequest` (overridden to Working if CPU > 15%) |
| **Idle** | `SessionStart`, `Stop` |
| **Finished** | `SessionEnd` |

**Fallback (heuristic, when hooks unavailable):**

| Status | Condition |
|---|---|
| **Working** | JSONL modified recently AND CPU > 5%, or CPU > 15% |
| **Waiting** | Pending tool use (after 3s settle) or asking for user input |
| **Idle** | Process alive, low activity |
| **Errored** | Last message contains error indicators |
| **Finished** | Process no longer running |

### Architecture

```
Electron shell (macOS native window)  |  Docker container
    ↓                                  |      ↓
Browser (SSE connection to /api/sessions/stream)
    ↓
Next.js API Routes (standalone server, port 2875)
    ↓
┌──────────────────────────────────────────────────────┐
│  discovery.ts  →  process-utils.ts                   │  ps, lsof (native)
│                →  process-bridge.ts                  │  ~/.claude-control/processes.json (Docker)
│                →  hooks-reader.ts                    │  <pid>.json → status + transcript
│                →  paths.ts                           │  normalizeHostPath() + toHostPath() for Docker path remapping
│                →  session-reader.ts                  │  JSONL parsing, token usage
│                →  git-info.ts                        │  git status, diff, PR detection
│                →  status-classifier.ts               │  Heuristic fallback
└──────────────────────────────────────────────────────┘
        ↑
macOS process bridge (scripts/bridge.js)
  polls ps/lsof → writes ~/.claude-control/processes.json
```

No database — all state is derived from the process table, hook event files, and JSONL transcripts on every poll cycle.

#### Real-time streaming

The dashboard and session detail view use Server-Sent Events (SSE) rather than client-side polling. The server polls discovery every second and pushes updates over a persistent HTTP connection. This eliminates the client round-trip delay and keeps the UI in sync as JSONL transcripts are written.

- `GET /api/sessions/stream` — streams `event: sessions` frames with the full session list
- `GET /api/sessions/:id/stream` — streams `event: session` frames with full session detail

Both endpoints send a 2 KB padding comment on connect to flush Node.js's internal write buffer immediately, and set `Cache-Control: no-cache, no-transform` plus `X-Accel-Buffering: no` to prevent proxy and CDN buffering.

### Token usage

For each session that has a JSONL transcript, the app scans all assistant messages and aggregates token counts by model. The session card footer shows:

- Model name (e.g. `sonnet-4-6`)
- Input tokens (↑), output tokens (↓)
- Combined cache tokens (⚡) when non-zero

## First-time setup

On first launch, the app will ask you to select your code directory (the parent folder containing your git repos, e.g. `~/Code`). This is stored in `~/.claude-control/config.json` and used for the repo picker when creating new sessions.

You can add multiple code directories. The app scans up to two levels deep for git repositories.

## Project structure

```
├── electron/
│   └── main.js                  # Electron main process
├── scripts/
│   ├── bridge.js                # macOS process bridge (polls ps/lsof, writes processes.json)
│   ├── bridge-ctl.sh            # start/stop/restart/status for the bridge daemon
│   ├── prepare-build.js         # Assembles standalone Next.js app
│   └── after-pack.js            # Copies into Electron resources
├── src/
│   ├── app/
│   │   ├── page.tsx             # Dashboard
│   │   ├── session/[id]/        # Session detail view
│   │   ├── settings/            # Settings page
│   │   └── api/                 # API routes (sessions, sessions/stream, actions, repos, PR status)
│   ├── components/              # React components
│   ├── hooks/                   # SSE hooks, keyboard shortcuts, notifications
│   └── lib/                     # Core logic (discovery, git, JSONL parsing)
│       ├── process-bridge.ts    # Reads ~/.claude-control/processes.json (Docker bridge)
│       └── paths.ts             # Path helpers including normalizeHostPath()
├── Dockerfile                   # Multi-stage build (node:24-alpine, standalone output)
├── docker-compose.yml           # Mounts ~/.claude and ~/.claude-control
└── public/
    └── icon.png
```

## Test coverage

| Package | Statements | Branches | Functions | Tests |
|---|---|---|---|---|
| `src/components` | 60.7% | 58.7% | 38.5% | 31 |
| `src/lib` | 93.5% | 86.6% | 97.5% | 159 |
| `src/lib/terminal` | 29.8% | 26.9% | 25.0% | (see note) |

`lib/terminal/detect.ts` coverage is low because it exercises OS-level process tree construction (`ps`, `lsof`) and AppleScript-based terminal focus that requires live macOS processes — unit tests for this module are not practical without spawning real subprocesses.

`src/components` coverage excludes `TaskSummaryView` edit/expand interactions and the token usage footer, which require controlled UI state that is impractical to drive without a full browser renderer.

## Tech stack

- **Electron** — Native macOS window with hidden title bar
- **Next.js 14** (App Router, standalone output) — Serves both API and UI from a single process
- **TypeScript** (strict)
- **Tailwind CSS 3** — Dark theme
- **SWR** — Used for PR status and settings; session data uses native `EventSource` (SSE) instead of polling

## Contributing

PRs welcome! To get started, clone the repo and run `npm run electron:dev` — that's it.

Some areas that could use work:
- Linux/Windows support (currently macOS-only due to AppleScript usage)
- Session history and cost/token tracking
- See [IDEAS.md](IDEAS.md) for more feature ideas

## License

MIT
