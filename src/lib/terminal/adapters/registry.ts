import type { TerminalApp } from "../types";
import { alacrittyAdapter } from "./alacritty";
import { cmuxAdapter } from "./cmux";
import { ghosttyAdapter } from "./ghostty";
import { itermAdapter } from "./iterm";
import { kittyAdapter } from "./kitty";
import { terminalAppAdapter } from "./terminal-app";
import type { TerminalAdapter } from "./types";
import { warpAdapter } from "./warp";
import { weztermAdapter } from "./wezterm";

const adapters: Partial<Record<TerminalApp, TerminalAdapter>> = {
  iterm: itermAdapter,
  "terminal-app": terminalAppAdapter,
  ghostty: ghosttyAdapter,
  kitty: kittyAdapter,
  wezterm: weztermAdapter,
  alacritty: alacrittyAdapter,
  warp: warpAdapter,
  cmux: cmuxAdapter,
};

export function getAdapter(app: TerminalApp): TerminalAdapter | null {
  return adapters[app] ?? null;
}

/** Register a new terminal adapter at runtime. */
export function registerAdapter(app: TerminalApp, adapter: TerminalAdapter): void {
  adapters[app] = adapter;
}
