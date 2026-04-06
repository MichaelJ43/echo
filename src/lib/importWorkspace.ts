import type { AppState, CollectionNode, Environment } from "../types";
import {
  addChildToFolder,
  firstRequestId,
} from "./collection";
import { findFolderNodeById } from "./workspaceSlice";

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Reassigns every environment id, folder id, and request id so an imported
 * workspace can be merged into the current tree without collisions.
 */
export function remapImportedWorkspaceIds(imported: AppState): AppState {
  const envMap = new Map<string, string>();
  for (const e of imported.environments) {
    envMap.set(e.id, newId());
  }
  const newEnvironments: Environment[] = imported.environments.map((e) => ({
    ...e,
    id: envMap.get(e.id)!,
  }));
  const fallbackEnvId = newEnvironments[0]?.id;

  function remapNode(n: CollectionNode): CollectionNode {
    if (n.nodeType === "folder") {
      return {
        nodeType: "folder",
        id: newId(),
        name: n.name,
        children: n.children.map(remapNode),
      };
    }
    const eid =
      envMap.get(n.environmentId) ?? fallbackEnvId ?? newId();
    const { nodeType: _, ...rest } = n;
    return {
      nodeType: "request",
      ...rest,
      id: newId(),
      environmentId: eid,
    };
  }

  const newCollections = imported.collections.map(remapNode);
  const fid = firstRequestId(newCollections);

  return {
    version: imported.version,
    environments: newEnvironments,
    collections: newCollections,
    activeRequestId: fid,
  };
}

/**
 * Appends environments from `imported` and adds each root node of
 * `imported.collections` as a child of `targetFolderId`.
 */
export function mergeImportedUnderFolder(
  state: AppState,
  targetFolderId: string,
  imported: AppState
): AppState | null {
  const folder = findFolderNodeById(state.collections, targetFolderId);
  if (!folder || folder.nodeType !== "folder") return null;

  const remapped = remapImportedWorkspaceIds(imported);
  if (remapped.collections.length === 0) {
    return state;
  }

  const mergedEnvironments = [...state.environments, ...remapped.environments];
  let nextCollections = state.collections;
  for (const root of remapped.collections) {
    nextCollections = addChildToFolder(nextCollections, targetFolderId, root);
  }

  return {
    ...state,
    version: state.version,
    environments: mergedEnvironments,
    collections: nextCollections,
    activeRequestId: remapped.activeRequestId ?? state.activeRequestId,
  };
}
