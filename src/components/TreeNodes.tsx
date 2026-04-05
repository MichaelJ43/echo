import { useCallback, useEffect, useState, type MouseEvent } from "react";
import type { CollectionNode } from "../types";

type Props = {
  nodes: CollectionNode[];
  depth?: number;
  activeId: string | null;
  onSelectRequest: (id: string) => void;
  onExport: () => void | Promise<void>;
  onImport: () => void | Promise<void>;
};

export function TreeNodes({
  nodes,
  depth = 0,
  activeId,
  onSelectRequest,
  onExport,
  onImport,
}: Props) {
  return (
    <>
      {nodes.map((n) => (
        <TreeNode
          key={n.id}
          node={n}
          depth={depth}
          activeId={activeId}
          onSelectRequest={onSelectRequest}
          onExport={onExport}
          onImport={onImport}
        />
      ))}
    </>
  );
}

function TreeNode({
  node,
  depth,
  activeId,
  onSelectRequest,
  onExport,
  onImport,
}: {
  node: CollectionNode;
  depth: number;
  activeId: string | null;
  onSelectRequest: (id: string) => void;
  onExport: () => void | Promise<void>;
  onImport: () => void | Promise<void>;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const onCtx = useCallback(
    (e: MouseEvent) => {
      if (node.nodeType !== "folder") return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    },
    [node]
  );

  if (node.nodeType === "folder") {
    return (
      <div>
        <div
          className="tree-row"
          style={{ paddingLeft: 8 + depth * 12 }}
          onContextMenu={onCtx}
          data-testid={`folder-${node.id}`}
        >
          <span aria-hidden>📁</span>
          <span>{node.name}</span>
        </div>
        {menu ? (
          <div
            className="context-menu"
            style={{ left: menu.x, top: menu.y }}
            data-testid="folder-context-menu"
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-testid="export-workspace"
              onClick={() => {
                setMenu(null);
                void onExport();
              }}
            >
              Export workspace…
            </button>
            <button
              type="button"
              data-testid="import-workspace"
              onClick={() => {
                setMenu(null);
                void onImport();
              }}
            >
              Import workspace…
            </button>
          </div>
        ) : null}
        <TreeNodes
          nodes={node.children}
          depth={depth + 1}
          activeId={activeId}
          onSelectRequest={onSelectRequest}
          onExport={onExport}
          onImport={onImport}
        />
      </div>
    );
  }

  const active = activeId === node.id;
  return (
    <div
      className={`tree-row${active ? " active" : ""}`}
      style={{ paddingLeft: 8 + depth * 12 }}
      onClick={() => onSelectRequest(node.id)}
      data-testid={`request-${node.id}`}
    >
      <span className="tree-indent" aria-hidden />
      <span aria-hidden>▸</span>
      <span>{node.name}</span>
    </div>
  );
}
