import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MutableRefObject,
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

export type MoveNodeDest = { parentId: string | null; index: number };

type DropTarget =
  | { kind: "between"; parentId: string | null; beforeIndex: number }
  | { kind: "into"; folderId: string };

type DnDContextValue = {
  draggingId: string | null;
  /** Set synchronously in drag handlers so dragover can preventDefault before React re-renders. */
  draggingIdRef: MutableRefObject<string | null>;
  setDraggingId: (id: string | null) => void;
  dropTarget: DropTarget | null;
  setDropTarget: (t: DropTarget | null) => void;
  onMoveNode: (nodeId: string, dest: MoveNodeDest) => void;
};

function isOurTreeDrag(ctx: DnDContextValue, e: DragEvent): boolean {
  if (ctx.draggingIdRef.current) return true;
  if (ctx.draggingId) return true;
  return Array.from(e.dataTransfer.types).includes("text/plain");
}

const TreeDnDContext = createContext<DnDContextValue | null>(null);

type Props = {
  nodes: CollectionNode[];
  depth?: number;
  parentFolderId?: string | null;
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
  /** `true` means the folder row is collapsed. */
  collapsedFolderIds: Record<string, true>;
  onToggleFolderCollapsed: (folderId: string) => void;
  onEnsureFolderExpanded: (folderId: string) => void;
  onMoveNode: (nodeId: string, dest: MoveNodeDest) => void;
};

export function TreeNodes(props: Props) {
  const [draggingId, setDraggingIdState] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const setDraggingId = useCallback((id: string | null) => {
    draggingIdRef.current = id;
    setDraggingIdState(id);
  }, []);

  const ctx = useMemo<DnDContextValue>(
    () => ({
      draggingId,
      draggingIdRef,
      setDraggingId,
      dropTarget,
      setDropTarget,
      onMoveNode: props.onMoveNode,
    }),
    [draggingId, setDraggingId, dropTarget, props.onMoveNode]
  );

  return (
    <TreeDnDContext.Provider value={ctx}>
      <TreeNodesList {...props} parentFolderId={props.parentFolderId ?? null} />
    </TreeDnDContext.Provider>
  );
}

function TreeNodesList(props: Props & { parentFolderId: string | null }) {
  const {
    nodes,
    depth = 0,
    parentFolderId,
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
    collapsedFolderIds,
    onToggleFolderCollapsed,
    onEnsureFolderExpanded,
    onMoveNode,
  } = props;

  const common = {
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
    collapsedFolderIds,
    onToggleFolderCollapsed,
    onEnsureFolderExpanded,
    onMoveNode,
  };

  if (nodes.length === 0) {
    return <DropGap parentId={parentFolderId} beforeIndex={0} />;
  }

  return (
    <>
      {nodes.map((n, i) => (
        <Fragment key={n.id}>
          <DropGap parentId={parentFolderId} beforeIndex={i} />
          <TreeNode
            node={n}
            indexInParent={i}
            parentFolderId={parentFolderId}
            depth={depth}
            {...common}
          />
        </Fragment>
      ))}
      <DropGap parentId={parentFolderId} beforeIndex={nodes.length} />
    </>
  );
}

function DropGap({
  parentId,
  beforeIndex,
}: {
  parentId: string | null;
  beforeIndex: number;
}) {
  const ctx = useContext(TreeDnDContext);
  if (!ctx) return null;

  const active =
    ctx.dropTarget?.kind === "between" &&
    ctx.dropTarget.parentId === parentId &&
    ctx.dropTarget.beforeIndex === beforeIndex;

  return (
    <div
      className={`tree-drop-gap${active ? " tree-drop-gap--active" : ""}`}
      onDragOver={(e: DragEvent) => {
        if (!ctx || !isOurTreeDrag(ctx, e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        if (!ctx.draggingIdRef.current && !ctx.draggingId) return;
        ctx.setDropTarget({ kind: "between", parentId, beforeIndex });
      }}
      onDragLeave={(e) => {
        const next = e.relatedTarget;
        if (next && e.currentTarget.contains(next as Node)) return;
        const t = ctx.dropTarget;
        if (
          t?.kind === "between" &&
          t.parentId === parentId &&
          t.beforeIndex === beforeIndex
        ) {
          ctx.setDropTarget(null);
        }
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.dataTransfer.getData("text/plain");
        ctx.setDropTarget(null);
        ctx.setDraggingId(null);
        if (!id) return;
        ctx.onMoveNode(id, { parentId, index: beforeIndex });
      }}
    />
  );
}

function TreeNode({
  node,
  depth,
  indexInParent: _indexInParent,
  parentFolderId: _parentFolderId,
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
  collapsedFolderIds,
  onToggleFolderCollapsed,
  onEnsureFolderExpanded,
  onMoveNode,
}: {
  node: CollectionNode;
  depth: number;
  indexInParent: number;
  parentFolderId: string | null;
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
  collapsedFolderIds: Record<string, true>;
  onToggleFolderCollapsed: (folderId: string) => void;
  onEnsureFolderExpanded: (folderId: string) => void;
  onMoveNode: (nodeId: string, dest: MoveNodeDest) => void;
}) {
  const ctx = useContext(TreeDnDContext);

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
      onEnsureFolderExpanded(node.id);
    }
  }, [treeDraft, node, onEnsureFolderExpanded]);

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
    const expanded = collapsedFolderIds[node.id] !== true;
    const showFolderMenu =
      treeMenu?.kind === "folder" && treeMenu.nodeId === node.id;

    const showNewFolderDraft =
      treeDraft?.mode === "new-folder" && treeDraft.parentId === node.id;
    const showNewRequestDraft =
      treeDraft?.mode === "new-request" && treeDraft.parentId === node.id;

    const dropIntoActive =
      ctx?.dropTarget?.kind === "into" && ctx.dropTarget.folderId === node.id;

    return (
      <div>
        <div
          className={`tree-row tree-row-folder${dropIntoActive ? " tree-row-folder--drop-into" : ""}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          data-tree-context
          data-tree-folder-id={node.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", node.id);
            e.dataTransfer.effectAllowed = "move";
            ctx?.setDraggingId(node.id);
          }}
          onDragEnd={() => {
            ctx?.setDraggingId(null);
            ctx?.setDropTarget(null);
          }}
          onDragOver={(e) => {
            if (!ctx || !isOurTreeDrag(ctx, e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const dragSource = ctx.draggingIdRef.current ?? ctx.draggingId;
            if (!dragSource || dragSource === node.id) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const mid = y / rect.height;
            if (mid > 0.3 && mid < 0.7) {
              ctx.setDropTarget({ kind: "into", folderId: node.id });
            }
          }}
          onDragLeave={(e) => {
            if (!ctx?.dropTarget || ctx.dropTarget.kind !== "into") return;
            if (ctx.dropTarget.folderId !== node.id) return;
            const next = e.relatedTarget;
            if (next && e.currentTarget.contains(next as Node)) return;
            ctx.setDropTarget(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = e.dataTransfer.getData("text/plain");
            ctx?.setDropTarget(null);
            ctx?.setDraggingId(null);
            if (!id || !ctx) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const mid = y / rect.height;
            if (mid <= 0.3 || mid >= 0.7) return;
            onMoveNode(id, { parentId: node.id, index: node.children.length });
          }}
          onClick={() => {
            if (!renamingFolder) onToggleFolderCollapsed(node.id);
          }}
          onKeyDown={(e) => {
            if (renamingFolder) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggleFolderCollapsed(node.id);
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
            <TreeNodesList
              nodes={node.children}
              depth={depth + 1}
              parentFolderId={node.id}
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
              collapsedFolderIds={collapsedFolderIds}
              onToggleFolderCollapsed={onToggleFolderCollapsed}
              onEnsureFolderExpanded={onEnsureFolderExpanded}
              onMoveNode={onMoveNode}
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
        data-tree-request-id={node.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", node.id);
          e.dataTransfer.effectAllowed = "move";
          ctx?.setDraggingId(node.id);
        }}
        onDragEnd={() => {
          ctx?.setDraggingId(null);
          ctx?.setDropTarget(null);
        }}
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
