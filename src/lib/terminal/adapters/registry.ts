import type { TerminalApp } from "../types";
import type { TerminalAdapter } from "./types";
import { itermAdapter } from "./iterm";
import { terminalAppAdapter } from "./terminal-app";
import { ghosttyAdapter } from "./ghostty";
import { kittyAdapter } from "./kitty";
import { weztermAdapter } from "./wezterm";
import { alacrittyAdapter } from "./alacritty";
import { warpAdapter } from "./warp";

const adapters: Partial<Record<TerminalApp, TerminalAdapter>> = {
  iterm: itermAdapter,
  "terminal-app": terminalAppAdapter,
  ghostty: ghosttyAdapter,
  kitty: kittyAdapter,
  wezterm: weztermAdapter,
  alacritty: alacrittyAdapter,
  warp: warpAdapter,
};

export function getAdapter(app: TerminalApp): TerminalAdapter {
  const adapter = adapters[app];
  if (!adapter) {
    throw new Error(`No adapter for terminal: ${app}`);
  }
  return adapter;
}

/** Register a new terminal adapter at runtime. */
export function registerAdapter(app: TerminalApp, adapter: TerminalAdapter): void {
  adapters[app] = adapter;
}
