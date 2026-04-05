import type { CollectionNode, RequestItem } from "../types";

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
