import { describe, expect, it } from "vitest";
import {
  ActivateStatus,
  VariableStatus,
  buildActivateSessionRequest,
  buildListSessionsRequest,
  buildVariableRequest,
  decodeServerMessage,
  encodeClientMessage,
  extractSessionIds,
} from "./iterm-api-protocol";

const LIST_RESPONSE_WIRE = new Uint8Array([
  8, 9, 210, 6, 55, 10, 43, 10, 41, 26, 26, 18, 8, 10, 6, 10, 4, 114, 111, 111, 116, 18, 14, 18, 12, 18, 10, 10, 8, 10,
  6, 110, 101, 115, 116, 101, 100, 50, 11, 10, 9, 109, 105, 110, 105, 109, 105, 122, 101, 100, 18, 8, 10, 6, 98, 117,
  114, 105, 101, 100,
]);
const VARIABLE_RESPONSE_WIRE = new Uint8Array([
  8, 8, 154, 7, 18, 8, 0, 18, 14, 34, 47, 100, 101, 118, 47, 116, 116, 121, 115, 48, 48, 55, 34,
]);
const ACTIVATE_RESPONSE_WIRE = new Uint8Array([8, 3, 146, 7, 2, 8, 0]);

describe("iTerm API protocol", () => {
  it("matches the list-sessions request wire fixture", () => {
    expect(Array.from(encodeClientMessage(buildListSessionsRequest(7)))).toEqual([8, 7, 210, 6, 0]);
  });

  it("decodes nested, minimized, and buried sessions from the list response wire fixture", () => {
    const response = decodeServerMessage(LIST_RESPONSE_WIRE);

    expect(response.id).toBe(9);
    expect(extractSessionIds(response.listSessionsResponse!)).toEqual(["root", "nested", "minimized", "buried"]);
  });

  it("matches the session tty request wire fixture", () => {
    expect(Array.from(encodeClientMessage(buildVariableRequest(8, "session-a")))).toEqual([
      8, 8, 154, 7, 16, 10, 9, 115, 101, 115, 115, 105, 111, 110, 45, 97, 26, 3, 116, 116, 121,
    ]);
  });

  it("decodes the variable response wire fixture", () => {
    expect(decodeServerMessage(VARIABLE_RESPONSE_WIRE)).toEqual({
      id: 8,
      variableResponse: {
        status: VariableStatus.Ok,
        values: ['"/dev/ttys007"'],
      },
    });
  });

  it("matches the session activation request wire fixture", () => {
    expect(Array.from(encodeClientMessage(buildActivateSessionRequest(3, "session-a")))).toEqual([
      8, 3, 146, 7, 19, 26, 9, 115, 101, 115, 115, 105, 111, 110, 45, 97, 32, 1, 40, 1, 48, 1, 58, 0,
    ]);
  });

  it("decodes the activation response wire fixture", () => {
    expect(decodeServerMessage(ACTIVATE_RESPONSE_WIRE)).toEqual({
      id: 3,
      activateResponse: { status: ActivateStatus.Ok },
    });
  });
});
