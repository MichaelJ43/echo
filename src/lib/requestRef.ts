import type { CollectionNode, HttpResponsePayload, RequestItem } from "../types";

/** Walk folder/request names, e.g. `folder1/sub/my_request`. */
export function findRequestByPath(
  nodes: CollectionNode[],
  pathStr: string
): RequestItem | null {
  const segments = pathStr
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  return walk(nodes, segments);
}

function walk(nodes: CollectionNode[], segments: string[]): RequestItem | null {
  if (segments.length === 0) return null;
  const [head, ...rest] = segments;
  if (rest.length === 0) {
    for (const n of nodes) {
      if (n.nodeType === "request" && n.name === head) return n;
    }
    return null;
  }
  for (const n of nodes) {
    if (n.nodeType === "folder" && n.name === head) {
      return walk(n.children, rest);
    }
  }
  return null;
}

/** Dot/bracket path for JSON objects, e.g. `auth.bearer` or `items.0.id`. */
export function getValueAtJsonPath(data: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = data;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (/^\d+$/.test(p) && Array.isArray(cur)) {
      cur = cur[parseInt(p, 10)];
    } else if (typeof cur === "object" && cur !== null && p in (cur as object)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function valueToSubstitutionString(val: unknown): string {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

const REQUEST_REF_RE = /\{\{request:([^}]+)\}\}/g;

/**
 * Inline `{{request:folder/sub/requestName:json.dot.path}}` using cached JSON bodies.
 * Path uses `/` between folder names and the request name; `json.dot.path` indexes the parsed body.
 */
export function expandRequestReferences(
  input: string,
  collections: CollectionNode[],
  cache: Record<string, HttpResponsePayload | undefined>
): { text: string; errors: string[] } {
  const errors: string[] = [];
  const text = input.replace(REQUEST_REF_RE, (full, inner: string) => {
    const idx = inner.lastIndexOf(":");
    if (idx <= 0) {
      errors.push(`Invalid request reference: ${full}`);
      return "";
    }
    const pathPart = inner.slice(0, idx).trim();
    const jsonPath = inner.slice(idx + 1).trim();
    if (!pathPart || !jsonPath) {
      errors.push(`Invalid request reference: ${full}`);
      return "";
    }
    const req = findRequestByPath(collections, pathPart);
    if (!req) {
      errors.push(`No request at path "${pathPart}"`);
      return "";
    }
    const res = cache[req.id];
    if (!res) {
      errors.push(
        `No cached response for "${pathPart}" (send that request first)`
      );
      return "";
    }
    try {
      const data = JSON.parse(res.body) as unknown;
      const val = getValueAtJsonPath(data, jsonPath);
      if (val === undefined) {
        errors.push(
          `Path "${jsonPath}" not found in JSON response for "${pathPart}"`
        );
        return "";
      }
      return valueToSubstitutionString(val);
    } catch {
      errors.push(`Response body for "${pathPart}" is not valid JSON`);
      return "";
    }
  });
  return { text, errors };
}
