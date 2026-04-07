import { invoke, isTauri } from "@tauri-apps/api/core";
import { createDefaultState } from "./defaultState";
import { migrateAppState } from "./lib/migrateAppState";
import { payloadContainsSecretPlaceholder } from "./lib/secretPlaceholders";
import type {
  AppState,
  AuthConfig,
  BinaryBody,
  HttpResponsePayload,
  KeyValue,
  MultipartPart,
} from "./types";
import { stripEphemeralWorkspaceFields } from "./lib/workspacePersist";

const LS_KEY = "echo.workspace.v1";

export type SendRequestPayload = {
  method: string;
  url: string;
  headers: KeyValue[];
  queryParams: KeyValue[];
  body: string;
  bodyType: string;
  auth: AuthConfig;
  variables: Record<string, string>;
  /** Active environment id (UUID) for `{{secret:name}}` resolution on desktop. */
  environmentId: string;
  multipartParts?: MultipartPart[];
  binaryBody?: BinaryBody;
};

function substituteUrl(s: string, vars: Record<string, string>): string {
  let out = s;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

async function sendHttpRequestBrowser(
  payload: SendRequestPayload
): Promise<HttpResponsePayload> {
  const urlStr = substituteUrl(payload.url, payload.variables);
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error("Invalid URL");
  }
  for (const q of payload.queryParams) {
    if (!q.enabled || !q.key) continue;
    url.searchParams.append(
      substituteUrl(q.key, payload.variables),
      substituteUrl(q.value, payload.variables)
    );
  }

  const headers = new Headers();
  for (const h of payload.headers) {
    if (!h.enabled || !h.key) continue;
    headers.append(
      substituteUrl(h.key, payload.variables),
      substituteUrl(h.value, payload.variables)
    );
  }

  const auth = payload.auth;
  if (auth.type === "bearer") {
    headers.set(
      "Authorization",
      `Bearer ${substituteUrl(auth.token, payload.variables)}`
    );
  } else if (auth.type === "basic") {
    const u = substituteUrl(auth.username, payload.variables);
    const p = substituteUrl(auth.password, payload.variables);
    headers.set("Authorization", `Basic ${btoa(`${u}:${p}`)}`);
  } else if (auth.type === "apiKey") {
    const k = substituteUrl(auth.key, payload.variables);
    const v = substituteUrl(auth.value, payload.variables);
    if (auth.addTo === "header") headers.set(k, v);
    else url.searchParams.append(k, v);
  }

  let body: string | Blob | FormData | ArrayBuffer | undefined;

  if (payload.bodyType === "multipart" && payload.multipartParts?.length) {
    const fd = new FormData();
    for (const p of payload.multipartParts) {
      if (!p.enabled || !p.key.trim()) continue;
      if (p.partKind === "text") {
        fd.append(p.key, substituteUrl(p.text ?? "", payload.variables));
      } else {
        const b64 = p.fileDataBase64;
        if (!b64) {
          throw new Error(
            "Multipart file parts need a chosen file (use Browse) in the web build."
          );
        }
        const raw = atob(b64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const name =
          substituteUrl(p.fileName ?? "file", payload.variables) || "file";
        fd.append(p.key, new Blob([bytes]), name);
      }
    }
    body = fd;
  } else if (payload.bodyType === "binary" && payload.binaryBody) {
    const bb = payload.binaryBody;
    const ct =
      (bb.contentType && substituteUrl(bb.contentType, payload.variables)) ||
      "application/octet-stream";
    headers.set("Content-Type", ct);
    if (bb.browserBase64) {
      const raw = atob(bb.browserBase64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      body = bytes.buffer;
    } else if (bb.path) {
      throw new Error(
        "Binary body from a file path is only available in the desktop app. Use Browse to pick a file in the web build."
      );
    } else {
      throw new Error(
        "Binary body: choose a file (Browse) or set path and Content-Type."
      );
    }
  } else if (payload.bodyType === "json" && payload.body) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json; charset=utf-8");
    }
    body = substituteUrl(payload.body, payload.variables);
  } else if (payload.bodyType === "raw" && payload.body) {
    body = substituteUrl(payload.body, payload.variables);
  } else if (payload.bodyType === "form" && payload.body) {
    headers.set(
      "Content-Type",
      "application/x-www-form-urlencoded; charset=utf-8"
    );
    body = substituteUrl(payload.body, payload.variables);
  }

  const start = performance.now();
  const res = await fetch(url.toString(), {
    method: payload.method,
    headers,
    body: body ?? null,
  });
  const durationMs = Math.round(performance.now() - start);
  const text = await res.text();
  const outHeaders: [string, string][] = [];
  res.headers.forEach((value, key) => {
    outHeaders.push([key, value]);
  });
  return {
    status: res.status,
    statusText: res.statusText,
    headers: outHeaders,
    body: text,
    durationMs,
  };
}

function loadLocal(): AppState {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return createDefaultState();
  try {
    return migrateAppState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

function saveLocal(state: AppState): void {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

export async function loadState(): Promise<AppState> {
  if (!isTauri()) return loadLocal();
  try {
    return migrateAppState(await invoke<AppState>("load_state"));
  } catch {
    return loadLocal();
  }
}

export async function saveState(state: AppState): Promise<void> {
  const toSave = stripEphemeralWorkspaceFields(state);
  if (!isTauri()) {
    saveLocal(toSave);
    return;
  }
  try {
    await invoke("save_state", { state: toSave });
  } catch {
    saveLocal(toSave);
  }
}

export async function sendHttpRequest(
  payload: SendRequestPayload
): Promise<HttpResponsePayload> {
  if (!isTauri()) {
    if (payloadContainsSecretPlaceholder(payload)) {
      throw new Error(
        "Local secrets ({{secret:NAME}}) are only available in the desktop app."
      );
    }
    return sendHttpRequestBrowser(payload);
  }
  return invoke<HttpResponsePayload>("send_http_request", { config: payload });
}

export async function listSecretKeys(): Promise<string[]> {
  return invoke<string[]>("list_secret_keys");
}

/** Logical secret names for this environment (composed keys `echo_<envId>_…`).
 * Desktop only; returns [] in the browser build. */
export async function listSecretLogicalNamesForEnvironment(
  environmentId: string
): Promise<string[]> {
  if (!isTauri()) return [];
  return invoke<string[]>("list_secret_logical_names_for_env", { environmentId });
}

export async function setSecret(key: string, value: string): Promise<void> {
  await invoke("set_secret", { key, value });
}

export async function deleteSecret(key: string): Promise<void> {
  await invoke("delete_secret", { key });
}

export async function importWorkspaceFile(path: string): Promise<AppState> {
  return migrateAppState(await invoke<AppState>("import_workspace_file", { path }));
}

export async function exportWorkspaceFile(
  path: string,
  state: AppState
): Promise<void> {
  return invoke("export_workspace_file", { path, state });
}

export async function getPaths(): Promise<{
  appDataDir: string;
  collectionsFile: string;
}> {
  if (!isTauri()) {
    return {
      appDataDir: "(browser)",
      collectionsFile: "(localStorage)",
    };
  }
  return invoke("get_paths");
}

/** Desktop only: opens the directory containing the given file path in the system file manager. */
export async function openContainingFolder(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_containing_folder", { path });
}
