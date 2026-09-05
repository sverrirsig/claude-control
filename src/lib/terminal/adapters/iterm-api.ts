import { existsSync } from "fs";
import { createConnection } from "net";
import { homedir } from "os";
import { join } from "path";
import WebSocket, { type RawData } from "ws";
import {
  ActivateStatus,
  VariableStatus,
  buildActivateSessionRequest,
  buildListSessionsRequest,
  buildVariableRequest,
  decodeServerMessage,
  encodeClientMessage,
  extractSessionIds,
  type ClientOriginatedMessage,
  type ServerOriginatedMessage,
} from "./iterm-api-protocol";
import { execFileAsync } from "./shared";

const ITERM_API_SOCKET = join(homedir(), "Library", "Application Support", "iTerm2", "private", "socket");
const ITERM_API_TIMEOUT_MS = 2000;
const AUTHENTICATION_SCRIPT = 'tell application "iTerm2" to request cookie and key for app named "Claude Control"';

interface PendingRequest {
  resolve: (message: ServerOriginatedMessage) => void;
  reject: (error: Error) => void;
}

function rawDataBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

class RpcClient {
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly socket: WebSocket) {
    socket.on("message", (data, isBinary) => {
      if (!isBinary) {
        this.failAll(new Error("iTerm API returned a text message"));
        return;
      }

      let message: ServerOriginatedMessage;
      try {
        message = decodeServerMessage(rawDataBytes(data));
      } catch (error) {
        this.failAll(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;

      this.pending.delete(message.id);
      if (message.error !== undefined) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message);
      }
    });
    socket.on("error", (error) => this.failAll(error));
    socket.on("close", () => this.failAll(new Error("iTerm API connection closed")));
  }

  call(request: ClientOriginatedMessage): Promise<ServerOriginatedMessage> {
    if (request.id === undefined) throw new Error("iTerm API request is missing an id");
    const requestId = request.id;

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.socket.send(encodeClientMessage(request), (error) => {
        if (!error) return;
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

async function authenticate(timeout: number): Promise<{ cookie: string; key: string }> {
  const { stdout } = await execFileAsync("osascript", ["-e", AUTHENTICATION_SCRIPT], { timeout });
  const tokens = String(stdout).trim().split(/\s+/);
  if (tokens.length !== 2 || tokens.some((token) => token.length === 0)) {
    throw new Error("iTerm API authentication returned malformed credentials");
  }
  return { cookie: tokens[0], key: tokens[1] };
}

function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off("open", onOpen);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("iTerm API connection closed before opening"));
    };

    socket.once("open", onOpen);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function remainingTime(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("iTerm API request timed out");
  return remaining;
}

function decodeTty(response: ServerOriginatedMessage): string | undefined {
  const variable = response.variableResponse;
  if (!variable) {
    throw new Error("iTerm API returned an invalid variable response");
  }
  const status = variable.status ?? VariableStatus.Ok;
  if (status === VariableStatus.SessionNotFound) return undefined;
  if (status !== VariableStatus.Ok || variable.values?.length !== 1) {
    throw new Error("iTerm API returned an invalid variable response");
  }

  const value: unknown = JSON.parse(variable.values[0]);
  if (value === null) return undefined;
  if (typeof value !== "string") throw new Error("iTerm API returned a non-string tty");
  return value;
}

async function focusWithApi(client: RpcClient, tty: string): Promise<boolean> {
  let requestId = 1;
  const listResponse = await client.call(buildListSessionsRequest(requestId++));
  if (!listResponse.listSessionsResponse) throw new Error("iTerm API returned an invalid session list");

  const sessionIds = extractSessionIds(listResponse.listSessionsResponse);
  const sessions = await Promise.all(
    sessionIds.map(async (sessionId) => {
      const response = await client.call(buildVariableRequest(requestId++, sessionId));
      return { sessionId, tty: decodeTty(response) };
    }),
  );
  const match = sessions.find((session) => session.tty === tty);
  if (!match) return false;

  const activateResponse = await client.call(buildActivateSessionRequest(requestId, match.sessionId));
  const activation = activateResponse.activateResponse;
  if (!activation || (activation.status ?? ActivateStatus.Ok) !== ActivateStatus.Ok) {
    throw new Error("iTerm API failed to activate the session");
  }
  return true;
}

export async function tryFocusItermSession(tty: string): Promise<boolean> {
  if (!existsSync(ITERM_API_SOCKET)) return false;

  const deadline = Date.now() + ITERM_API_TIMEOUT_MS;
  let socket: WebSocket | undefined;
  const timeout = setTimeout(() => socket?.terminate(), ITERM_API_TIMEOUT_MS);

  try {
    const { cookie, key } = await authenticate(remainingTime(deadline));
    // iTerm2 validates this compatibility header against its Python-client floor:
    // https://github.com/gnachman/iTerm2/blob/master/sources/API/iTermWebSocketConnection.m
    const options: WebSocket.ClientOptions & { closeTimeout: number } = {
      origin: "ws://localhost/",
      handshakeTimeout: remainingTime(deadline),
      closeTimeout: 0,
      createConnection: () => createConnection({ path: ITERM_API_SOCKET }),
      headers: {
        "x-iterm2-library-version": "python 0.24",
        "x-iterm2-disable-auth-ui": "true",
        "x-iterm2-cookie": cookie,
        "x-iterm2-key": key,
        "x-iterm2-advisory-name": "Claude Control",
      },
    };
    socket = new WebSocket("ws://localhost/", "api.iterm2.com", options);
    await waitForOpen(socket);
    return await focusWithApi(new RpcClient(socket), tty);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    if (socket?.readyState === WebSocket.CONNECTING) socket.terminate();
    else if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
  }
}
