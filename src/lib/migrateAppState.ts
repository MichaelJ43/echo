import type {
  AppState,
  CollectionNode,
  Environment,
  KeyValue,
  RequestItem,
} from "../types";
import { mapEveryRequest } from "./collection";

function normalizeVariables(vars: KeyValue[]): KeyValue[] {
  return vars.map((v) => ({
    ...v,
    entryKind: v.entryKind ?? "variable",
  }));
}

/**
 * Normalize workspace JSON from disk or older versions: per-request `environmentId`,
 * at least one environment, no dangling env refs.
 */
export function migrateAppState(state: unknown): AppState {
  const s = state as Record<string, unknown>;
  const version = typeof s.version === "number" ? s.version : 1;
  let environments = (s.environments as Environment[]) ?? [];
  if (!Array.isArray(environments) || environments.length === 0) {
    const id = crypto.randomUUID();
    environments = [{ id, name: "Default", variables: [] }];
  }
  environments = environments.map((env) => ({
    ...env,
    variables: normalizeVariables(env.variables ?? []),
  }));
  const defaultEnvId = environments[0]!.id;
  const legacyActive =
    typeof s.activeEnvironmentId === "string" ? s.activeEnvironmentId : null;

  let collections: CollectionNode[] = Array.isArray(s.collections)
    ? (s.collections as CollectionNode[])
    : [];

  collections = mapEveryRequest(collections, (r) => {
    const cur = r as RequestItem & { environmentId?: string };
    if (cur.environmentId) return { ...r, environmentId: cur.environmentId };
    return { ...r, environmentId: legacyActive ?? defaultEnvId };
  });

  const envIds = new Set(environments.map((e) => e.id));
  collections = mapEveryRequest(collections, (r) => {
    if (envIds.has(r.environmentId)) return r;
    return { ...r, environmentId: defaultEnvId };
  });

  collections = mapEveryRequest(collections, (r) => {
    const multipartParts = r.multipartParts ?? [];
    const next: RequestItem = { ...r, multipartParts };
    if (r.bodyType === "binary" && !r.binaryBody) {
      next.binaryBody = { path: "", contentType: "" };
    }
    return next;
  });

  const activeRequestId =
    typeof s.activeRequestId === "string" ? s.activeRequestId : null;

  return {
    version,
    environments,
    collections,
    activeRequestId,
  };
}
