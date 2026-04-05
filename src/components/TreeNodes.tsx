import { useCallback, useState, type MouseEvent } from "react";
import type { CollectionNode } from "../types";

/** Single open context menu for the folder tree (only one at a time). */
export type TreeMenuState = {
  kind: "folder" | "request";
  nodeId: string;
  x: number;
  y: number;
};

type Props = {
  nodes: CollectionNode[];
  depth?: number;
  activeId: string | null;
  treeMenu: TreeMenuState | null;
  setTreeMenu: (v: TreeMenuState | null) => void;
  onSelectRequest: (id: string) => void;
  onExportFolder: (folderId: string, folderName: string) => void | Promise<void>;
  onImport: () => void | Promise<void>;
  onRenameFolder: (folderId: string, folderName: string) => void;
  onExportRequest: (requestId: string, requestName: string) => void | Promise<void>;
  onRenameRequest: (requestId: string, requestName: string) => void;
  onCreateFolderInFolder: (parentFolderId: string) => void;
  onCreateRequestInFolder: (parentFolderId: string) => void;
  onDeleteFolder: (folderId: string, folderName: string) => void;
  onDeleteRequest: (requestId: string, requestName: string) => void;
};

export function TreeNodes({
  nodes,
  depth = 0,
  activeId,
  treeMenu,
  setTreeMenu,
  onSelectRequest,
  onExportFolder,
  onImport,
  onRenameFolder,
  onExportRequest,
  onRenameRequest,
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
          treeMenu={treeMenu}
          setTreeMenu={setTreeMenu}
          onSelectRequest={onSelectRequest}
          onExportFolder={onExportFolder}
          onImport={onImport}
          onRenameFolder={onRenameFolder}
          onExportRequest={onExportRequest}
          onRenameRequest={onRenameRequest}
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
  treeMenu,
  setTreeMenu,
  onSelectRequest,
  onExportFolder,
  onImport,
  onRenameFolder,
  onExportRequest,
  onRenameRequest,
  onCreateFolderInFolder,
  onCreateRequestInFolder,
  onDeleteFolder,
  onDeleteRequest,
}: {
  node: CollectionNode;
  depth: number;
  activeId: string | null;
  treeMenu: TreeMenuState | null;
  setTreeMenu: (v: TreeMenuState | null) => void;
  onSelectRequest: (id: string) => void;
  onExportFolder: (folderId: string, folderName: string) => void | Promise<void>;
  onImport: () => void | Promise<void>;
  onRenameFolder: (folderId: string, folderName: string) => void;
  onExportRequest: (requestId: string, requestName: string) => void | Promise<void>;
  onRenameRequest: (requestId: string, requestName: string) => void;
  onCreateFolderInFolder: (parentFolderId: string) => void;
  onCreateRequestInFolder: (parentFolderId: string) => void;
  onDeleteFolder: (folderId: string, folderName: string) => void;
  onDeleteRequest: (requestId: string, requestName: string) => void;
}) {
  /** Only used when node is a folder; request rows ignore this state. */
  const [expanded, setExpanded] = useState(true);

  const onCtxFolder = useCallback(
    (e: MouseEvent) => {
      if (node.nodeType !== "folder") return;
      e.preventDefault();
      setTreeMenu({
        kind: "folder",
        nodeId: node.id,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [node, setTreeMenu]
  );

  const onCtxRequest = useCallback(
    (e: MouseEvent) => {
      if (node.nodeType !== "request") return;
      e.preventDefault();
      e.stopPropagation();
      setTreeMenu({
        kind: "request",
        nodeId: node.id,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [node, setTreeMenu]
  );

  if (node.nodeType === "folder") {
    const showFolderMenu =
      treeMenu?.kind === "folder" && treeMenu.nodeId === node.id;

    return (
      <div>
        <div
          className="tree-row tree-row-folder"
          style={{ paddingLeft: 8 + depth * 12 }}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          data-tree-context
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded((v) => !v);
            }
          }}
          onContextMenu={onCtxFolder}
          data-testid={`folder-${node.id}`}
        >
          <span className="tree-chevron" aria-hidden>
            {expanded ? "▼" : "▶"}
          </span>
          <span aria-hidden>📁</span>
          <span>{node.name}</span>
        </div>
        {showFolderMenu ? (
          <div
            className="context-menu"
            style={{ left: treeMenu.x, top: treeMenu.y }}
            data-testid="folder-context-menu"
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-testid="create-folder-in-folder"
              onClick={() => {
                setTreeMenu(null);
                onCreateFolderInFolder(node.id);
              }}
            >
              Create folder
            </button>
            <button
              type="button"
              data-testid="create-request-in-folder"
              onClick={() => {
                setTreeMenu(null);
                onCreateRequestInFolder(node.id);
              }}
            >
              Create request
            </button>
            <div className="context-menu-sep" role="separator" />
            <button
              type="button"
              data-testid="export-folder"
              onClick={() => {
                setTreeMenu(null);
                void onExportFolder(node.id, node.name);
              }}
            >
              Export folder…
            </button>
            <button
              type="button"
              data-testid="import-workspace"
              onClick={() => {
                setTreeMenu(null);
                void onImport();
              }}
            >
              Import workspace
            </button>
            <div className="context-menu-sep" role="separator" />
            <button
              type="button"
              data-testid="rename-folder"
              onClick={() => {
                setTreeMenu(null);
                onRenameFolder(node.id, node.name);
              }}
            >
              Rename folder…
            </button>
            <div className="context-menu-sep" role="separator" />
            <button
              type="button"
              className="danger"
              data-testid="delete-folder"
              onClick={() => {
                setTreeMenu(null);
                onDeleteFolder(node.id, node.name);
              }}
            >
              Delete folder
            </button>
          </div>
        ) : null}
        {expanded ? (
          <TreeNodes
            nodes={node.children}
            depth={depth + 1}
            activeId={activeId}
            treeMenu={treeMenu}
            setTreeMenu={setTreeMenu}
            onSelectRequest={onSelectRequest}
            onExportFolder={onExportFolder}
            onImport={onImport}
            onRenameFolder={onRenameFolder}
            onExportRequest={onExportRequest}
            onRenameRequest={onRenameRequest}
            onCreateFolderInFolder={onCreateFolderInFolder}
            onCreateRequestInFolder={onCreateRequestInFolder}
            onDeleteFolder={onDeleteFolder}
            onDeleteRequest={onDeleteRequest}
          />
        ) : null}
      </div>
    );
  }

  const active = activeId === node.id;
  const showRequestMenu =
    treeMenu?.kind === "request" && treeMenu.nodeId === node.id;

  return (
    <>
      <div
        className={`tree-row${active ? " active" : ""}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        data-tree-context
        onClick={() => onSelectRequest(node.id)}
        onContextMenu={onCtxRequest}
        data-testid={`request-${node.id}`}
      >
        <span className="tree-indent" aria-hidden />
        <span aria-hidden>▸</span>
        <span>{node.name}</span>
      </div>
      {showRequestMenu ? (
        <div
          className="context-menu"
          style={{ left: treeMenu.x, top: treeMenu.y }}
          data-testid="request-context-menu"
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-testid="export-request"
            onClick={() => {
              setTreeMenu(null);
              void onExportRequest(node.id, node.name);
            }}
          >
            Export request
          </button>
          <button
            type="button"
            data-testid="rename-request"
            onClick={() => {
              setTreeMenu(null);
              onRenameRequest(node.id, node.name);
            }}
          >
            Rename request
          </button>
          <div className="context-menu-sep" role="separator" />
          <button
            type="button"
            className="danger"
            data-testid="delete-request"
            onClick={() => {
              setTreeMenu(null);
              onDeleteRequest(node.id, node.name);
            }}
          >
            Delete request
          </button>
        </div>
      ) : null}
    </>
  );
}
