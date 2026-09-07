import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Listener = (...args: any[]) => void;

  class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    static instances: MockWebSocket[] = [];
    static onCreate: ((socket: MockWebSocket) => void) | undefined;
    static onSend: ((socket: MockWebSocket, data: Uint8Array, index: number) => void) | undefined;

    readonly sent: number[][] = [];
    readonly listeners = new Map<string, Array<{ listener: Listener; once: boolean }>>();
    readyState = MockWebSocket.CONNECTING;
    closeCalls = 0;
    terminateCalls = 0;

    constructor(
      readonly url: string,
      readonly protocol: string,
      readonly options: Record<string, unknown>,
    ) {
      MockWebSocket.instances.push(this);
      queueMicrotask(() => (MockWebSocket.onCreate ? MockWebSocket.onCreate(this) : this.open()));
    }

    on(event: string, listener: Listener): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), { listener, once: false }]);
      return this;
    }

    once(event: string, listener: Listener): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), { listener, once: true }]);
      return this;
    }

    off(event: string, listener: Listener): this {
      this.listeners.set(
        event,
        (this.listeners.get(event) ?? []).filter((entry) => entry.listener !== listener),
      );
      return this;
    }

    emit(event: string, ...args: any[]): void {
      const entries = [...(this.listeners.get(event) ?? [])];
      this.listeners.set(
        event,
        (this.listeners.get(event) ?? []).filter((entry) => !entry.once),
      );
      for (const entry of entries) entry.listener(...args);
    }

    open(): void {
      this.readyState = MockWebSocket.OPEN;
      this.emit("open");
    }

    fail(error: Error): void {
      this.readyState = MockWebSocket.CLOSED;
      this.emit("error", error);
      this.emit("close");
    }

    receive(data: Uint8Array): void {
      this.emit("message", Buffer.from(data), true);
    }

    send(data: Uint8Array, callback?: (error?: Error) => void): void {
      const bytes = new Uint8Array(data);
      const index = this.sent.push(Array.from(bytes)) - 1;
      callback?.();
      MockWebSocket.onSend?.(this, bytes, index);
    }

    close(): void {
      this.closeCalls += 1;
      this.readyState = MockWebSocket.CLOSED;
      this.emit("close");
    }

    terminate(): void {
      this.terminateCalls += 1;
      this.readyState = MockWebSocket.CLOSED;
      this.emit("close");
    }
  }

  return {
    MockWebSocket,
    existsSync: vi.fn(),
    createConnection: vi.fn(),
    execFileAsync: vi.fn(),
  };
});

vi.mock("fs", () => ({ existsSync: mocks.existsSync }));
vi.mock("net", () => ({ createConnection: mocks.createConnection }));
vi.mock("ws", () => ({ default: mocks.MockWebSocket }));
vi.mock("./shared", () => ({ execFileAsync: mocks.execFileAsync }));

import { tryFocusItermSession } from "./iterm-api";

const LIST_RESPONSE = new Uint8Array([
  8, 1, 210, 6, 40, 10, 38, 10, 36, 26, 34, 18, 13, 10, 11, 10, 9, 115, 101, 115, 115, 105, 111, 110, 45, 97, 18, 17,
  18, 15, 18, 13, 10, 11, 10, 9, 115, 101, 115, 115, 105, 111, 110, 45, 98,
]);
const ONE_SESSION_LIST_RESPONSE = new Uint8Array([
  8, 1, 210, 6, 13, 18, 11, 10, 9, 115, 101, 115, 115, 105, 111, 110, 45, 97,
]);
const TTY_OTHER_RESPONSE = new Uint8Array([
  8, 2, 154, 7, 18, 8, 0, 18, 14, 34, 47, 100, 101, 118, 47, 116, 116, 121, 115, 48, 48, 49, 34,
]);
const TTY_TARGET_RESPONSE_ID_2 = new Uint8Array([
  8, 2, 154, 7, 18, 8, 0, 18, 14, 34, 47, 100, 101, 118, 47, 116, 116, 121, 115, 48, 48, 55, 34,
]);
const TTY_TARGET_DEFAULT_OK_RESPONSE_ID_2 = new Uint8Array([
  8, 2, 154, 7, 16, 18, 14, 34, 47, 100, 101, 118, 47, 116, 116, 121, 115, 48, 48, 55, 34,
]);
const TTY_TARGET_RESPONSE_ID_3 = new Uint8Array([
  8, 3, 154, 7, 18, 8, 0, 18, 14, 34, 47, 100, 101, 118, 47, 116, 116, 121, 115, 48, 48, 55, 34,
]);
const ACTIVATE_OK_RESPONSE_ID_3 = new Uint8Array([8, 3, 146, 7, 2, 8, 0]);
const ACTIVATE_OK_RESPONSE_ID_4 = new Uint8Array([8, 4, 146, 7, 2, 8, 0]);
const ACTIVATE_DEFAULT_OK_RESPONSE_ID_3 = new Uint8Array([8, 3, 146, 7, 0]);
const SERVER_ERROR_RESPONSE = new Uint8Array([8, 1, 18, 11, 98, 97, 100, 32, 114, 101, 113, 117, 101, 115, 116]);
const VARIABLE_NOT_FOUND_RESPONSE = new Uint8Array([8, 2, 154, 7, 2, 8, 1]);
const ACTIVATE_BAD_ID_RESPONSE = new Uint8Array([8, 3, 146, 7, 2, 8, 1]);

function respondInOrder(responses: Uint8Array[]): void {
  mocks.MockWebSocket.onSend = (socket, _data, index) => {
    const response = responses[index];
    if (response) queueMicrotask(() => socket.receive(response));
  };
}

describe("tryFocusItermSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(true);
    mocks.createConnection.mockReturnValue({});
    mocks.execFileAsync.mockResolvedValue({ stdout: "cookie-value key-value\n", stderr: "" });
    mocks.MockWebSocket.instances = [];
    mocks.MockWebSocket.onCreate = undefined;
    mocks.MockWebSocket.onSend = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("focuses the exact tty from a nested session list", async () => {
    mocks.MockWebSocket.onSend = (socket, _data, index) => {
      if (index === 0) queueMicrotask(() => socket.receive(LIST_RESPONSE));
      if (index === 2) {
        queueMicrotask(() => {
          socket.receive(TTY_TARGET_RESPONSE_ID_3);
          socket.receive(TTY_OTHER_RESPONSE);
        });
      }
      if (index === 3) queueMicrotask(() => socket.receive(ACTIVATE_OK_RESPONSE_ID_4));
    };

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(true);

    expect(mocks.existsSync).toHaveBeenCalledWith(
      expect.stringMatching(/Library\/Application Support\/iTerm2\/private\/socket$/),
    );
    expect(mocks.execFileAsync).toHaveBeenCalledWith(
      "osascript",
      ["-e", 'tell application "iTerm2" to request cookie and key for app named "Claude Control"'],
      { timeout: expect.any(Number) },
    );
    const socket = mocks.MockWebSocket.instances[0];
    expect({ url: socket.url, protocol: socket.protocol, options: socket.options }).toMatchObject({
      url: "ws://localhost/",
      protocol: "api.iterm2.com",
      options: {
        origin: "ws://localhost/",
        handshakeTimeout: expect.any(Number),
        closeTimeout: 0,
        createConnection: expect.any(Function),
        headers: {
          "x-iterm2-library-version": "python 0.24",
          "x-iterm2-disable-auth-ui": "true",
          "x-iterm2-cookie": "cookie-value",
          "x-iterm2-key": "key-value",
          "x-iterm2-advisory-name": "Claude Control",
        },
      },
    });
    (socket.options.createConnection as () => unknown)();
    expect(mocks.createConnection).toHaveBeenCalledWith({
      path: expect.stringMatching(/Library\/Application Support\/iTerm2\/private\/socket$/),
    });
    expect(socket.sent).toEqual([
      [8, 1, 210, 6, 0],
      [8, 2, 154, 7, 16, 10, 9, 115, 101, 115, 115, 105, 111, 110, 45, 97, 26, 3, 116, 116, 121],
      [8, 3, 154, 7, 16, 10, 9, 115, 101, 115, 115, 105, 111, 110, 45, 98, 26, 3, 116, 116, 121],
      [8, 4, 146, 7, 19, 26, 9, 115, 101, 115, 115, 105, 111, 110, 45, 98, 32, 1, 40, 1, 48, 1, 58, 0],
    ]);
    expect(socket.closeCalls).toBe(1);
  });

  it("returns false before authentication when the API socket is absent", async () => {
    mocks.existsSync.mockReturnValue(false);

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(false);

    expect(mocks.execFileAsync).not.toHaveBeenCalled();
    expect(mocks.MockWebSocket.instances).toHaveLength(0);
  });

  it("returns false when authentication fails", async () => {
    mocks.execFileAsync.mockRejectedValue(new Error("not authorized"));

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(false);
    expect(mocks.MockWebSocket.instances).toHaveLength(0);
  });

  it.each([
    "",
    "cookie-only",
    "cookie key extra",
  ])("returns false for malformed authentication output %j", async (stdout) => {
    mocks.execFileAsync.mockResolvedValue({ stdout, stderr: "" });

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(false);
    expect(mocks.MockWebSocket.instances).toHaveLength(0);
  });

  it("returns false when the connection fails", async () => {
    mocks.MockWebSocket.onCreate = (socket) => socket.fail(new Error("connect failed"));

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(false);

    expect(mocks.MockWebSocket.instances[0].readyState).toBe(mocks.MockWebSocket.CLOSED);
  });

  it("returns false and terminates a connection that exceeds the overall deadline", async () => {
    vi.useFakeTimers();
    mocks.MockWebSocket.onCreate = () => {};

    const result = tryFocusItermSession("/dev/ttys007");
    await vi.advanceTimersByTimeAsync(2000);

    await expect(result).resolves.toBe(false);
    expect(mocks.MockWebSocket.instances[0].terminateCalls).toBe(1);
  });

  it("returns false and closes the socket for a server error", async () => {
    respondInOrder([SERVER_ERROR_RESPONSE]);

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(false);
    expect(mocks.MockWebSocket.instances[0].closeCalls).toBe(1);
  });

  it("returns false when no session tty matches", async () => {
    respondInOrder([ONE_SESSION_LIST_RESPONSE, TTY_OTHER_RESPONSE]);

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(false);
    expect(mocks.MockWebSocket.instances[0].closeCalls).toBe(1);
  });

  it("ignores a stale session while another concurrent tty query matches", async () => {
    mocks.MockWebSocket.onSend = (socket, _data, index) => {
      if (index === 0) queueMicrotask(() => socket.receive(LIST_RESPONSE));
      if (index === 2) {
        queueMicrotask(() => {
          socket.receive(TTY_TARGET_RESPONSE_ID_3);
          socket.receive(VARIABLE_NOT_FOUND_RESPONSE);
        });
      }
      if (index === 3) queueMicrotask(() => socket.receive(ACTIVATE_OK_RESPONSE_ID_4));
    };

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(true);
    expect(mocks.MockWebSocket.instances[0].closeCalls).toBe(1);
  });

  it("terminates the socket when a pending list-sessions RPC reaches the overall deadline", async () => {
    vi.useFakeTimers();

    const result = tryFocusItermSession("/dev/ttys007");
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.MockWebSocket.instances[0].sent).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2000);

    await expect(result).resolves.toBe(false);
    expect(mocks.MockWebSocket.instances[0].terminateCalls).toBe(1);
  });

  it("returns false for a non-OK activation response", async () => {
    respondInOrder([ONE_SESSION_LIST_RESPONSE, TTY_TARGET_RESPONSE_ID_2, ACTIVATE_BAD_ID_RESPONSE]);

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(false);
    expect(mocks.MockWebSocket.instances[0].closeCalls).toBe(1);
  });

  it("returns false for a response of the wrong type", async () => {
    respondInOrder([new Uint8Array([8, 1, 146, 7, 2, 8, 0])]);

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(false);
    expect(mocks.MockWebSocket.instances[0].closeCalls).toBe(1);
  });

  it("accepts an OK activation response for a single session", async () => {
    respondInOrder([ONE_SESSION_LIST_RESPONSE, TTY_TARGET_RESPONSE_ID_2, ACTIVATE_OK_RESPONSE_ID_3]);

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(true);
  });

  it("accepts omitted proto2 default OK statuses", async () => {
    respondInOrder([ONE_SESSION_LIST_RESPONSE, TTY_TARGET_DEFAULT_OK_RESPONSE_ID_2, ACTIVATE_DEFAULT_OK_RESPONSE_ID_3]);

    await expect(tryFocusItermSession("/dev/ttys007")).resolves.toBe(true);
  });
});
