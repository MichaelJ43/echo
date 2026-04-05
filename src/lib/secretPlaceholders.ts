/**
 * `{{secret:NAME}}` is resolved only in the Tauri desktop HTTP path (OS keychain).
 * NAME: letter or underscore, then alphanumeric/underscore.
 */
export const SECRET_PLACEHOLDER_RE =
  /\{\{secret:[a-zA-Z_][a-zA-Z0-9_]*\}\}/g;

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
};

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
  ];
  return parts.some((s) => textContainsSecretPlaceholder(s));
}
