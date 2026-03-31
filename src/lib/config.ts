import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { TerminalApp, TerminalOpenIn } from "./terminal/types";

const CONFIG_DIR = join(homedir(), ".claude-control");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface AppConfig {
  codeDirectories: string[];
  editor: string;
  gitGui: string;
  browser: string;
  notifications: boolean;
  notificationSound: boolean;
  alwaysNotify: boolean;
  terminalApp: TerminalApp;
  terminalOpenIn: TerminalOpenIn;
  terminalUseTmux: boolean;
  terminalTmuxMode: "per-project" | "choose";
  initialPrompt: string;
  createPrPrompt: string;
  defaultBaseBranch: string;
  showKeyboardHints: boolean;
}

export const DEFAULT_INITIAL_PROMPT =
  "Implement the feature or fix referenced in the branch name. Think step-by-step: first understand the codebase and requirements, then plan your approach, then implement with tests.";

export const DEFAULT_CREATE_PR_PROMPT =
  "Please commit all your changes with a descriptive commit message, push the branch to origin, and create a pull request. Include a clear title and description of what changed and why.";

export const EDITOR_OPTIONS = [
  { id: "none", label: "None", command: "", appName: "", processName: "" },
  { id: "vscode", label: "VS Code", command: "code", appName: "Visual Studio Code", processName: "Code" },
  { id: "cursor", label: "Cursor", command: "cursor", appName: "Cursor", processName: "Cursor" },
  { id: "zed", label: "Zed", command: "zed", appName: "Zed", processName: "Zed" },
  { id: "sublime", label: "Sublime Text", command: "subl", appName: "Sublime Text", processName: "Sublime Text" },
  { id: "webstorm", label: "WebStorm", command: "webstorm", appName: "WebStorm", processName: "WebStorm" },
  { id: "intellij", label: "IntelliJ IDEA", command: "idea", appName: "IntelliJ IDEA", processName: "IntelliJ IDEA" },
];

export const GIT_GUI_OPTIONS = [
  { id: "none", label: "None", appName: "" },
  { id: "fork", label: "Fork", appName: "Fork" },
  { id: "sublime-merge", label: "Sublime Merge", appName: "Sublime Merge" },
  { id: "gitkraken", label: "GitKraken", appName: "GitKraken" },
  { id: "tower", label: "Tower", appName: "Tower" },
  { id: "sourcetree", label: "Sourcetree", appName: "Sourcetree" },
];

export const BROWSER_OPTIONS = [
  { id: "safari", label: "Safari", appName: "Safari" },
  { id: "chrome", label: "Google Chrome", appName: "Google Chrome" },
  { id: "arc", label: "Arc", appName: "Arc" },
  { id: "firefox", label: "Firefox", appName: "Firefox" },
  { id: "brave", label: "Brave", appName: "Brave Browser" },
  { id: "edge", label: "Microsoft Edge", appName: "Microsoft Edge" },
];

export const TERMINAL_APP_OPTIONS = [
  { id: "inline", label: "Inline", appName: "" },
  { id: "terminal-app", label: "Terminal", appName: "Terminal" },
  { id: "iterm", label: "iTerm2", appName: "iTerm" },
  { id: "ghostty", label: "Ghostty", appName: "Ghostty" },
  { id: "kitty", label: "kitty", appName: "kitty" },
  { id: "wezterm", label: "WezTerm", appName: "WezTerm" },
  { id: "alacritty", label: "Alacritty", appName: "Alacritty" },
  { id: "warp", label: "Warp", appName: "Warp" },
];

export const TERMINAL_OPEN_IN_OPTIONS = [
  { id: "tab", label: "New tab" },
  { id: "window", label: "New window" },
];

export const TERMINAL_TMUX_MODE_OPTIONS = [
  { id: "per-project", label: "Session per project" },
  { id: "choose", label: "Choose when creating" },
];

const DEFAULT_CONFIG: AppConfig = {
  codeDirectories: [],
  editor: "vscode",
  gitGui: "fork",
  browser: "chrome",
  notifications: true,
  notificationSound: true,
  alwaysNotify: false,
  terminalApp: "terminal-app",
  terminalOpenIn: "tab",
  terminalUseTmux: false,
  terminalTmuxMode: "per-project",
  initialPrompt: DEFAULT_INITIAL_PROMPT,
  createPrPrompt: DEFAULT_CREATE_PR_PROMPT,
  defaultBaseBranch: "main",
  showKeyboardHints: true,
};

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}
