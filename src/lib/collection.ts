import type { CollectionNode, RequestItem } from "../types";

function newId(): string {
  return crypto.randomUUID();
}

/** Top-level folder (collection). */
export function createFolderNode(name: string): CollectionNode {
  return {
    nodeType: "folder",
    id: newId(),
    name,
    children: [],
  };
}

export function createRequestItem(name: string, environmentId: string): RequestItem {
  return {
    id: newId(),
    name,
    environmentId,
    method: "GET",
    url: "",
    headers: [],
    queryParams: [],
    body: "",
    bodyType: "none",
    auth: { type: "none" },
    script: "",
  };
}

export function requestToNode(r: RequestItem): CollectionNode {
  return { nodeType: "request", ...r };
}

/** Append a folder at the root of the tree. */
export function appendRootFolder(
  nodes: CollectionNode[],
  folder: CollectionNode
): CollectionNode[] {
  if (folder.nodeType !== "folder") return nodes;
  return [...nodes, folder];
}

/** Insert a child folder or request inside the folder with `folderId`. */
export function addChildToFolder(
  nodes: CollectionNode[],
  folderId: string,
  child: CollectionNode
): CollectionNode[] {
  return nodes.map((n) => {
    if (n.nodeType === "folder") {
      if (n.id === folderId) {
        return { ...n, children: [...n.children, child] };
      }
      return {
        ...n,
        children: addChildToFolder(n.children, folderId, child),
      };
    }
    return n;
  });
}

/** Remove a folder or request anywhere in the tree by id. */
export function removeNodeById(
  nodes: CollectionNode[],
  id: string
): CollectionNode[] {
  const result: CollectionNode[] = [];
  for (const n of nodes) {
    if (n.id === id) continue;
    if (n.nodeType === "folder") {
      result.push({ ...n, children: removeNodeById(n.children, id) });
    } else {
      result.push(n);
    }
  }
  return result;
}

export function findRequest(
  nodes: CollectionNode[],
  id: string
): RequestItem | null {
  for (const n of nodes) {
    if (n.nodeType === "request" && n.id === id) return n;
    if (n.nodeType === "folder") {
      const found = findRequest(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findNodeById(
  nodes: CollectionNode[],
  id: string
): CollectionNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.nodeType === "folder") {
      const inner = findNodeById(n.children, id);
      if (inner) return inner;
    }
  }
  return null;
}

export function mapEveryRequest(
  nodes: CollectionNode[],
  fn: (r: RequestItem) => RequestItem
): CollectionNode[] {
  return nodes.map((n) => {
    if (n.nodeType === "request") {
      const { nodeType: _, ...rest } = n;
      return { nodeType: "request" as const, ...fn(rest as RequestItem) };
    }
    return {
      ...n,
      children: mapEveryRequest(n.children, fn),
    };
  });
}

export function mapCollection(
  nodes: CollectionNode[],
  id: string,
  fn: (r: RequestItem) => RequestItem
): CollectionNode[] {
  return nodes.map((n) => {
    if (n.nodeType === "request") {
      if (n.id === id) {
        const { nodeType: _, ...rest } = n;
        return { nodeType: "request" as const, ...fn(rest as RequestItem) };
      }
      return n;
    }
    return {
      ...n,
      children: mapCollection(n.children, id, fn),
    };
  });
}

export function renameFolderById(
  nodes: CollectionNode[],
  folderId: string,
  name: string
): CollectionNode[] {
  return nodes.map((n) => {
    if (n.nodeType === "folder") {
      if (n.id === folderId) {
        return { ...n, name };
      }
      return {
        ...n,
        children: renameFolderById(n.children, folderId, name),
      };
    }
    return n;
  });
}

export function firstRequestId(nodes: CollectionNode[]): string | null {
  for (const n of nodes) {
    if (n.nodeType === "request") return n.id;
    if (n.nodeType === "folder") {
      const inner = firstRequestId(n.children);
      if (inner) return inner;
    }
  }
  return null;
}

/** All request node ids in the tree (for pruning ephemeral per-request caches). */
export function allRequestIds(nodes: CollectionNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (ns: CollectionNode[]) => {
    for (const n of ns) {
      if (n.nodeType === "request") ids.add(n.id);
      else walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

function containsNodeId(nodes: CollectionNode[], id: string): boolean {
  for (const n of nodes) {
    if (n.id === id) return true;
    if (n.nodeType === "folder" && containsNodeId(n.children, id)) return true;
  }
  return false;
}

/** True if `maybeDescendantId` appears in the subtree of the folder `ancestorFolderId`. */
export function isDescendantOfFolder(
  nodes: CollectionNode[],
  ancestorFolderId: string,
  maybeDescendantId: string
): boolean {
  for (const n of nodes) {
    if (n.nodeType === "folder" && n.id === ancestorFolderId) {
      return containsNodeId(n.children, maybeDescendantId);
    }
    if (n.nodeType === "folder") {
      if (isDescendantOfFolder(n.children, ancestorFolderId, maybeDescendantId)) {
        return true;
      }
    }
  }
  return false;
}

/** True if `requestId` appears anywhere under `nodes`. */
export function collectionContainsRequestId(
  nodes: CollectionNode[],
  requestId: string
): boolean {
  for (const n of nodes) {
    if (n.nodeType === "request" && n.id === requestId) return true;
    if (n.nodeType === "folder" && collectionContainsRequestId(n.children, requestId)) {
      return true;
    }
  }
  return false;
}

/** Direct child of `folder` that lies on the path to `requestId` (folder or request). */
export function firstChildOnPathToRequest(
  folder: CollectionNode & { nodeType: "folder" },
  requestId: string
): CollectionNode | null {
  for (const c of folder.children) {
    if (c.nodeType === "request" && c.id === requestId) return c;
    if (c.nodeType === "folder" && collectionContainsRequestId(c.children, requestId)) {
      return c;
    }
  }
  return null;
}

/**
 * Children to render under a folder in the tree UI.
 * - Normal: all children when not collapsed.
 * - Collapsed + active request inside: only the single branch toward that request.
 * - `pathOnlyDescent`: parent already in that branch mode — keep showing only the path (hide siblings).
 */
export function visibleFolderChildren(
  folder: CollectionNode & { nodeType: "folder" },
  activeRequestId: string | null,
  collapsedFolderIds: Record<string, true>,
  pathOnlyDescent: boolean
): CollectionNode[] {
  const contains =
    !!activeRequestId &&
    collectionContainsRequestId(folder.children, activeRequestId);
  const collapsed = collapsedFolderIds[folder.id] === true;

  if (pathOnlyDescent || (collapsed && contains)) {
    if (!activeRequestId) return [];
    const next = firstChildOnPathToRequest(folder, activeRequestId);
    return next ? [next] : [];
  }
  if (collapsed) return [];
  return folder.children;
}

/** Pass to child folders/list when rendering `visibleFolderChildren` in path-only mode. */
export function nextPathOnlyDescent(
  folder: CollectionNode & { nodeType: "folder" },
  activeRequestId: string | null,
  collapsedFolderIds: Record<string, true>,
  pathOnlyDescent: boolean
): boolean {
  const contains =
    !!activeRequestId &&
    collectionContainsRequestId(folder.children, activeRequestId);
  const collapsed = collapsedFolderIds[folder.id] === true;
  return pathOnlyDescent || (collapsed && contains);
}

/** Folder ids from root down to the parent of the given request (empty if request is at root). */
export function findAncestorFolderIdsForRequest(
  nodes: CollectionNode[],
  requestId: string,
  prefix: string[] = []
): string[] | null {
  for (const n of nodes) {
    if (n.nodeType === "request" && n.id === requestId) return prefix;
    if (n.nodeType === "folder") {
      const inner = findAncestorFolderIdsForRequest(n.children, requestId, [
        ...prefix,
        n.id,
      ]);
      if (inner) return inner;
    }
  }
  return null;
}

export function findNodeLocation(
  nodes: CollectionNode[],
  id: string,
  parentId: string | null = null
): { parentId: string | null; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) return { parentId, index: i };
    if (n.nodeType === "folder") {
      const inner = findNodeLocation(n.children, id, n.id);
      if (inner) return inner;
    }
  }
  return null;
}

/** Removes the first node with `id` and returns it with the updated tree. */
export function extractNode(
  nodes: CollectionNode[],
  id: string
): { node: CollectionNode | null; nodes: CollectionNode[] } {
  const out: CollectionNode[] = [];
  let extracted: CollectionNode | null = null;
  for (const n of nodes) {
    if (n.id === id) {
      extracted = n;
      continue;
    }
    if (n.nodeType === "folder") {
      const inner = extractNode(n.children, id);
      if (inner.node) {
        extracted = inner.node;
        out.push({ ...n, children: inner.nodes });
      } else {
        out.push(n);
      }
    } else {
      out.push(n);
    }
  }
  return { node: extracted, nodes: out };
}

export function insertChildAt(
  nodes: CollectionNode[],
  parentId: string | null,
  index: number,
  child: CollectionNode
): CollectionNode[] {
  if (parentId === null) {
    const next = [...nodes];
    next.splice(index, 0, child);
    return next;
  }
  return nodes.map((n) => {
    if (n.nodeType !== "folder") return n;
    if (n.id === parentId) {
      const ch = [...n.children];
      ch.splice(index, 0, child);
      return { ...n, children: ch };
    }
    return { ...n, children: insertChildAt(n.children, parentId, index, child) };
  });
}

/**
 * Moves a node to `dest` in the parent's children array (`index` is the splice index).
 * Returns null if the move is invalid (e.g. folder into its own descendant).
 */
export function moveNode(
  nodes: CollectionNode[],
  nodeId: string,
  dest: { parentId: string | null; index: number }
): CollectionNode[] | null {
  const from = findNodeLocation(nodes, nodeId);
  if (!from) return null;

  const target = findNodeById(nodes, nodeId);
  if (!target) return null;
  if (target.nodeType === "folder" && dest.parentId !== null) {
    if (dest.parentId === nodeId) return null;
    if (isDescendantOfFolder(nodes, nodeId, dest.parentId)) return null;
  }

  const extracted = extractNode(nodes, nodeId);
  if (!extracted.node) return null;
  const { node, nodes: without } = extracted;

  let idx = dest.index;
  if (from.parentId === dest.parentId && from.index < dest.index) {
    idx = dest.index - 1;
  }

  return insertChildAt(without, dest.parentId, idx, node);
}
