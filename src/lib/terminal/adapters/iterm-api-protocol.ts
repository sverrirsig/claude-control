import { parse, type Type } from "protobufjs";

// Field numbers must stay compatible with iTerm2's proto2 API:
// https://github.com/gnachman/iTerm2/blob/master/proto/api.proto
const protocolRoot = parse(String.raw`
  syntax = "proto2";
  package iterm2;

  message ClientOriginatedMessage {
    optional int64 id = 1;
    oneof submessage {
      ListSessionsRequest list_sessions_request = 106;
      ActivateRequest activate_request = 114;
      VariableRequest variable_request = 115;
    }
  }

  message ServerOriginatedMessage {
    optional int64 id = 1;
    oneof submessage {
      string error = 2;
      ListSessionsResponse list_sessions_response = 106;
      ActivateResponse activate_response = 114;
      VariableResponse variable_response = 115;
    }
  }

  message ListSessionsRequest {}

  message SessionSummary {
    optional string unique_identifier = 1;
  }

  message SplitTreeNode {
    repeated SplitTreeLink links = 2;

    message SplitTreeLink {
      oneof child {
        SessionSummary session = 1;
        SplitTreeNode node = 2;
      }
    }
  }

  message ListSessionsResponse {
    message Window {
      repeated Tab tabs = 1;
    }

    message Tab {
      optional SplitTreeNode root = 3;
      repeated SessionSummary minimized_sessions = 6;
    }

    repeated Window windows = 1;
    repeated SessionSummary buried_sessions = 2;
  }

  message VariableRequest {
    optional string session_id = 1;
    repeated string get = 3;
  }

  message VariableResponse {
    enum Status {
      OK = 0;
      SESSION_NOT_FOUND = 1;
      INVALID_NAME = 2;
      MISSING_SCOPE = 3;
      TAB_NOT_FOUND = 4;
      MULTI_GET_DISALLOWED = 5;
      WINDOW_NOT_FOUND = 6;
    }

    optional Status status = 1;
    repeated string values = 2;
  }

  message ActivateRequest {
    optional string session_id = 3;
    optional bool order_window_front = 4;
    optional bool select_tab = 5;
    optional bool select_session = 6;

    message App {}

    optional App activate_app = 7;
  }

  message ActivateResponse {
    enum Status {
      OK = 0;
      BAD_IDENTIFIER = 1;
      INVALID_OPTION = 2;
    }

    optional Status status = 1;
  }
`).root;

const clientMessageType = protocolRoot.lookupType("iterm2.ClientOriginatedMessage");
const serverMessageType = protocolRoot.lookupType("iterm2.ServerOriginatedMessage");

export const VariableStatus = { Ok: 0, SessionNotFound: 1 } as const;
export const ActivateStatus = { Ok: 0 } as const;

interface SessionSummary {
  uniqueIdentifier?: string;
}

interface SplitTreeNode {
  links?: Array<{
    session?: SessionSummary;
    node?: SplitTreeNode;
  }>;
}

interface ListSessionsResponse {
  windows?: Array<{
    tabs?: Array<{
      root?: SplitTreeNode;
      minimizedSessions?: SessionSummary[];
    }>;
  }>;
  buriedSessions?: SessionSummary[];
}

interface VariableResponse {
  status?: number;
  values?: string[];
}

interface ActivateResponse {
  status?: number;
}

export interface ClientOriginatedMessage {
  id?: number;
  listSessionsRequest?: Record<string, never>;
  variableRequest?: {
    sessionId?: string;
    get?: string[];
  };
  activateRequest?: {
    sessionId?: string;
    orderWindowFront?: boolean;
    selectTab?: boolean;
    selectSession?: boolean;
    activateApp?: Record<string, never>;
  };
}

export interface ServerOriginatedMessage {
  id?: number;
  error?: string;
  listSessionsResponse?: ListSessionsResponse;
  variableResponse?: VariableResponse;
  activateResponse?: ActivateResponse;
}

function encode<T>(type: Type, message: T): Uint8Array {
  return type.encode(type.fromObject(message as Record<string, unknown>)).finish();
}

function decode<T>(type: Type, data: Uint8Array): T {
  return type.toObject(type.decode(data), { longs: Number }) as T;
}

export function encodeClientMessage(message: ClientOriginatedMessage): Uint8Array {
  return encode(clientMessageType, message);
}

export function decodeServerMessage(data: Uint8Array): ServerOriginatedMessage {
  return decode(serverMessageType, data);
}

export function buildListSessionsRequest(id: number): ClientOriginatedMessage {
  return { id, listSessionsRequest: {} };
}

export function buildVariableRequest(id: number, sessionId: string): ClientOriginatedMessage {
  return {
    id,
    variableRequest: {
      sessionId,
      get: ["tty"],
    },
  };
}

export function buildActivateSessionRequest(id: number, sessionId: string): ClientOriginatedMessage {
  return {
    id,
    activateRequest: {
      sessionId,
      orderWindowFront: true,
      selectTab: true,
      selectSession: true,
      activateApp: {},
    },
  };
}

function extractTreeSessions(node: SplitTreeNode | undefined, sessions: SessionSummary[]): void {
  for (const link of node?.links ?? []) {
    if (link.session) {
      sessions.push(link.session);
    }
    if (link.node) {
      extractTreeSessions(link.node, sessions);
    }
  }
}

function extractSessions(response: ListSessionsResponse): SessionSummary[] {
  const sessions: SessionSummary[] = [];

  for (const window of response.windows ?? []) {
    for (const tab of window.tabs ?? []) {
      extractTreeSessions(tab.root, sessions);
      sessions.push(...(tab.minimizedSessions ?? []));
    }
  }

  sessions.push(...(response.buriedSessions ?? []));
  return sessions;
}

export function extractSessionIds(response: ListSessionsResponse): string[] {
  return extractSessions(response).flatMap(({ uniqueIdentifier }) => (uniqueIdentifier ? [uniqueIdentifier] : []));
}
