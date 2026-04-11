import { execFile } from "child_process";
import { NextResponse } from "next/server";
import { promisify } from "util";
import {
  AppConfig,
  BROWSER_OPTIONS,
  EDITOR_OPTIONS,
  GIT_GUI_OPTIONS,
  loadConfig,
  saveConfig,
  TERMINAL_APP_OPTIONS,
  TERMINAL_OPEN_IN_OPTIONS,
  TERMINAL_TMUX_MODE_OPTIONS,
} from "@/lib/config";
import { getShellEnv } from "@/lib/shell-env";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

async function checkInstalledApps<T extends { appName: string; command?: string }>(
  options: T[],
  alwaysInstalled?: Set<string>,
): Promise<(T & { installed: boolean })[]> {
  const env = await getShellEnv();
  return Promise.all(
    options.map(async (opt) => {
      if (!opt.appName || alwaysInstalled?.has(opt.appName)) return { ...opt, installed: true };
      // Try macOS app bundle first, then CLI command as fallback
      const checks = [
        execFileAsync("open", ["-Ra", opt.appName], { timeout: 3000 }).then(
          () => true,
          () => false,
        ),
      ];
      if (opt.command) {
        checks.push(
          execFileAsync("which", [opt.command], { timeout: 3000, env }).then(
            () => true,
            () => false,
          ),
        );
      }
      const results = await Promise.all(checks);
      return { ...opt, installed: results.some(Boolean) };
    }),
  );
}

interface DependencyDef {
  id: string;
  label: string;
  description: string;
  command: string;
  url: string;
}

const DEPENDENCIES: DependencyDef[] = [
  {
    id: "gh",
    label: "GitHub CLI",
    description: "Pull request detection and status checks",
    command: "gh",
    url: "https://cli.github.com",
  },
  {
    id: "claude",
    label: "Claude Code",
    description: "The whole reason this app exists",
    command: "claude",
    url: "https://docs.anthropic.com/en/docs/claude-code",
  },
  {
    id: "tmux",
    label: "tmux",
    description: "Background terminal sessions and send-keys support",
    command: "tmux",
    url: "https://github.com/tmux/tmux",
  },
];

async function checkDependencies(): Promise<(DependencyDef & { installed: boolean })[]> {
  const env = await getShellEnv();
  return Promise.all(
    DEPENDENCIES.map(async (dep) => {
      try {
        await execFileAsync("which", [dep.command], { timeout: 3000, env });
        return { ...dep, installed: true };
      } catch {
        return { ...dep, installed: false };
      }
    }),
  );
}

export async function GET() {
  try {
    const [config, terminalApps, browsers, editors, gitGuis, dependencies] = await Promise.all([
      loadConfig(),
      checkInstalledApps(TERMINAL_APP_OPTIONS, new Set(["Terminal"])),
      checkInstalledApps(BROWSER_OPTIONS, new Set(["Safari"])),
      checkInstalledApps(EDITOR_OPTIONS),
      checkInstalledApps(GIT_GUI_OPTIONS),
      checkDependencies(),
    ]);

    return NextResponse.json({
      config,
      options: {
        editors,
        gitGuis,
        browsers,
        terminalApps,
        terminalOpenIn: TERMINAL_OPEN_IN_OPTIONS,
        terminalTmuxModes: TERMINAL_TMUX_MODE_OPTIONS,
      },
      dependencies,
    });
  } catch (error) {
    console.error("Failed to load settings:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const current = await loadConfig();

    const updated: AppConfig = {
      codeDirectories: body.codeDirectories ?? current.codeDirectories,
      editor: body.editor ?? current.editor,
      gitGui: body.gitGui ?? current.gitGui,
      browser: body.browser ?? current.browser,
      notifications: body.notifications ?? current.notifications,
      notificationSound: body.notificationSound ?? current.notificationSound,
      alwaysNotify: body.alwaysNotify ?? current.alwaysNotify,
      terminalApp: body.terminalApp ?? current.terminalApp,
      terminalOpenIn: body.terminalOpenIn ?? current.terminalOpenIn,
      terminalUseTmux: body.terminalUseTmux ?? current.terminalUseTmux,
      terminalTmuxMode: body.terminalTmuxMode ?? current.terminalTmuxMode,
      initialCommand: body.initialCommand !== undefined ? body.initialCommand : current.initialCommand,
      initialPrompt: body.initialPrompt !== undefined ? body.initialPrompt : current.initialPrompt,
      createPrPrompt: body.createPrPrompt !== undefined ? body.createPrPrompt : current.createPrPrompt,
      defaultBaseBranch: body.defaultBaseBranch ?? current.defaultBaseBranch,
      showKeyboardHints: body.showKeyboardHints !== undefined ? body.showKeyboardHints : current.showKeyboardHints,
    };

    await saveConfig(updated);
    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
