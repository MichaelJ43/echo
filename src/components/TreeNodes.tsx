import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { CollectionNode } from "../types";
import type { TreeInlineDraft } from "../lib/treeDraft";
import { TreeInlineNameRow } from "./TreeInlineNameRow";

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
  treeDraft: TreeInlineDraft | null;
  colonDraftError: boolean;
  onDraftValueChange: (value: string) => void;
  onDraftConfirm: () => void;
  onDraftCancel: () => void;
  onSelectRequest: (id: string) => void;
  onExportFolder: (folderId: string, folderName: string) => void | Promise<void>;
  onImportUnderFolder: (folderId: string) => void | Promise<void>;
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
  treeDraft,
  colonDraftError,
  onDraftValueChange,
  onDraftConfirm,
  onDraftCancel,
  onSelectRequest,
  onExportFolder,
  onImportUnderFolder,
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
          treeDraft={treeDraft}
          colonDraftError={colonDraftError}
          onDraftValueChange={onDraftValueChange}
          onDraftConfirm={onDraftConfirm}
          onDraftCancel={onDraftCancel}
          onSelectRequest={onSelectRequest}
          onExportFolder={onExportFolder}
          onImportUnderFolder={onImportUnderFolder}
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
  treeDraft,
  colonDraftError,
  onDraftValueChange,
  onDraftConfirm,
  onDraftCancel,
  onSelectRequest,
  onExportFolder,
  onImportUnderFolder,
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
  treeDraft: TreeInlineDraft | null;
  colonDraftError: boolean;
  onDraftValueChange: (value: string) => void;
  onDraftConfirm: () => void;
  onDraftCancel: () => void;
  onSelectRequest: (id: string) => void;
  onExportFolder: (folderId: string, folderName: string) => void | Promise<void>;
  onImportUnderFolder: (folderId: string) => void | Promise<void>;
  onRenameFolder: (folderId: string, folderName: string) => void;
  onExportRequest: (requestId: string, requestName: string) => void | Promise<void>;
  onRenameRequest: (requestId: string, requestName: string) => void;
  onCreateFolderInFolder: (parentFolderId: string) => void;
  onCreateRequestInFolder: (parentFolderId: string) => void;
  onDeleteFolder: (folderId: string, folderName: string) => void;
  onDeleteRequest: (requestId: string, requestName: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const renamingFolder =
    treeDraft?.mode === "rename-folder" && treeDraft.folderId === node.id;
  const renamingRequest =
    node.nodeType === "request" &&
    treeDraft?.mode === "rename-request" &&
    treeDraft.requestId === node.id;

  useEffect(() => {
    if (!treeDraft) return;
    if (node.nodeType !== "folder") return;
    if (
      (treeDraft.mode === "new-folder" || treeDraft.mode === "new-request") &&
      treeDraft.parentId === node.id
    ) {
      setExpanded(true);
    }
  }, [treeDraft, node]);

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

    const showNewFolderDraft =
      treeDraft?.mode === "new-folder" &&
      treeDraft.parentId === node.id;
    const showNewRequestDraft =
      treeDraft?.mode === "new-request" &&
      treeDraft.parentId === node.id;

    return (
      <div>
        <div
          className="tree-row tree-row-folder"
          style={{ paddingLeft: 8 + depth * 12 }}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          data-tree-context
          onClick={() => {
            if (!renamingFolder) setExpanded((v) => !v);
          }}
          onKeyDown={(e) => {
            if (renamingFolder) return;
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
          {renamingFolder && treeDraft?.mode === "rename-folder" ? (
            <TreeInlineNameRow
              depth={0}
              embedded
              draft={treeDraft}
              colonError={colonDraftError}
              onChange={onDraftValueChange}
              onConfirm={onDraftConfirm}
              onCancel={onDraftCancel}
              variant="folder"
            />
          ) : (
            <span>{node.name}</span>
          )}
        </div>
        {showFolderMenu ? (
          <PositionedContextMenu
            anchorX={treeMenu.x}
            anchorY={treeMenu.y}
            testId="folder-context-menu"
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
              Export folder
            </button>
            <button
              type="button"
              data-testid="import-workspace"
              onClick={() => {
                setTreeMenu(null);
                void onImportUnderFolder(node.id);
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
              Rename folder
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
          </PositionedContextMenu>
        ) : null}
        {expanded ? (
          <>
            <TreeNodes
              nodes={node.children}
              depth={depth + 1}
              activeId={activeId}
              treeMenu={treeMenu}
              setTreeMenu={setTreeMenu}
              treeDraft={treeDraft}
              colonDraftError={colonDraftError}
              onDraftValueChange={onDraftValueChange}
              onDraftConfirm={onDraftConfirm}
              onDraftCancel={onDraftCancel}
              onSelectRequest={onSelectRequest}
              onExportFolder={onExportFolder}
              onImportUnderFolder={onImportUnderFolder}
              onRenameFolder={onRenameFolder}
              onExportRequest={onExportRequest}
              onRenameRequest={onRenameRequest}
              onCreateFolderInFolder={onCreateFolderInFolder}
              onCreateRequestInFolder={onCreateRequestInFolder}
              onDeleteFolder={onDeleteFolder}
              onDeleteRequest={onDeleteRequest}
            />
            {showNewFolderDraft && treeDraft?.mode === "new-folder" ? (
              <TreeInlineNameRow
                depth={depth + 1}
                draft={treeDraft}
                colonError={colonDraftError}
                onChange={onDraftValueChange}
                onConfirm={onDraftConfirm}
                onCancel={onDraftCancel}
                variant="folder"
              />
            ) : null}
            {showNewRequestDraft && treeDraft?.mode === "new-request" ? (
              <TreeInlineNameRow
                depth={depth + 1}
                draft={treeDraft}
                colonError={colonDraftError}
                onChange={onDraftValueChange}
                onConfirm={onDraftConfirm}
                onCancel={onDraftCancel}
                variant="request"
              />
            ) : null}
          </>
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
        {renamingRequest && treeDraft?.mode === "rename-request" ? (
          <TreeInlineNameRow
            depth={0}
            embedded
            draft={treeDraft}
            colonError={colonDraftError}
            onChange={onDraftValueChange}
            onConfirm={onDraftConfirm}
            onCancel={onDraftCancel}
            variant="request"
          />
        ) : (
          <span>{node.name}</span>
        )}
      </div>
      {showRequestMenu ? (
        <PositionedContextMenu
          anchorX={treeMenu.x}
          anchorY={treeMenu.y}
          testId="request-context-menu"
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
        </PositionedContextMenu>
      ) : null}
    </>
  );
}

function PositionedContextMenu({
  anchorX,
  anchorY,
  testId,
  onClick,
  children,
}: {
  anchorX: number;
  anchorY: number;
  testId: string;
  onClick: MouseEventHandler<HTMLDivElement>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>(() => ({
    left: anchorX,
    top: anchorY,
  }));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = anchorX;
    let top = anchorY;
    if (top + h > window.innerHeight - pad) top = anchorY - h;
    if (top < pad) top = pad;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (left < pad) left = pad;
    setStyle((prev) =>
      prev.left === left && prev.top === top ? prev : { left, top }
    );
  }, [anchorX, anchorY]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={style}
      data-testid={testId}
      role="menu"
      onClick={onClick}
    >
      {children}
    </div>
  );
}
