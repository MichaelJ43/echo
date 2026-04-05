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
