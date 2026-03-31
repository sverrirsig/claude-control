import type { TerminalEntry } from "./types";

interface TerminalStoreState {
  terminals: Map<string, TerminalEntry>;
  activeDir: string | null;
  minimized: boolean;
  height: number;
}

const store: TerminalStoreState = {
  terminals: new Map(),
  activeDir: null,
  minimized: false,
  height: 400,
};

export function getTerminalStore(): TerminalStoreState {
  return store;
}

export function setTerminalStore(state: Partial<TerminalStoreState>): void {
  if (state.terminals !== undefined) store.terminals = state.terminals;
  if (state.activeDir !== undefined) store.activeDir = state.activeDir;
  if (state.minimized !== undefined) store.minimized = state.minimized;
  if (state.height !== undefined) store.height = state.height;
}
