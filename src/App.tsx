import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  exportWorkspaceFile,
  getPaths,
  importWorkspaceFile,
  loadState,
  saveState,
  sendHttpRequest,
} from "./api";
import {
  addChildToFolder,
  appendRootFolder,
  createFolderNode,
  createRequestItem,
  findRequest,
  firstRequestId,
  mapCollection,
  mapEveryRequest,
  removeNodeById,
  renameFolderById,
  requestToNode,
} from "./lib/collection";
import {
  sanitizeExportFilenameBase,
  sliceWorkspaceForFolderExport,
  sliceWorkspaceForRequestExport,
} from "./lib/workspaceSlice";
import { runCompletionScript } from "./lib/scriptRunner";
import { variablesToMap } from "./lib/variables";
import type { AppState, Environment, HttpResponsePayload, RequestItem } from "./types";
import { AboutDialog } from "./components/AboutDialog";
import { SecretsDialog } from "./components/SecretsDialog";
import { TreeNodes, type TreeMenuState } from "./components/TreeNodes";
import { UpdatePrompt } from "./components/UpdatePrompt";
import {
  fetchUpdateIfAvailable,
  openGitHubReleasesPage,
  recordSuppressUpdateNotificationsForever,
  recordUpdatePromptDismissed,
  startUpdateCheckScheduler,
} from "./lib/updater";

const METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [paths, setPaths] = useState<{ appDataDir: string; collectionsFile: string } | null>(null);
  const [response, setResponse] = useState<HttpResponsePayload | null>(null);
  const [scriptLog, setScriptLog] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdateRef = useRef<Update | null>(null);
  const [updateBanner, setUpdateBanner] = useState<{
    currentVersion: string;
    newVersion: string;
  } | null>(null);
  const [infoToast, setInfoToast] = useState<string | null>(null);
  const [metaMenu, setMetaMenu] = useState<{ x: number; y: number } | null>(null);
  const [treeContextMenu, setTreeContextMenu] = useState<TreeMenuState | null>(
    null
  );
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    const scheduler = startUpdateCheckScheduler((u) => {
      void pendingUpdateRef.current?.close().catch(() => {});
      pendingUpdateRef.current = u;
      setUpdateBanner({ currentVersion: u.currentVersion, newVersion: u.version });
    });
    return () => scheduler.dispose();
  }, []);

  useEffect(() => {
    if (!metaMenu) return;
    const close = () => setMetaMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [metaMenu]);

  useEffect(() => {
    if (!treeContextMenu) return;
    const close = () => setTreeContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [treeContextMenu]);

  /** Suppress the browser/Electron default context menu except on tree rows, menu trigger, and inputs. */
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.closest("[data-tree-context]")) return;
      if (el.closest("[data-meta-menu-trigger]")) return;
      if (el.closest("input, textarea, select")) return;
      if (el.closest("a[href]")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu, true);
    return () => document.removeEventListener("contextmenu", onContextMenu, true);
  }, []);

  useEffect(() => {
    if (!infoToast || infoToast === "Checking for updates…") return;
    const t = window.setTimeout(() => setInfoToast(null), 4000);
    return () => clearTimeout(t);
  }, [infoToast]);

  useEffect(() => {
    void (async () => {
      try {
        const [s, p] = await Promise.all([loadState(), getPaths()]);
        let next = s;
        if (!next.activeRequestId) {
          const fid = firstRequestId(next.collections);
          if (fid) next = { ...next, activeRequestId: fid };
        }
        setState(next);
        setPaths(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!state) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveState(state).catch((e) => {
        console.error(e);
      });
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state]);

  const activeRequest = useMemo(() => {
    if (!state?.activeRequestId) return null;
    return findRequest(state.collections, state.activeRequestId);
  }, [state]);

  const activeEnv = useMemo(() => {
    if (!state || !activeRequest) return null;
    const id = activeRequest.environmentId;
    return (
      state.environments.find((e) => e.id === id) ?? state.environments[0] ?? null
    );
  }, [state, activeRequest]);

  const updateActiveRequest = useCallback(
    (fn: (r: RequestItem) => RequestItem) => {
      if (!state?.activeRequestId) return;
      const id = state.activeRequestId;
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          collections: mapCollection(prev.collections, id, fn),
        };
      });
    },
    [state?.activeRequestId]
  );

  const onSend = useCallback(async () => {
    if (!state || !activeRequest || !activeEnv) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    setScriptLog("");
    try {
      const variables = variablesToMap(activeEnv.variables);
      const res = await sendHttpRequest({
        method: activeRequest.method,
        url: activeRequest.url,
        headers: activeRequest.headers,
        queryParams: activeRequest.queryParams,
        body: activeRequest.body,
        bodyType: activeRequest.bodyType,
        auth: activeRequest.auth,
        variables,
      });
      setResponse(res);
      if (activeRequest.script.trim()) {
        const out = runCompletionScript(activeRequest.script, res);
        setScriptLog(
          [...out.logs, out.error ? `Script error: ${out.error}` : ""]
            .filter(Boolean)
            .join("\n")
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [state, activeRequest, activeEnv]);

  const onExportWorkspace = useCallback(async () => {
    if (!state) return;
    const file = await save({
      filters: [{ name: "Echo workspace", extensions: ["json"] }],
      defaultPath: "echo-workspace.json",
    });
    if (file === null) return;
    await exportWorkspaceFile(file, state);
  }, [state]);

  const onExportFolder = useCallback(
    async (folderId: string, folderName: string) => {
      if (!state) return;
      const payload = sliceWorkspaceForFolderExport(state, folderId);
      if (!payload) return;
      const base = sanitizeExportFilenameBase(folderName);
      const file = await save({
        filters: [{ name: "Echo workspace", extensions: ["json"] }],
        defaultPath: `${base}.json`,
      });
      if (file === null) return;
      await exportWorkspaceFile(file, payload);
    },
    [state]
  );

  const onExportRequest = useCallback(
    async (requestId: string, requestName: string) => {
      if (!state) return;
      const payload = sliceWorkspaceForRequestExport(state, requestId);
      if (!payload) return;
      const base = sanitizeExportFilenameBase(requestName);
      const file = await save({
        filters: [{ name: "Echo workspace", extensions: ["json"] }],
        defaultPath: `${base}.json`,
      });
      if (file === null) return;
      await exportWorkspaceFile(file, payload);
    },
    [state]
  );

  const onRenameFolder = useCallback((folderId: string, currentName: string) => {
    const name = window.prompt("Folder name", currentName);
    if (name === null) return;
    const trimmed = name.trim() || currentName;
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        collections: renameFolderById(prev.collections, folderId, trimmed),
      };
    });
  }, []);

  const onRenameRequest = useCallback((requestId: string, currentName: string) => {
    const name = window.prompt("Request name", currentName);
    if (name === null) return;
    const trimmed = name.trim() || currentName;
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        collections: mapCollection(prev.collections, requestId, (r) => ({
          ...r,
          name: trimmed,
        })),
      };
    });
  }, []);

  const onImport = useCallback(async () => {
    const file = await open({
      multiple: false,
      filters: [{ name: "Echo workspace", extensions: ["json"] }],
    });
    if (file === null || Array.isArray(file)) return;
    const imported = await importWorkspaceFile(file);
    let next = imported;
    if (!next.activeRequestId) {
      const fid = firstRequestId(next.collections);
      if (fid) next = { ...next, activeRequestId: fid };
    }
    setState(next);
  }, []);

  const onCreateRootFolder = useCallback(() => {
    const name = window.prompt("Folder name", "My folder");
    if (name === null) return;
    const trimmed = name.trim() || "My folder";
    setState((prev) => {
      if (!prev) return prev;
      const folder = createFolderNode(trimmed);
      return {
        ...prev,
        collections: appendRootFolder(prev.collections, folder),
      };
    });
  }, []);

  const onCreateFolderInFolder = useCallback((parentId: string) => {
    const name = window.prompt("Folder name", "New folder");
    if (name === null) return;
    const trimmed = name.trim() || "New folder";
    setState((prev) => {
      if (!prev) return prev;
      const child = createFolderNode(trimmed);
      return {
        ...prev,
        collections: addChildToFolder(prev.collections, parentId, child),
      };
    });
  }, []);

  const onCreateRequestInFolder = useCallback((parentId: string) => {
    const name = window.prompt("Request name", "New request");
    if (name === null) return;
    const trimmed = name.trim() || "New request";
    setState((prev) => {
      if (!prev) return prev;
      const envId = prev.environments[0]?.id;
      if (!envId) return prev;
      const req = createRequestItem(trimmed, envId);
      const node = requestToNode(req);
      return {
        ...prev,
        collections: addChildToFolder(prev.collections, parentId, node),
        activeRequestId: req.id,
      };
    });
  }, []);

  const onDeleteFolder = useCallback((folderId: string, folderName: string) => {
    if (
      !window.confirm(
        `Delete folder "${folderName}" and everything inside it?`
      )
    ) {
      return;
    }
    setState((prev) => {
      if (!prev) return prev;
      const nextCollections = removeNodeById(prev.collections, folderId);
      let nextActive = prev.activeRequestId;
      if (
        nextActive &&
        findRequest(nextCollections, nextActive) === null
      ) {
        nextActive = firstRequestId(nextCollections);
      }
      return {
        ...prev,
        collections: nextCollections,
        activeRequestId: nextActive,
      };
    });
  }, []);

  const onDeleteRequest = useCallback((requestId: string, requestName: string) => {
    if (!window.confirm(`Delete request "${requestName}"?`)) return;
    setState((prev) => {
      if (!prev) return prev;
      const nextCollections = removeNodeById(prev.collections, requestId);
      let nextActive = prev.activeRequestId;
      if (prev.activeRequestId === requestId) {
        nextActive = firstRequestId(nextCollections);
      }
      return {
        ...prev,
        collections: nextCollections,
        activeRequestId: nextActive,
      };
    });
  }, []);

  const onMetaMenuContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTreeContextMenu(null);
    setMetaMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const onMetaMenuButtonClick = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setTreeContextMenu(null);
      const r = e.currentTarget.getBoundingClientRect();
      setMetaMenu((prev) =>
        prev ? null : { x: r.left, y: r.bottom + 4 }
      );
    },
    []
  );

  const handleSetTreeMenu = useCallback((v: TreeMenuState | null) => {
    if (v) setMetaMenu(null);
    setTreeContextMenu(v);
  }, []);

  const onAddEnvironment = useCallback(() => {
    const name = window.prompt("Environment name", "New environment");
    if (name === null) return;
    const id = crypto.randomUUID();
    const trimmed = name.trim() || "New environment";
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        environments: [...s.environments, { id, name: trimmed, variables: [] }],
      };
    });
    updateActiveRequest((r) => ({ ...r, environmentId: id }));
  }, [updateActiveRequest]);

  const onRenameEnvironment = useCallback(() => {
    if (!activeEnv) return;
    const name = window.prompt("Environment name", activeEnv.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        environments: s.environments.map((e) =>
          e.id === activeEnv.id ? { ...e, name: trimmed } : e
        ),
      };
    });
  }, [activeEnv]);

  const onDuplicateEnvironment = useCallback(() => {
    if (!activeEnv) return;
    const id = crypto.randomUUID();
    const copy: Environment = {
      id,
      name: `${activeEnv.name} copy`,
      variables: activeEnv.variables.map((v) => ({ ...v })),
    };
    setState((s) => (s ? { ...s, environments: [...s.environments, copy] } : s));
    updateActiveRequest((r) => ({ ...r, environmentId: id }));
  }, [activeEnv, updateActiveRequest]);

  const onDeleteEnvironment = useCallback(() => {
    if (!state || !activeEnv) return;
    if (state.environments.length <= 1) {
      window.alert("You need at least one environment.");
      return;
    }
    if (!window.confirm(`Delete environment "${activeEnv.name}"?`)) return;
    const removedId = activeEnv.id;
    const replacement = state.environments.find((e) => e.id !== removedId)?.id;
    if (!replacement) return;
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        environments: s.environments.filter((e) => e.id !== removedId),
        collections: mapEveryRequest(s.collections, (r) =>
          r.environmentId === removedId
            ? { ...r, environmentId: replacement }
            : r
        ),
      };
    });
  }, [state, activeEnv]);

  const onCheckUpdatesManual = useCallback(async () => {
    setMetaMenu(null);
    if (!isTauri()) {
      setInfoToast("Updates are only available in the desktop app.");
      return;
    }
    setInfoToast("Checking for updates…");
    try {
      const u = await fetchUpdateIfAvailable();
      if (u) {
        void pendingUpdateRef.current?.close().catch(() => {});
        pendingUpdateRef.current = u;
        setUpdateBanner({ currentVersion: u.currentVersion, newVersion: u.version });
        setInfoToast(null);
      } else {
        setInfoToast("You're up to date.");
      }
    } catch (e) {
      setInfoToast(`Update check failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const onInstallUpdate = useCallback(async () => {
    const u = pendingUpdateRef.current;
    if (!u) return;
    try {
      await u.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onDismissUpdate = useCallback(() => {
    void pendingUpdateRef.current?.close().catch(() => {});
    pendingUpdateRef.current = null;
    recordUpdatePromptDismissed();
    setUpdateBanner(null);
  }, []);

  const onSuppressUpdates = useCallback(() => {
    void pendingUpdateRef.current?.close().catch(() => {});
    pendingUpdateRef.current = null;
    recordSuppressUpdateNotificationsForever();
    setUpdateBanner(null);
  }, []);

  if (!state) {
    return (
      <div className="request-panel">
        <p data-testid="loading">Loading…</p>
        {error ? <p className="status-err">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" data-testid="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-brand">
            <img
              className="sidebar-app-icon"
              src="/logo.png"
              alt=""
              width={26}
              height={26}
              decoding="async"
            />
            <button
              type="button"
              className="sidebar-title-label"
              data-testid="sidebar-menu-trigger"
              data-meta-menu-trigger
              title="Click or right-click for menu"
              onClick={onMetaMenuButtonClick}
              onContextMenu={onMetaMenuContextMenu}
            >
              Menu
            </button>
          </div>
          <button
            type="button"
            className="sidebar-header-action"
            title="New root folder"
            data-testid="create-root-folder"
            onClick={() => onCreateRootFolder()}
          >
            + Folder
          </button>
        </div>
        <div className="tree">
          <TreeNodes
            nodes={state.collections}
            activeId={state.activeRequestId}
            treeMenu={treeContextMenu}
            setTreeMenu={handleSetTreeMenu}
            onSelectRequest={(id) =>
              setState((s) => (s ? { ...s, activeRequestId: id } : s))
            }
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
        </div>
        {paths ? (
          <div className="path-hint" title={paths.collectionsFile}>
            Saved: {paths.collectionsFile}
          </div>
        ) : null}
      </aside>

      <main className="main">
        <div className="toolbar">
          <select
            data-testid="method-select"
            value={activeRequest?.method ?? "GET"}
            onChange={(e) =>
              updateActiveRequest((r) => ({ ...r, method: e.target.value }))
            }
            disabled={!activeRequest}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            data-testid="url-input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="https://api.example.com/resource"
            value={activeRequest?.url ?? ""}
            onChange={(e) =>
              updateActiveRequest((r) => ({ ...r, url: e.target.value }))
            }
            disabled={!activeRequest}
          />
          <button
            type="button"
            className="primary"
            data-testid="send-button"
            disabled={!activeRequest || loading}
            onClick={() => void onSend()}
          >
            {loading ? "Sending…" : "Send"}
          </button>
        </div>

        <div className="request-panel" data-testid="request-panel">
          {!activeRequest ? (
            <p className="response-meta">Select or create a request in the tree.</p>
          ) : (
            <>
              <div className="section">
                <h3>Environment</h3>
                <p className="response-meta env-scope-hint">
                  This request uses the selected environment for{" "}
                  <code>{"{{variables}}"}</code>. Other requests keep their own
                  choice.
                </p>
                <div className="env-toolbar">
                  <select
                    data-testid="environment-select"
                    aria-label="Environment for this request"
                    value={activeRequest.environmentId}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateActiveRequest((r) => ({ ...r, environmentId: v }));
                    }}
                  >
                    {state.environments.map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="env-toolbar-btn"
                    data-testid="add-environment"
                    onClick={() => onAddEnvironment()}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className="env-toolbar-btn"
                    data-testid="rename-environment"
                    onClick={() => onRenameEnvironment()}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="env-toolbar-btn"
                    data-testid="duplicate-environment"
                    onClick={() => onDuplicateEnvironment()}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="env-toolbar-btn danger"
                    data-testid="delete-environment"
                    onClick={() => onDeleteEnvironment()}
                  >
                    Delete
                  </button>
                </div>
                <div className="kv-grid" style={{ marginTop: 8 }}>
                  {(activeEnv?.variables ?? []).map((row, i) => (
                    <div className="kv-row" key={`${row.key}-${i}`}>
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => {
                          const vars = [...(activeEnv?.variables ?? [])];
                          vars[i] = { ...row, enabled: e.target.checked };
                          setState((s) => {
                            if (!s || !activeEnv) return s;
                            return {
                              ...s,
                              environments: s.environments.map((env) =>
                                env.id === activeEnv.id
                                  ? { ...env, variables: vars }
                                  : env
                              ),
                            };
                          });
                        }}
                      />
                      <input
                        placeholder="variable"
                        value={row.key}
                        onChange={(e) => {
                          const vars = [...(activeEnv?.variables ?? [])];
                          vars[i] = { ...row, key: e.target.value };
                          setState((s) => {
                            if (!s || !activeEnv) return s;
                            return {
                              ...s,
                              environments: s.environments.map((env) =>
                                env.id === activeEnv.id
                                  ? { ...env, variables: vars }
                                  : env
                              ),
                            };
                          });
                        }}
                      />
                      <input
                        placeholder="value"
                        value={row.value}
                        onChange={(e) => {
                          const vars = [...(activeEnv?.variables ?? [])];
                          vars[i] = { ...row, value: e.target.value };
                          setState((s) => {
                            if (!s || !activeEnv) return s;
                            return {
                              ...s,
                              environments: s.environments.map((env) =>
                                env.id === activeEnv.id
                                  ? { ...env, variables: vars }
                                  : env
                              ),
                            };
                          });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const vars = (activeEnv?.variables ?? []).filter(
                            (_, j) => j !== i
                          );
                          setState((s) => {
                            if (!s || !activeEnv) return s;
                            return {
                              ...s,
                              environments: s.environments.map((env) =>
                                env.id === activeEnv.id
                                  ? { ...env, variables: vars }
                                  : env
                              ),
                            };
                          });
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setState((s) => {
                        if (!s || !activeEnv) return s;
                        const row = {
                          key: "",
                          value: "",
                          enabled: true,
                        };
                        return {
                          ...s,
                          environments: s.environments.map((env) =>
                            env.id === activeEnv.id
                              ? { ...env, variables: [...env.variables, row] }
                              : env
                          ),
                        };
                      });
                    }}
                  >
                    + Variable
                  </button>
                </div>
              </div>

              <div className="section">
                <h3>Authentication</h3>
                <AuthEditor
                  auth={activeRequest.auth}
                  onChange={(auth) => updateActiveRequest((r) => ({ ...r, auth }))}
                />
              </div>

              <div className="section">
                <h3>Query</h3>
                <KeyValueEditor
                  rows={activeRequest.queryParams}
                  onChange={(queryParams) =>
                    updateActiveRequest((r) => ({ ...r, queryParams }))
                  }
                />
              </div>

              <div className="section">
                <h3>Headers</h3>
                <KeyValueEditor
                  rows={activeRequest.headers}
                  onChange={(headers) => updateActiveRequest((r) => ({ ...r, headers }))}
                />
              </div>

              <div className="section">
                <h3>Body</h3>
                <select
                  value={activeRequest.bodyType}
                  onChange={(e) =>
                    updateActiveRequest((r) => ({
                      ...r,
                      bodyType: e.target.value as RequestItem["bodyType"],
                    }))
                  }
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="raw">Raw</option>
                  <option value="form">x-www-form-urlencoded</option>
                </select>
                {activeRequest.bodyType !== "none" ? (
                  <textarea
                    className="body-input"
                    data-testid="body-input"
                    value={activeRequest.body}
                    onChange={(e) =>
                      updateActiveRequest((r) => ({ ...r, body: e.target.value }))
                    }
                  />
                ) : null}
              </div>

              <div className="section">
                <h3>Completion script</h3>
                <p className="response-meta" style={{ marginTop: 0 }}>
                  Use <code>pm.response.status()</code>, <code>pm.response.text()</code>,{" "}
                  <code>pm.response.json()</code>, <code>pm.console.log()</code>
                </p>
                <textarea
                  className="body-input"
                  style={{ minHeight: 80 }}
                  value={activeRequest.script}
                  onChange={(e) =>
                    updateActiveRequest((r) => ({ ...r, script: e.target.value }))
                  }
                />
              </div>
            </>
          )}
        </div>

        <div className="response-panel" data-testid="response-panel">
          <div className="response-header">
            {response ? (
              <>
                <span
                  className={
                    response.status >= 200 && response.status < 300
                      ? "status-ok"
                      : "status-err"
                  }
                  data-testid="response-status"
                >
                  {response.status} {response.statusText}
                </span>
                <span className="response-meta">{response.durationMs} ms</span>
              </>
            ) : (
              <span className="response-meta">No response yet</span>
            )}
            {error ? <span className="status-err">{error}</span> : null}
          </div>
          {scriptLog ? (
            <pre className="response-body" data-testid="script-log">
              {scriptLog}
            </pre>
          ) : null}
          {response ? (
            <pre className="response-body" data-testid="response-body">
              {response.body}
            </pre>
          ) : null}
        </div>
      </main>
      {metaMenu ? (
        <div
          className="context-menu"
          style={{ left: metaMenu.x, top: metaMenu.y }}
          role="menu"
          data-testid="sidebar-meta-menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-testid="meta-menu-check-updates"
            onClick={() => void onCheckUpdatesManual()}
          >
            Check for updates
          </button>
          <button
            type="button"
            data-testid="meta-menu-view-releases"
            onClick={() => {
              setMetaMenu(null);
              void openGitHubReleasesPage();
            }}
          >
            View releases
          </button>
          <button
            type="button"
            data-testid="meta-menu-secrets"
            onClick={() => {
              setMetaMenu(null);
              if (!isTauri()) {
                setInfoToast("Local secrets are only available in the desktop app.");
                return;
              }
              setSecretsOpen(true);
            }}
          >
            Manage local secrets
          </button>
          <div className="context-menu-sep" role="separator" />
          <button
            type="button"
            data-testid="meta-menu-export-workspace"
            onClick={() => {
              setMetaMenu(null);
              void onExportWorkspace();
            }}
          >
            Export workspace
          </button>
          <div className="context-menu-sep" role="separator" />
          <button
            type="button"
            data-testid="meta-menu-about"
            onClick={() => {
              setMetaMenu(null);
              setAboutOpen(true);
            }}
          >
            About Echo
          </button>
        </div>
      ) : null}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <SecretsDialog open={secretsOpen} onClose={() => setSecretsOpen(false)} />
      {updateBanner ? (
        <UpdatePrompt
          currentVersion={updateBanner.currentVersion}
          newVersion={updateBanner.newVersion}
          onUpdate={() => void onInstallUpdate()}
          onDismiss={onDismissUpdate}
          onSuppressForever={onSuppressUpdates}
          onViewRelease={openGitHubReleasesPage}
        />
      ) : null}
      {infoToast ? (
        <div className="update-toast" role="status" data-testid="update-info-toast">
          {infoToast}
        </div>
      ) : null}
    </div>
  );
}

function KeyValueEditor({
  rows,
  onChange,
}: {
  rows: { key: string; value: string; enabled: boolean }[];
  onChange: (
    rows: { key: string; value: string; enabled: boolean }[]
  ) => void;
}) {
  return (
    <div className="kv-grid">
      {rows.map((row, i) => (
        <div className="kv-row" key={i}>
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...row, enabled: e.target.checked };
              onChange(next);
            }}
          />
          <input
            placeholder="name"
            value={row.key}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...row, key: e.target.value };
              onChange(next);
            }}
          />
          <input
            placeholder="value"
            value={row.value}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...row, value: e.target.value };
              onChange(next);
            }}
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...rows,
            { key: "", value: "", enabled: true },
          ])
        }
      >
        + Row
      </button>
    </div>
  );
}

function AuthEditor({
  auth,
  onChange,
}: {
  auth: RequestItem["auth"];
  onChange: (a: RequestItem["auth"]) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <select
        value={auth.type}
        onChange={(e) => {
          const t = e.target.value;
          if (t === "none") onChange({ type: "none" });
          if (t === "bearer") onChange({ type: "bearer", token: "" });
          if (t === "basic") onChange({ type: "basic", username: "", password: "" });
          if (t === "apiKey")
            onChange({
              type: "apiKey",
              key: "",
              value: "",
              addTo: "header",
            });
        }}
      >
        <option value="none">None</option>
        <option value="bearer">Bearer</option>
        <option value="basic">Basic</option>
        <option value="apiKey">API key</option>
      </select>
      {auth.type === "bearer" ? (
        <input
          placeholder="token"
          value={auth.token}
          onChange={(e) => onChange({ ...auth, token: e.target.value })}
        />
      ) : null}
      {auth.type === "basic" ? (
        <>
          <input
            placeholder="username"
            value={auth.username}
            onChange={(e) => onChange({ ...auth, username: e.target.value })}
          />
          <input
            type="password"
            placeholder="password"
            value={auth.password}
            onChange={(e) => onChange({ ...auth, password: e.target.value })}
          />
        </>
      ) : null}
      {auth.type === "apiKey" ? (
        <>
          <input
            placeholder="name"
            value={auth.key}
            onChange={(e) => onChange({ ...auth, key: e.target.value })}
          />
          <input
            placeholder="value"
            value={auth.value}
            onChange={(e) => onChange({ ...auth, value: e.target.value })}
          />
          <select
            value={auth.addTo}
            onChange={(e) =>
              onChange({
                ...auth,
                addTo: e.target.value as "header" | "query",
              })
            }
          >
            <option value="header">Add to header</option>
            <option value="query">Add to query string</option>
          </select>
        </>
      ) : null}
    </div>
  );
}
