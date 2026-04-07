import type { AppState } from "../types";
import { composeSecretStorageKey } from "./secretStorageKey";
import { getEntryKind } from "./variables";

/** Matches composed keys `echo_<uuid>_<logical>` in `secret_index.json`. */
const ECHO_COMPOSED_KEY =
  /^echo_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(.+)$/i;

const UUID_LEN = 36;

export function parseEchoComposedStorageKey(
  key: string
): { environmentId: string; logicalName: string } | null {
  const m = key.match(ECHO_COMPOSED_KEY);
  if (!m) return null;
  return { environmentId: m[1]!, logicalName: m[2]! };
}

/** Secret-typed env rows with a non-empty name (logical placeholder name). */
export function gatherSecretPlaceholderRows(
  state: AppState
): { environmentId: string; logicalName: string }[] {
  const out: { environmentId: string; logicalName: string }[] = [];
  for (const env of state.environments) {
    if (env.id.length !== UUID_LEN) continue;
    for (const row of env.variables) {
      if (getEntryKind(row) !== "secret") continue;
      const logicalName = row.key.trim();
      if (!logicalName) continue;
      out.push({ environmentId: env.id, logicalName });
    }
  }
  return out;
}

/** Composed storage keys that the workspace still references (for orphan detection). */
export function expectedComposedKeysFromWorkspace(state: AppState): Set<string> {
  const s = new Set<string>();
  for (const env of state.environments) {
    if (env.id.length !== UUID_LEN) continue;
    for (const row of env.variables) {
      if (getEntryKind(row) !== "secret") continue;
      const logicalName = row.key.trim();
      if (!logicalName) continue;
      s.add(composeSecretStorageKey(env.id, logicalName));
    }
  }
  return s;
}

/**
 * Index keys that look like `echo_<envUuid>_<logical>` but are not referenced by any Secret row.
 */
export function findOrphanComposedKeysInIndex(
  indexKeys: string[],
  state: AppState
): string[] {
  const expected = expectedComposedKeysFromWorkspace(state);
  const orphans: string[] = [];
  for (const key of indexKeys) {
    if (!parseEchoComposedStorageKey(key)) continue;
    if (!expected.has(key)) orphans.push(key);
  }
  orphans.sort();
  return orphans;
}

export type SecretPlaceholderResolution = {
  environmentId: string;
  logicalName: string;
  ok: boolean;
};

export function missingLogicalNamesByEnv(
  resolutions: SecretPlaceholderResolution[]
): Record<string, string[]> {
  const acc = new Map<string, Set<string>>();
  for (const r of resolutions) {
    if (r.ok) continue;
    if (!acc.has(r.environmentId)) acc.set(r.environmentId, new Set());
    acc.get(r.environmentId)!.add(r.logicalName);
  }
  const out: Record<string, string[]> = {};
  for (const [k, v] of acc) {
    out[k] = [...v].sort();
  }
  return out;
}

export function isLogicalSecretMissing(
  missingByEnv: Record<string, string[]>,
  environmentId: string,
  logicalName: string
): boolean {
  const list = missingByEnv[environmentId];
  if (!list) return false;
  return list.includes(logicalName);
}
