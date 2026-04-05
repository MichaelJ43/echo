import type { AppState, CollectionNode } from "../types";
import {
  findRequest,
  firstRequestId,
  requestToNode,
} from "./collection";

export function collectEnvironmentIdsFromTree(
  nodes: CollectionNode[]
): Set<string> {
  const ids = new Set<string>();
  function walk(ns: CollectionNode[]) {
    for (const n of ns) {
      if (n.nodeType === "request") {
        ids.add(n.environmentId);
      } else {
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return ids;
}

export function findFolderNodeById(
  nodes: CollectionNode[],
  id: string
): CollectionNode | null {
  for (const n of nodes) {
    if (n.nodeType === "folder") {
      if (n.id === id) return n;
      const inner = findFolderNodeById(n.children, id);
      if (inner) return inner;
    }
  }
  return null;
}

/** Build a workspace JSON payload for one folder (subtree) and environments used under it. */
export function sliceWorkspaceForFolderExport(
  state: AppState,
  folderId: string
): AppState | null {
  const folder = findFolderNodeById(state.collections, folderId);
  if (!folder || folder.nodeType !== "folder") return null;
  const subtree = JSON.parse(JSON.stringify(folder)) as CollectionNode;
  const envIds = collectEnvironmentIdsFromTree([subtree]);
  const environments = state.environments.filter((e) => envIds.has(e.id));
  const fid = firstRequestId([subtree]);
  return {
    version: state.version,
    environments,
    collections: [subtree],
    activeRequestId: fid,
  };
}

/** Build a workspace JSON payload for a single request and its environment. */
export function sliceWorkspaceForRequestExport(
  state: AppState,
  requestId: string
): AppState | null {
  const req = findRequest(state.collections, requestId);
  if (!req) return null;
  const node = requestToNode(req);
  const envIds = new Set([req.environmentId]);
  const environments = state.environments.filter((e) => envIds.has(e.id));
  return {
    version: state.version,
    environments,
    collections: [node],
    activeRequestId: requestId,
  };
}

/** Safe basename for save dialogs (no path separators or illegal Windows filename chars). */
export function sanitizeExportFilenameBase(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "echo-export";
}
