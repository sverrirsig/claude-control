export type { CreateSessionPublicOpts as CreateSessionOpts } from "./adapters";
export {
  createSession,
  focusSession,
  listTmuxSessions,
  sendKeystroke,
  sendText,
} from "./adapters";
export {
  buildProcessTree,
  detectAllTmuxPanes,
  detectTerminal,
  detectTmuxClients,
  evictStaleTerminalCache,
  findClaudePidsFromTree,
  findTerminalInTree,
  getTerminalAppName,
  getTmuxPathSync,
  getTtyForPid,
  getTtysForPids,
  matchTerminal,
} from "./detect";
export type {
  ProcessTreeEntry,
  TerminalApp,
  TerminalInfo,
  TerminalOpenIn,
  TmuxClientInfo,
  TmuxPaneInfo,
} from "./types";
