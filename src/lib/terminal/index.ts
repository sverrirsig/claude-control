export type {
  TerminalApp,
  TerminalOpenIn,
  TerminalInfo,
  TmuxPaneInfo,
  TmuxClientInfo,
  ProcessTreeEntry,
} from "./types";

export {
  buildProcessTree,
  findClaudePidsFromTree,
  getTtyForPid,
  getTtysForPids,
  detectAllTmuxPanes,
  detectTmuxClients,
  detectTerminal,
  findTerminalInTree,
  matchTerminal,
  evictStaleTerminalCache,
  getTerminalAppName,
} from "./detect";

export {
  focusSession,
  sendText,
  sendKeystroke,
  createSession,
  listTmuxSessions,
} from "./adapters";
export type { CreateSessionOpts } from "./adapters";
