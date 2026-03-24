import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { getAdapter } from "@/lib/terminal/adapters/registry";
import type { TerminalApp } from "@/lib/terminal/types";

export async function POST(request: Request) {
  try {
    const { tmuxSession, cwd } = (await request.json()) as { tmuxSession: string; cwd: string };

    if (!tmuxSession || typeof tmuxSession !== "string") {
      return NextResponse.json({ error: "Missing or invalid tmuxSession" }, { status: 400 });
    }

    const config = await loadConfig();
    const terminalApp = config.terminalApp as TerminalApp;

    const adapter = getAdapter(terminalApp);
    if (!adapter) {
      return NextResponse.json({ error: `No adapter for terminal: ${terminalApp}` }, { status: 400 });
    }

    // Open a new terminal tab that attaches to the detached tmux session
    await adapter.createSession(`tmux attach -t '${tmuxSession}'`, {
      openIn: config.terminalOpenIn ?? "tab",
      useTmux: false,
      cwd: cwd || "/tmp",
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
