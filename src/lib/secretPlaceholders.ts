/**
 * `{{secret:NAME}}` is resolved only in the Tauri desktop HTTP path (OS keychain).
 * NAME: letters, digits, `_`, `-`, `.` (must match Rust `validate_secret_key`).
 */
export const SECRET_PLACEHOLDER_RE =
  /\{\{secret:[a-zA-Z0-9_.-]+\}\}/g;

export function textContainsSecretPlaceholder(text: string): boolean {
  SECRET_PLACEHOLDER_RE.lastIndex = 0;
  return SECRET_PLACEHOLDER_RE.test(text);
}

import type { AuthConfig, KeyValue } from "../types";

function authStrings(auth: AuthConfig): string[] {
  switch (auth.type) {
    case "none":
      return [];
    case "bearer":
      return [auth.token];
    case "basic":
      return [auth.username, auth.password];
    case "apiKey":
      return [auth.key, auth.value];
    default:
      return [];
  }
}

function kvStrings(rows: KeyValue[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    out.push(r.key, r.value);
  }
  return out;
}

export type SendRequestPayloadLike = {
  url: string;
  body: string;
  headers: KeyValue[];
  queryParams: KeyValue[];
  auth: AuthConfig;
  multipartParts?: {
    key: string;
    text?: string;
    filePath?: string;
    fileName?: string;
  }[];
  binaryBody?: { path: string; contentType: string };
};

function multipartStrings(
  parts: SendRequestPayloadLike["multipartParts"]
): string[] {
  if (!parts?.length) return [];
  const out: string[] = [];
  for (const p of parts) {
    out.push(p.key);
    if (p.text !== undefined) out.push(p.text);
    if (p.filePath !== undefined) out.push(p.filePath);
    if (p.fileName !== undefined) out.push(p.fileName);
  }
  return out;
}

/** True if any outbound field references a local secret (desktop-only resolution). */
export function payloadContainsSecretPlaceholder(
  payload: SendRequestPayloadLike
): boolean {
  const parts = [
    payload.url,
    payload.body,
    ...kvStrings(payload.headers),
    ...kvStrings(payload.queryParams),
    ...authStrings(payload.auth),
    ...multipartStrings(payload.multipartParts),
  ];
  if (payload.binaryBody) {
    parts.push(payload.binaryBody.path, payload.binaryBody.contentType);
  }
  return parts.some((s) => textContainsSecretPlaceholder(s));
}
