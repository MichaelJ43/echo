import type { SendRequestPayload } from "../api";
import type {
  CollectionNode,
  Environment,
  HttpResponsePayload,
  KeyValue,
  RequestItem,
} from "../types";
import { expandRequestReferences } from "./requestRef";
import { isSubstitutionEntry, variablesToMap } from "./variables";

function applyEnvVariables(text: string, variables: KeyValue[]): string {
  let out = text;
  for (const row of variables) {
    if (!row.enabled || !row.key || !isSubstitutionEntry(row)) continue;
    const needle = `{{${row.key}}}`;
    out = out.split(needle).join(row.value);
  }
  return out;
}

/** Expand `{{request:...}}` then `{{var}}` for one string. */
export function expandString(
  input: string,
  collections: CollectionNode[],
  cache: Record<string, HttpResponsePayload | undefined>,
  variables: KeyValue[]
): { text: string; errors: string[] } {
  const r1 = expandRequestReferences(input, collections, cache);
  const text = applyEnvVariables(r1.text, variables);
  return { text, errors: r1.errors };
}

function expandAuth(
  auth: RequestItem["auth"],
  exp: (s: string) => string
): RequestItem["auth"] {
  switch (auth.type) {
    case "none":
      return auth;
    case "bearer":
      return { type: "bearer", token: exp(auth.token) };
    case "basic":
      return {
        type: "basic",
        username: exp(auth.username),
        password: exp(auth.password),
      };
    case "apiKey":
      return {
        type: "apiKey",
        key: exp(auth.key),
        value: exp(auth.value),
        addTo: auth.addTo,
      };
    default:
      return auth;
  }
}

/**
 * Build payload for `send_http_request` with request-reference + env substitution
 * applied to URL, headers, query, body, and auth fields.
 */
export function buildExpandedSendPayload(
  req: RequestItem,
  env: Environment,
  collections: CollectionNode[],
  cache: Record<string, HttpResponsePayload | undefined>
): { payload: SendRequestPayload; errors: string[] } {
  const variables = env.variables;
  const allErrors: string[] = [];

  const exp = (s: string) => {
    const out = expandString(s, collections, cache, variables);
    allErrors.push(...out.errors);
    return out.text;
  };

  const payload: SendRequestPayload = {
    method: req.method,
    url: exp(req.url),
    headers: req.headers.map((h) => ({
      ...h,
      key: exp(h.key),
      value: exp(h.value),
    })),
    queryParams: req.queryParams.map((q) => ({
      ...q,
      key: exp(q.key),
      value: exp(q.value),
    })),
    body: exp(req.body),
    bodyType: req.bodyType,
    auth: expandAuth(req.auth, exp),
    variables: variablesToMap(variables),
  };

  return { payload, errors: [...new Set(allErrors)] };
}
