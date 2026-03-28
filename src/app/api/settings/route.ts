import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  loadConfig,
  saveConfig,
  AppConfig,
  EDITOR_OPTIONS,
  GIT_GUI_OPTIONS,
  BROWSER_OPTIONS,
  TERMINAL_APP_OPTIONS,
  TERMINAL_OPEN_IN_OPTIONS,
  TERMINAL_TMUX_MODE_OPTIONS,
} from "@/lib/config";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

interface DependencyDef {
  id: string;
  label: string;
  description: string;
  command: string;
  url: string;
}

const DEPENDENCIES: DependencyDef[] = [
  { id: "gh", label: "GitHub CLI", description: "Pull request detection and status checks", command: "gh", url: "https://cli.github.com" },
  { id: "claude", label: "Claude Code", description: "The whole reason this app exists", command: "claude", url: "https://docs.anthropic.com/en/docs/claude-code" },
  { id: "tmux", label: "tmux", description: "Background terminal sessions and send-keys support", command: "tmux", url: "https://github.com/tmux/tmux" },
];

interface BridgeCheckResult {
  commands: Record<string, boolean>;
  apps: Record<string, boolean>;
}

/**
 * Ask the macOS bridge companion to run which/open checks on the host.
 * Returns null if the bridge is unreachable or not configured.
 */
async function checkViaBridge(
  port: number,
  commands: string[],
  apps: string[],
): Promise<BridgeCheckResult | null> {
  try {
    const res = await fetch(`http://host.docker.internal:${port}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands, apps }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json() as BridgeCheckResult;
  } catch {
    return null;
  }
}

async function checkInstalledApps<T extends { appName: string; command?: string }>(
  options: T[],
  alwaysInstalled?: Set<string>,
  bridgeApps?: Record<string, boolean>,
): Promise<(T & { installed: boolean })[]> {
  return Promise.all(
    options.map(async (opt) => {
      if (!opt.appName || alwaysInstalled?.has(opt.appName)) return { ...opt, installed: true };

      // Use bridge result when available
      if (bridgeApps) {
        const bridgeResult = bridgeApps[opt.appName] ?? (opt.command ? bridgeApps[opt.command] : undefined);
        if (bridgeResult !== undefined) return { ...opt, installed: bridgeResult };
      }

      // Try macOS app bundle first, then CLI command as fallback
      const checks = [
        execFileAsync("open", ["-Ra", opt.appName], { timeout: 3000 }).then(() => true, () => false),
      ];
      if (opt.command) {
        checks.push(
          execFileAsync("which", [opt.command], { timeout: 3000 }).then(() => true, () => false),
        );
      }
      const results = await Promise.all(checks);
      return { ...opt, installed: results.some(Boolean) };
    })
  );
}

async function checkDependencies(
  bridgeCommands?: Record<string, boolean>,
): Promise<(DependencyDef & { installed: boolean })[]> {
  return Promise.all(
    DEPENDENCIES.map(async (dep) => {
      if (bridgeCommands && dep.command in bridgeCommands) {
        return { ...dep, installed: bridgeCommands[dep.command] };
      }
      try {
        await execFileAsync("which", [dep.command], { timeout: 3000 });
        return { ...dep, installed: true };
      } catch {
        return { ...dep, installed: false };
      }
    })
  );
}

export async function GET() {
  try {
    const config = await loadConfig();

    // When the action bridge is enabled, proxy all installation checks to the
    // macOS host so the settings page reflects what's actually installed there,
    // not what's in the container.
    let bridge: BridgeCheckResult | null = null;
    if (config.actionBridge?.enabled) {
      const port = config.actionBridge.port ?? 27184;
      const allCommands = [
        ...DEPENDENCIES.map((d) => d.command),
        ...EDITOR_OPTIONS.filter((e) => e.command).map((e) => e.command),
      ];
      const allApps = [
        ...TERMINAL_APP_OPTIONS.map((t) => t.appName),
        ...BROWSER_OPTIONS.map((b) => b.appName),
        ...EDITOR_OPTIONS.filter((e) => e.appName).map((e) => e.appName),
        ...GIT_GUI_OPTIONS.filter((g) => g.appName).map((g) => g.appName),
      ].filter(Boolean);
      bridge = await checkViaBridge(port, allCommands, allApps);
    }

    const [terminalApps, browsers, editors, gitGuis, dependencies] = await Promise.all([
      checkInstalledApps(TERMINAL_APP_OPTIONS, new Set(["Terminal"]), bridge?.apps),
      checkInstalledApps(BROWSER_OPTIONS, new Set(["Safari"]), bridge?.apps),
      checkInstalledApps(EDITOR_OPTIONS, undefined, bridge?.apps),
      checkInstalledApps(GIT_GUI_OPTIONS, undefined, bridge?.apps),
      checkDependencies(bridge?.commands),
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
      initialPrompt: body.initialPrompt !== undefined ? body.initialPrompt : current.initialPrompt,
      createPrPrompt: body.createPrPrompt !== undefined ? body.createPrPrompt : current.createPrPrompt,
      defaultBaseBranch: body.defaultBaseBranch ?? current.defaultBaseBranch,
      showKeyboardHints: body.showKeyboardHints !== undefined ? body.showKeyboardHints : current.showKeyboardHints,
      processBridge: body.processBridge !== undefined ? body.processBridge : current.processBridge,
      actionBridge: body.actionBridge !== undefined ? body.actionBridge : current.actionBridge,
    };

    await saveConfig(updated);
    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
