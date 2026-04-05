import type { HttpResponsePayload } from "../types";

export type ScriptGlobals = {
  response: {
    status: () => number;
    text: () => string;
    json: () => unknown;
  };
  console: { log: (...args: unknown[]) => void };
};

/**
 * Runs user script after a response (Postman-style `pm` subset).
 * Executes in an isolated Function scope; avoid untrusted scripts in production.
 */
export function runCompletionScript(
  source: string,
  payload: HttpResponsePayload
): { logs: string[]; error?: string } {
  const logs: string[] = [];
  const log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  const pm: ScriptGlobals = {
    response: {
      status: () => payload.status,
      text: () => payload.body,
      json: () => {
        try {
          return JSON.parse(payload.body);
        } catch {
          throw new Error("Response body is not JSON");
        }
      },
    },
    console: { log },
  };

  try {
    const fn = new Function(
      "pm",
      `"use strict";\n${source}`
    ) as (pm: ScriptGlobals) => void;
    fn(pm);
    return { logs };
  } catch (e) {
    return {
      logs,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
