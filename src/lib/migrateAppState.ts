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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return s.length === 36 && UUID_RE.test(s);
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

  const envIdRemap = new Map<string, string>();
  environments = environments.map((env) => {
    if (isUuid(env.id)) return env;
    const newId = crypto.randomUUID();
    envIdRemap.set(env.id, newId);
    return { ...env, id: newId };
  });

  const defaultEnvId = environments[0]!.id;
  const legacyActive =
    typeof s.activeEnvironmentId === "string" ? s.activeEnvironmentId : null;

  let collections: CollectionNode[] = Array.isArray(s.collections)
    ? (s.collections as CollectionNode[])
    : [];

  collections = mapEveryRequest(collections, (r) => {
    const cur = r as RequestItem & { environmentId?: string };
    let eid = cur.environmentId ?? legacyActive ?? defaultEnvId;
    eid = envIdRemap.get(eid) ?? eid;
    return { ...r, environmentId: eid };
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
