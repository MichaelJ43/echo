import type { HttpResponsePayload } from "../types";

export type ScriptContext = {
  setEnvironmentVariable: (key: string, value: string) => void;
  sendRequest: (path: string) => Promise<void>;
};

type PmApi = {
  response: {
    status: () => number;
    text: () => string;
    json: () => unknown;
  };
  console: { log: (...args: unknown[]) => void };
  environment: { set: (key: string, value: string) => void };
  sendRequest: (path: string) => Promise<void>;
};

/**
 * Runs user script after a response (Postman-style `pm` subset).
 * Supports async/await and `await pm.sendRequest(...)`.
 * Log output must use **`pm.console.log`** (global `console.log` is not captured in the UI).
 * Executes in an isolated AsyncFunction; avoid untrusted scripts in production.
 */
export async function runCompletionScript(
  source: string,
  payload: HttpResponsePayload,
  ctx?: ScriptContext
): Promise<{ logs: string[]; error?: string }> {
  const logs: string[] = [];
  const log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  const noopSend = async () => {
    throw new Error(
      "pm.sendRequest is only available when running from the Echo app send flow"
    );
  };
  const noopEnv = () => {
    throw new Error(
      "pm.environment.set is only available when running from the Echo app send flow"
    );
  };

  const pm: PmApi = {
    response: {
      status: () => payload.status,
      text: () => payload.body,
      json: () => {
        try {
          return JSON.parse(payload.body) as unknown;
        } catch {
          throw new Error("Response body is not JSON");
        }
      },
    },
    console: { log },
    environment: {
      set: (key: string, value: string) => {
        if (ctx) ctx.setEnvironmentVariable(key, value);
        else noopEnv();
      },
    },
    sendRequest: ctx ? (path: string) => ctx.sendRequest(path) : noopSend,
  };

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {})
      .constructor as new (
      ...args: string[]
    ) => (pm: PmApi) => Promise<unknown>;

    const fn = new AsyncFunction(
      "pm",
      `"use strict";\n${source}`
    ) as (pm: PmApi) => Promise<unknown>;
    await fn(pm);
    return { logs };
  } catch (e) {
    return {
      logs,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
