import { useCallback, useEffect, useState, type MouseEvent } from "react";
import type { CollectionNode } from "../types";

type Props = {
  nodes: CollectionNode[];
  depth?: number;
  activeId: string | null;
  onSelectRequest: (id: string) => void;
  onExport: () => void | Promise<void>;
  onImport: () => void | Promise<void>;
  onCreateFolderInFolder: (parentFolderId: string) => void;
  onCreateRequestInFolder: (parentFolderId: string) => void;
  onDeleteFolder: (folderId: string, folderName: string) => void;
  onDeleteRequest: (requestId: string, requestName: string) => void;
};

export function TreeNodes({
  nodes,
  depth = 0,
  activeId,
  onSelectRequest,
  onExport,
  onImport,
  onCreateFolderInFolder,
  onCreateRequestInFolder,
  onDeleteFolder,
  onDeleteRequest,
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
          onCreateFolderInFolder={onCreateFolderInFolder}
          onCreateRequestInFolder={onCreateRequestInFolder}
          onDeleteFolder={onDeleteFolder}
          onDeleteRequest={onDeleteRequest}
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
  onCreateFolderInFolder,
  onCreateRequestInFolder,
  onDeleteFolder,
  onDeleteRequest,
}: {
  node: CollectionNode;
  depth: number;
  activeId: string | null;
  onSelectRequest: (id: string) => void;
  onExport: () => void | Promise<void>;
  onImport: () => void | Promise<void>;
  onCreateFolderInFolder: (parentFolderId: string) => void;
  onCreateRequestInFolder: (parentFolderId: string) => void;
  onDeleteFolder: (folderId: string, folderName: string) => void;
  onDeleteRequest: (requestId: string, requestName: string) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const onCtxFolder = useCallback(
    (e: MouseEvent) => {
      if (node.nodeType !== "folder") return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    },
    [node]
  );

  const onCtxRequest = useCallback(
    (e: MouseEvent) => {
      if (node.nodeType !== "request") return;
      e.preventDefault();
      e.stopPropagation();
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
          onContextMenu={onCtxFolder}
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
              data-testid="create-folder-in-folder"
              onClick={() => {
                setMenu(null);
                onCreateFolderInFolder(node.id);
              }}
            >
              Create folder…
            </button>
            <button
              type="button"
              data-testid="create-request-in-folder"
              onClick={() => {
                setMenu(null);
                onCreateRequestInFolder(node.id);
              }}
            >
              Create request…
            </button>
            <div className="context-menu-sep" role="separator" />
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
            <div className="context-menu-sep" role="separator" />
            <button
              type="button"
              className="danger"
              data-testid="delete-folder"
              onClick={() => {
                setMenu(null);
                onDeleteFolder(node.id, node.name);
              }}
            >
              Delete folder…
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
          onCreateFolderInFolder={onCreateFolderInFolder}
          onCreateRequestInFolder={onCreateRequestInFolder}
          onDeleteFolder={onDeleteFolder}
          onDeleteRequest={onDeleteRequest}
        />
      </div>
    );
  }

  const active = activeId === node.id;
  return (
    <>
      <div
        className={`tree-row${active ? " active" : ""}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onSelectRequest(node.id)}
        onContextMenu={onCtxRequest}
        data-testid={`request-${node.id}`}
      >
        <span className="tree-indent" aria-hidden />
        <span aria-hidden>▸</span>
        <span>{node.name}</span>
      </div>
      {menu ? (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          data-testid="request-context-menu"
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="danger"
            data-testid="delete-request"
            onClick={() => {
              setMenu(null);
              onDeleteRequest(node.id, node.name);
            }}
          >
            Delete request…
          </button>
        </div>
      ) : null}
    </>
  );
}
