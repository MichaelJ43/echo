import type { EnvironmentEntryKind, KeyValue } from "../types";

export function getEntryKind(row: KeyValue): EnvironmentEntryKind {
  return row.entryKind ?? "variable";
}

/** Variable and file-path rows participate in `{{key}}` substitution; secret rows use `{{secret:key}}` later. */
export function isSubstitutionEntry(row: KeyValue): boolean {
  const k = getEntryKind(row);
  return k === "variable" || k === "file";
}

/** Resolves `{{name}}` using enabled environment variables and file-path entries. */
export function applyVariables(
  text: string,
  variables: KeyValue[]
): string {
  let out = text;
  for (const row of variables) {
    if (!row.enabled || !row.key || !isSubstitutionEntry(row)) continue;
    const needle = `{{${row.key}}}`;
    out = out.split(needle).join(row.value);
  }
  return out;
}

export function variablesToMap(variables: KeyValue[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const row of variables) {
    if (!row.enabled || !row.key || !isSubstitutionEntry(row)) continue;
    m[row.key] = row.value;
  }
  return m;
}
