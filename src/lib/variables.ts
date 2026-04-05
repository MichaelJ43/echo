import type { KeyValue } from "../types";

/** Resolves `{{name}}` using enabled environment variables. */
export function applyVariables(
  text: string,
  variables: KeyValue[]
): string {
  let out = text;
  for (const row of variables) {
    if (!row.enabled || !row.key) continue;
    const needle = `{{${row.key}}}`;
    out = out.split(needle).join(row.value);
  }
  return out;
}

export function variablesToMap(variables: KeyValue[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const row of variables) {
    if (!row.enabled || !row.key) continue;
    m[row.key] = row.value;
  }
  return m;
}
