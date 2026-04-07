import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent as ReactChangeEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  deleteSecret,
  deleteSecretsForEnvironment,
  exportWorkspaceFile,
  getPaths,
  importWorkspaceFile,
  listSecretLogicalNamesForEnvironment,
  loadState,
  openContainingFolder,
  saveState,
  sendHttpRequest,
  setSecret,
} from "./api";
import {
  addChildToFolder,
  allRequestIds,
  appendRootFolder,
  createFolderNode,
  createRequestItem,
  findRequest,
  firstRequestId,
  mapCollection,
  mapEveryRequest,
  moveNode,
  removeNodeById,
  renameFolderById,
  requestToNode,
} from "./lib/collection";
import {
  sanitizeExportFilenameBase,
  sliceWorkspaceForFolderExport,
  sliceWorkspaceForRequestExport,
} from "./lib/workspaceSlice";
import { buildExpandedSendPayload } from "./lib/expandForSend";
import { mergeImportedUnderFolder } from "./lib/importWorkspace";
import { findRequestByPath } from "./lib/requestRef";
import {
  formatResponseBody,
  getContentTypeFromHeaders,
  isLikelyHtmlDocument,
  selectResponseBodyForView,
} from "./lib/responseFormat";
import { runCompletionScript } from "./lib/scriptRunner";
import { treeNameContainsColon } from "./lib/treeNames";
import {
  resolvedDraftName,
  type TreeInlineDraft,
} from "./lib/treeDraft";
import type {
  AppState,
  Environment,
  EnvironmentEntryKind,
  HttpResponsePayload,
  KeyValue,
  RequestItem,
} from "./types";
import { composeSecretStorageKey } from "./lib/secretStorageKey";
import { getEntryKind } from "./lib/variables";
import { AboutDialog } from "./components/AboutDialog";
import { ImportWorkspaceConfirmDialog } from "./components/ImportWorkspaceConfirmDialog";
import { HtmlPreviewModal } from "./components/HtmlPreviewModal";
import { TreeInlineNameRow } from "./components/TreeInlineNameRow";
import {
  TreeNodes,
  type MoveNodeDest,
  type TreeMenuState,
} from "./components/TreeNodes";
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

const SCRIPT_CHAIN_MAX = 8;

/** Fixed-width mask for stored secret values (does not reflect length). */
const SECRET_VALUE_MASK = "********";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const SIDEBAR_WIDTH_STORAGE_KEY = "echo.sidebarWidthPx";
const DEFAULT_SIDEBAR_WIDTH_PX = 280;
const MIN_SIDEBAR_WIDTH_PX = 200;
const MAX_SIDEBAR_WIDTH_PX = 560;

function readInitialSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_SIDEBAR_WIDTH_PX;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_SIDEBAR_WIDTH_PX;
    return Math.min(MAX_SIDEBAR_WIDTH_PX, Math.max(MIN_SIDEBAR_WIDTH_PX, n));
  } catch {
    return DEFAULT_SIDEBAR_WIDTH_PX;
  }
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [paths, setPaths] = useState<{ appDataDir: string; collectionsFile: string } | null>(null);
  /** In-flight send for this request id — hide cached response until the round-trip finishes. */
  const [pendingSendRequestId, setPendingSendRequestId] = useState<string | null>(
    null
  );
  const [scriptLogsByRequest, setScriptLogsByRequest] = useState<
    Record<string, string>
  >({});
  /** Bootstrap failure loading workspace (shown on loading screen only). */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Last Send failure or expand error for a given request id (session-only). */
  const [sendErrorsByRequest, setSendErrorsByRequest] = useState<
    Record<string, string>
  >({});
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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [importReplaceDialogOpen, setImportReplaceDialogOpen] = useState(false);
  const [lastResponses, setLastResponses] = useState<
    Record<string, HttpResponsePayload>
  >({});
  /** Raw vs Pretty preference per request id (session-only). */
  const [responseViewByRequest, setResponseViewByRequest] = useState<
    Record<string, "raw" | "pretty">
  >({});
  const [htmlPreviewOpen, setHtmlPreviewOpen] = useState(false);
  const [treeDraft, setTreeDraft] = useState<TreeInlineDraft | null>(null);
  /** Folder ids that are explicitly collapsed (absent = expanded). */
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Record<string, true>>(
    {}
  );
  const [sidebarWidthPx, setSidebarWidthPx] = useState(readInitialSidebarWidth);
  const sidebarResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const treeScrollRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const lastResponsesRef = useRef<Record<string, HttpResponsePayload>>({});
  const pendingEnvFileRowIndex = useRef<number | null>(null);
  const envFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingMultipartRowIndex = useRef<number | null>(null);
  const multipartFileInputRef = useRef<HTMLInputElement | null>(null);
  const binaryFileInputRef = useRef<HTMLInputElement | null>(null);
  /** Logical names with a composed keychain entry for the active environment (desktop). */
  const [storedSecretLogicalNames, setStoredSecretLogicalNames] = useState<
    string[]
  >([]);
  const [secretEditRowIndex, setSecretEditRowIndex] = useState<number | null>(
    null
  );
  const [secretValueDraft, setSecretValueDraft] = useState("");
  const envEntryNameFocusKeyRef = useRef<Record<number, string>>({});

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
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    lastResponsesRef.current = lastResponses;
  }, [lastResponses]);

  useEffect(() => {
    if (!state) return;
    const valid = allRequestIds(state.collections);
    setLastResponses((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!valid.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setScriptLogsByRequest((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!valid.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setSendErrorsByRequest((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!valid.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setResponseViewByRequest((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!valid.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [state?.collections]);

  useEffect(() => {
    setHtmlPreviewOpen(false);
  }, [state?.activeRequestId]);

  useLayoutEffect(() => {
    if (!state?.activeRequestId) return;
    const id = state.activeRequestId;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-tree-request-id="${id}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [state?.activeRequestId, state?.collections, collapsedFolderIds]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = sidebarResizeRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const w = Math.min(
        MAX_SIDEBAR_WIDTH_PX,
        Math.max(MIN_SIDEBAR_WIDTH_PX, drag.startW + dx)
      );
      setSidebarWidthPx(w);
    };
    const onUp = () => {
      if (!sidebarResizeRef.current) return;
      sidebarResizeRef.current = null;
      setSidebarWidthPx((w) => {
        try {
          localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(w));
        } catch {
          /* ignore */
        }
        return w;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

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
        setLoadError(e instanceof Error ? e.message : String(e));
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

  useEffect(() => {
    if (!activeEnv || !isTauri()) {
      setStoredSecretLogicalNames([]);
      return;
    }
    let cancelled = false;
    void listSecretLogicalNamesForEnvironment(activeEnv.id)
      .then((names) => {
        if (!cancelled) setStoredSecretLogicalNames(names);
      })
      .catch(() => {
        if (!cancelled) setStoredSecretLogicalNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeEnv?.id]);

  const pickEnvironmentFilePath = useCallback(
    (rowIndex: number) => {
      if (!activeEnv || !activeRequest) return;
      const envId = activeEnv.id;
      if (isTauri()) {
        void (async () => {
          const selected = await open({ multiple: false, directory: false });
          if (selected === null) return;
          const path = Array.isArray(selected) ? selected[0]! : selected;
          setState((s) => {
            if (!s) return s;
            const env = s.environments.find((e) => e.id === envId);
            if (!env) return s;
            const vars = [...env.variables];
            const row = vars[rowIndex];
            if (!row || getEntryKind(row) !== "file") return s;
            vars[rowIndex] = { ...row, value: path };
            return {
              ...s,
              environments: s.environments.map((e) =>
                e.id === envId ? { ...e, variables: vars } : e
              ),
            };
          });
        })();
      } else {
        pendingEnvFileRowIndex.current = rowIndex;
        envFileInputRef.current?.click();
      }
    },
    [activeEnv, activeRequest]
  );

  const onBrowserEnvFileChosen = useCallback(
    (e: ReactChangeEvent<HTMLInputElement>) => {
      const ix = pendingEnvFileRowIndex.current;
      pendingEnvFileRowIndex.current = null;
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f || ix === null || !activeEnv || !activeRequest) return;
      const envId = activeEnv.id;
      setState((s) => {
        if (!s) return s;
        const env = s.environments.find((e) => e.id === envId);
        if (!env) return s;
        const vars = [...env.variables];
        const row = vars[ix];
        if (!row || getEntryKind(row) !== "file") return s;
        vars[ix] = { ...row, value: f.name };
        return {
          ...s,
          environments: s.environments.map((e) =>
            e.id === envId ? { ...e, variables: vars } : e
          ),
        };
      });
    },
    [activeEnv, activeRequest]
  );

  const response: HttpResponsePayload | null = useMemo(() => {
    if (!state?.activeRequestId) return null;
    if (loading && pendingSendRequestId === state.activeRequestId) return null;
    return lastResponses[state.activeRequestId] ?? null;
  }, [
    state?.activeRequestId,
    loading,
    pendingSendRequestId,
    lastResponses,
  ]);

  const scriptLog = useMemo(() => {
    if (!state?.activeRequestId) return "";
    return scriptLogsByRequest[state.activeRequestId] ?? "";
  }, [state?.activeRequestId, scriptLogsByRequest]);

  const activeSendError = useMemo(() => {
    if (!state?.activeRequestId) return null;
    return sendErrorsByRequest[state.activeRequestId] ?? null;
  }, [state?.activeRequestId, sendErrorsByRequest]);

  const formattedResponse = useMemo(() => {
    if (!response) return null;
    const ct = getContentTypeFromHeaders(response.headers);
    return formatResponseBody(response.body, ct);
  }, [response]);

  const responseViewMode = useMemo((): "raw" | "pretty" => {
    if (!state?.activeRequestId) return "pretty";
    return responseViewByRequest[state.activeRequestId] ?? "pretty";
  }, [state?.activeRequestId, responseViewByRequest]);

  const showHtmlPreview =
    response &&
    isLikelyHtmlDocument(
      response.body,
      getContentTypeFromHeaders(response.headers)
    );

  const colonDraftError = useMemo(
    () =>
      treeDraft !== null &&
      treeNameContainsColon(resolvedDraftName(treeDraft)),
    [treeDraft]
  );

  const updateDraftValue = useCallback((value: string) => {
    setTreeDraft((prev) => (prev ? { ...prev, value } : null));
  }, []);

  const cancelTreeDraft = useCallback(() => {
    setTreeDraft(null);
  }, []);

  const commitTreeDraft = useCallback(() => {
    if (!treeDraft || !state) return;
    const name = resolvedDraftName(treeDraft);
    if (treeNameContainsColon(name)) return;

    switch (treeDraft.mode) {
      case "new-folder": {
        const folder = createFolderNode(name);
        if (treeDraft.parentId === null) {
          setState((prev) =>
            prev
              ? { ...prev, collections: appendRootFolder(prev.collections, folder) }
              : prev
          );
        } else {
          const parentId = treeDraft.parentId;
          if (parentId === null) break;
          setState((prev) =>
            prev
              ? {
                  ...prev,
                  collections: addChildToFolder(
                    prev.collections,
                    parentId,
                    folder
                  ),
                }
              : prev
          );
        }
        break;
      }
      case "new-request": {
        const envId = state.environments[0]?.id;
        if (!envId) break;
        const req = createRequestItem(name, envId);
        const node = requestToNode(req);
        setState((prev) =>
          prev
            ? {
                ...prev,
                collections: addChildToFolder(
                  prev.collections,
                  treeDraft.parentId,
                  node
                ),
                activeRequestId: req.id,
              }
            : prev
        );
        break;
      }
      case "rename-folder":
        setState((prev) =>
          prev
            ? {
                ...prev,
                collections: renameFolderById(
                  prev.collections,
                  treeDraft.folderId,
                  name
                ),
              }
            : prev
        );
        break;
      case "rename-request":
        setState((prev) =>
          prev
            ? {
                ...prev,
                collections: mapCollection(
                  prev.collections,
                  treeDraft.requestId,
                  (r) => ({ ...r, name })
                ),
              }
            : prev
        );
        break;
      default:
        break;
    }
    setTreeDraft(null);
  }, [treeDraft, state]);

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

  const commitSecretValueAtRow = useCallback(
    async (
      logicalKey: string,
      valueTrimmed: string,
      wasStored: boolean
    ) => {
      if (!activeEnv || !isTauri()) return;
      const key = logicalKey.trim();
      if (!key) {
        setInfoToast("Enter a secret name first.");
        setSecretEditRowIndex(null);
        setSecretValueDraft("");
        return;
      }
      const composed = composeSecretStorageKey(activeEnv.id, key);
      try {
        if (!valueTrimmed) {
          if (wasStored) {
            await deleteSecret(composed);
            await deleteSecret(key).catch(() => {});
            setStoredSecretLogicalNames((prev) => prev.filter((x) => x !== key));
          }
        } else {
          await setSecret(composed, valueTrimmed);
          setStoredSecretLogicalNames((prev) =>
            prev.includes(key) ? prev : [...prev, key]
          );
        }
      } catch (e) {
        setInfoToast(e instanceof Error ? e.message : String(e));
      } finally {
        setSecretEditRowIndex(null);
        setSecretValueDraft("");
      }
    },
    [activeEnv]
  );

  const onSecretEntryNameBlur = useCallback(
    (rowIndex: number, row: KeyValue, currentKey: string) => {
      const before = envEntryNameFocusKeyRef.current[rowIndex] ?? "";
      if (getEntryKind(row) !== "secret") return;
      if (before && before !== currentKey && activeEnv) {
        void (async () => {
          await deleteSecret(
            composeSecretStorageKey(activeEnv.id, before)
          ).catch(() => {});
          await deleteSecret(before).catch(() => {});
          setStoredSecretLogicalNames((prev) => prev.filter((x) => x !== before));
        })();
      }
    },
    [activeEnv]
  );

  const pickMultipartFilePath = useCallback(
    (rowIndex: number) => {
      if (!activeRequest) return;
      if (isTauri()) {
        void (async () => {
          const selected = await open({ multiple: false, directory: false });
          if (selected === null) return;
          const path = Array.isArray(selected) ? selected[0]! : selected;
          updateActiveRequest((r) => {
            const parts = [...(r.multipartParts ?? [])];
            const cur = parts[rowIndex];
            if (!cur || cur.partKind !== "file") return r;
            const base = path.split(/[/\\]/).pop() ?? "";
            parts[rowIndex] = {
              ...cur,
              filePath: path,
              fileName: cur.fileName?.trim() ? cur.fileName : base,
              fileDataBase64: undefined,
            };
            return { ...r, multipartParts: parts };
          });
        })();
      } else {
        pendingMultipartRowIndex.current = rowIndex;
        multipartFileInputRef.current?.click();
      }
    },
    [activeRequest, updateActiveRequest]
  );

  const onBrowserMultipartFileChosen = useCallback(
    async (e: ReactChangeEvent<HTMLInputElement>) => {
      const ix = pendingMultipartRowIndex.current;
      pendingMultipartRowIndex.current = null;
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f || ix === null || !activeRequest) return;
      try {
        const b64 = await fileToBase64(f);
        updateActiveRequest((r) => {
          const parts = [...(r.multipartParts ?? [])];
          const cur = parts[ix];
          if (!cur || cur.partKind !== "file") return r;
          parts[ix] = {
            ...cur,
            filePath: f.name,
            fileName: cur.fileName?.trim() ? cur.fileName : f.name,
            fileDataBase64: b64,
          };
          return { ...r, multipartParts: parts };
        });
      } catch (err) {
        console.error(err);
      }
    },
    [activeRequest, updateActiveRequest]
  );

  const pickBinaryBodyPath = useCallback(() => {
    if (!activeRequest) return;
    if (isTauri()) {
      void (async () => {
        const selected = await open({ multiple: false, directory: false });
        if (selected === null) return;
        const path = Array.isArray(selected) ? selected[0]! : selected;
        updateActiveRequest((r) => ({
          ...r,
          binaryBody: {
            path,
            contentType: r.binaryBody?.contentType ?? "",
            browserBase64: undefined,
          },
        }));
      })();
    } else {
      binaryFileInputRef.current?.click();
    }
  }, [activeRequest, updateActiveRequest]);

  const onBrowserBinaryFileChosen = useCallback(
    async (e: ReactChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f || !activeRequest) return;
      try {
        const b64 = await fileToBase64(f);
        updateActiveRequest((r) => ({
          ...r,
          binaryBody: {
            path: f.name,
            contentType: r.binaryBody?.contentType ?? "",
            browserBase64: b64,
          },
        }));
      } catch (err) {
        console.error(err);
      }
    },
    [activeRequest, updateActiveRequest]
  );

  const onSend = useCallback(async () => {
    if (!state || !activeRequest || !activeEnv) return;
    const sendId = activeRequest.id;
    setLoading(true);
    setSendErrorsByRequest((prev) => {
      if (!(sendId in prev)) return prev;
      const next = { ...prev };
      delete next[sendId];
      return next;
    });
    const { payload, errors: expandErrors } = buildExpandedSendPayload(
      activeRequest,
      activeEnv,
      state.collections,
      lastResponses
    );
    if (expandErrors.length) {
      setSendErrorsByRequest((prev) => ({
        ...prev,
        [sendId]: expandErrors.join("; "),
      }));
      setLoading(false);
      return;
    }
    setPendingSendRequestId(sendId);
    setScriptLogsByRequest((prev) => ({ ...prev, [sendId]: "" }));
    try {
      const res = await sendHttpRequest(payload);
      setLastResponses((prev) => {
        const next = { ...prev, [sendId]: res };
        lastResponsesRef.current = next;
        return next;
      });

      const runScriptChain = async (
        req: RequestItem,
        resPayload: HttpResponsePayload,
        depth: number
      ): Promise<void> => {
        if (depth > SCRIPT_CHAIN_MAX) {
          setScriptLogsByRequest((prev) => {
            const msg = `Max completion script / sendRequest depth (${SCRIPT_CHAIN_MAX})`;
            const old = prev[req.id] ?? "";
            const next = old ? `${old}\n${msg}` : msg;
            return { ...prev, [req.id]: next };
          });
          return;
        }
        if (!req.script.trim()) return;

        let block = "";
        const out = await runCompletionScript(req.script, resPayload, {
          setEnvironmentVariable: (key, value) => {
            setState((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                environments: prev.environments.map((env) => {
                  if (env.id !== req.environmentId) return env;
                  const vars = [...env.variables];
                  const ix = vars.findIndex((v) => v.key === key);
                  if (ix >= 0) {
                    vars[ix] = { ...vars[ix], value, enabled: true };
                  } else {
                    vars.push({
                      key,
                      value,
                      enabled: true,
                      entryKind: "variable",
                    });
                  }
                  return { ...env, variables: vars };
                }),
              };
            });
          },
          sendRequest: async (path) => {
            const s = stateRef.current;
            if (!s) throw new Error("App state unavailable");
            const target = findRequestByPath(s.collections, path);
            if (!target) throw new Error(`No request at path: ${path}`);
            const env = s.environments.find((e) => e.id === target.environmentId);
            if (!env) throw new Error("Environment not found for request");
            const built = buildExpandedSendPayload(
              target,
              env,
              s.collections,
              lastResponsesRef.current
            );
            if (built.errors.length) throw new Error(built.errors.join("; "));
            const r2 = await sendHttpRequest(built.payload);
            setLastResponses((prev) => {
              const n = { ...prev, [target.id]: r2 };
              lastResponsesRef.current = n;
              return n;
            });
            await runScriptChain(target, r2, depth + 1);
          },
        });
        block = [...out.logs, out.error ? `Script error: ${out.error}` : ""]
          .filter(Boolean)
          .join("\n");
        setScriptLogsByRequest((prev) => {
          const old = prev[req.id] ?? "";
          const label = `[${req.name}]`;
          const inner = block || "(no output)";
          const piece = `${label}\n${inner}`;
          /* Prepend so parent completion appears above chained requests */
          const next = old ? `${piece}\n\n${old}` : piece;
          return { ...prev, [req.id]: next };
        });
      };

      if (activeRequest.script.trim()) {
        await runScriptChain(activeRequest, res, 0);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSendErrorsByRequest((prev) => ({ ...prev, [sendId]: msg }));
    } finally {
      setLoading(false);
      setPendingSendRequestId(null);
    }
  }, [state, activeRequest, activeEnv, lastResponses]);

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
    setTreeDraft({
      mode: "rename-folder",
      folderId,
      originalName: currentName,
      value: currentName,
    });
  }, []);

  const onRenameRequest = useCallback((requestId: string, currentName: string) => {
    setTreeDraft({
      mode: "rename-request",
      requestId,
      originalName: currentName,
      value: currentName,
    });
  }, []);

  const onImportUnderFolder = useCallback(async (folderId: string) => {
    const file = await open({
      multiple: false,
      filters: [{ name: "Echo workspace", extensions: ["json"] }],
    });
    if (file === null || Array.isArray(file)) return;
    try {
      const imported = await importWorkspaceFile(file);
      const prev = stateRef.current;
      if (!prev) return;
      const merged = mergeImportedUnderFolder(prev, folderId, imported);
      if (!merged) {
        setInfoToast("Could not import into that folder.");
        return;
      }
      let next = merged;
      if (!next.activeRequestId) {
        const fid = firstRequestId(next.collections);
        if (fid) next = { ...next, activeRequestId: fid };
      }
      setState(next);
    } catch (e) {
      setInfoToast(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const runImportReplaceWorkspace = useCallback(async () => {
    setImportReplaceDialogOpen(false);
    const file = await open({
      multiple: false,
      filters: [{ name: "Echo workspace", extensions: ["json"] }],
    });
    if (file === null || Array.isArray(file)) return;
    try {
      const imported = await importWorkspaceFile(file);
      let next = imported;
      if (!next.activeRequestId) {
        const fid = firstRequestId(next.collections);
        if (fid) next = { ...next, activeRequestId: fid };
      }
      setState(next);
    } catch (e) {
      setInfoToast(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onCreateRootFolder = useCallback(() => {
    setTreeDraft({ mode: "new-folder", parentId: null, value: "" });
  }, []);

  const onCreateFolderInFolder = useCallback((parentId: string) => {
    setTreeDraft({ mode: "new-folder", parentId, value: "" });
  }, []);

  const onCreateRequestInFolder = useCallback((parentId: string) => {
    setTreeDraft({ mode: "new-request", parentId, value: "" });
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

  const onTreeMoveNode = useCallback((nodeId: string, dest: MoveNodeDest) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = moveNode(prev.collections, nodeId, dest);
      if (!next) return prev;
      return { ...prev, collections: next };
    });
  }, []);

  const onToggleFolderCollapsed = useCallback((folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = { ...prev };
      if (next[folderId]) delete next[folderId];
      else next[folderId] = true;
      return next;
    });
  }, []);

  const onEnsureFolderExpanded = useCallback((folderId: string) => {
    setCollapsedFolderIds((prev) => {
      if (!prev[folderId]) return prev;
      const next = { ...prev };
      delete next[folderId];
      return next;
    });
  }, []);

  const onMetaMenuContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTreeContextMenu(null);
    setTreeDraft(null);
    setMetaMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const onMetaMenuButtonClick = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setTreeContextMenu(null);
      const r = e.currentTarget.getBoundingClientRect();
      setMetaMenu((prev) => {
        if (prev) return null;
        setTreeDraft(null);
        return { x: r.left, y: r.bottom + 4 };
      });
    },
    []
  );

  const handleSetTreeMenu = useCallback((v: TreeMenuState | null) => {
    if (v) {
      setMetaMenu(null);
      setTreeDraft(null);
    }
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
    if (isTauri()) {
      void deleteSecretsForEnvironment(removedId).catch((e) => {
        console.error(e);
        setInfoToast(
          `Could not remove all keychain secrets for the deleted environment: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      });
    }
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
      setInfoToast(
        `Install failed: ${e instanceof Error ? e.message : String(e)}`
      );
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
        {loadError ? <p className="status-err">{loadError}</p> : null}
      </div>
    );
  }

  return (
    <div
      className="app-shell"
      style={{
        gridTemplateColumns: `${sidebarWidthPx}px 5px minmax(0, 1fr)`,
      }}
    >
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
        <div className="sidebar-tree-scroll" ref={treeScrollRef}>
          <div className="tree">
            {treeDraft?.mode === "new-folder" && treeDraft.parentId === null ? (
              <TreeInlineNameRow
                depth={0}
                draft={treeDraft}
                colonError={colonDraftError}
                onChange={updateDraftValue}
                onConfirm={commitTreeDraft}
                onCancel={cancelTreeDraft}
                variant="folder"
              />
            ) : null}
            <TreeNodes
              nodes={state.collections}
              activeId={state.activeRequestId}
              treeMenu={treeContextMenu}
              setTreeMenu={handleSetTreeMenu}
              treeDraft={treeDraft}
              colonDraftError={colonDraftError}
              onDraftValueChange={updateDraftValue}
              onDraftConfirm={commitTreeDraft}
              onDraftCancel={cancelTreeDraft}
              onSelectRequest={(id) =>
                setState((s) => (s ? { ...s, activeRequestId: id } : s))
              }
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
              onMoveNode={onTreeMoveNode}
            />
          </div>
        </div>
        {paths ? (
          <div className="path-hint">
            <span className="path-hint-label">Saved:</span>{" "}
            {isTauri() ? (
              <button
                type="button"
                className="path-hint-link"
                title={paths.collectionsFile}
                onClick={() => void openContainingFolder(paths.collectionsFile)}
              >
                {paths.collectionsFile}
              </button>
            ) : (
              <span title={paths.collectionsFile}>{paths.collectionsFile}</span>
            )}
          </div>
        ) : null}
      </aside>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize collections panel"
        onMouseDown={(e) => {
          e.preventDefault();
          sidebarResizeRef.current = { startX: e.clientX, startW: sidebarWidthPx };
        }}
      />
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
                  <code>{"{{name}}"}</code> (variables and file paths) and{" "}
                  <code>{"{{secret:name}}"}</code> on desktop. Other requests keep
                  their own choice.
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
                <input
                  ref={envFileInputRef}
                  type="file"
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                  onChange={onBrowserEnvFileChosen}
                />
                <input
                  ref={multipartFileInputRef}
                  type="file"
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                  onChange={onBrowserMultipartFileChosen}
                />
                <input
                  ref={binaryFileInputRef}
                  type="file"
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                  onChange={onBrowserBinaryFileChosen}
                />
                <div className="env-entries-grid" style={{ marginTop: 8 }}>
                  {(activeEnv?.variables ?? []).map((row, i) => {
                    const kind = getEntryKind(row);
                    return (
                      <div
                        className="env-entry-row"
                        key={`${activeEnv?.id ?? "env"}-${i}`}
                      >
                        <input
                          type="checkbox"
                          title="Enabled"
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
                        <select
                          className="env-entry-kind-select"
                          aria-label="Entry kind"
                          data-testid={`env-entry-kind-${i}`}
                          value={kind}
                          onChange={(e) => {
                            const next = e.target.value as EnvironmentEntryKind;
                            const vars = [...(activeEnv?.variables ?? [])];
                            const prev = vars[i]!;
                            const prevKind = getEntryKind(prev);
                            const nextValue =
                              next === "secret" || prevKind === "secret"
                                ? ""
                                : prev.value;
                            vars[i] = {
                              ...prev,
                              entryKind: next,
                              value: nextValue,
                            };
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
                          <option value="variable">Variable</option>
                          <option value="file">File</option>
                          <option value="secret">Secret</option>
                        </select>
                        <input
                          className="env-entry-name-input"
                          placeholder="name"
                          data-testid={`env-entry-name-${i}`}
                          value={row.key}
                          onFocus={() => {
                            envEntryNameFocusKeyRef.current[i] = row.key;
                          }}
                          onBlur={(e) => {
                            onSecretEntryNameBlur(i, row, e.currentTarget.value);
                          }}
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
                        {kind === "secret" ? (
                          !isTauri() ? (
                            <span className="response-meta">{`Desktop only — use {{secret:${row.key || "name"}}} in requests`}</span>
                          ) : secretEditRowIndex === i ? (
                            <input
                              className="env-entry-value-input"
                              data-testid={`env-entry-secret-value-${i}`}
                              type="password"
                              autoComplete="off"
                              autoFocus
                              placeholder={
                                storedSecretLogicalNames.includes(row.key)
                                  ? "New value (replaces stored)"
                                  : "Value"
                              }
                              aria-label="Secret value"
                              value={secretValueDraft}
                              onChange={(e) => setSecretValueDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                }
                              }}
                              onBlur={(e) => {
                                void commitSecretValueAtRow(
                                  row.key,
                                  e.currentTarget.value.trim(),
                                  storedSecretLogicalNames.includes(row.key)
                                );
                              }}
                            />
                          ) : storedSecretLogicalNames.includes(row.key) ? (
                            <button
                              type="button"
                              className="env-entry-secret-stored-btn"
                              data-testid={`env-entry-secret-value-${i}`}
                              aria-label="Secret stored; click to replace"
                              onClick={() => {
                                setSecretEditRowIndex(i);
                                setSecretValueDraft("");
                              }}
                            >
                              <span className="env-entry-secret-mask" aria-hidden>
                                {SECRET_VALUE_MASK}
                              </span>
                              <span className="env-entry-secret-hint">Stored</span>
                            </button>
                          ) : (
                            <input
                              className="env-entry-value-input"
                              data-testid={`env-entry-secret-value-${i}`}
                              type="password"
                              autoComplete="off"
                              placeholder="Value"
                              aria-label="Secret value"
                              value={secretEditRowIndex === i ? secretValueDraft : ""}
                              onChange={(e) => {
                                setSecretEditRowIndex(i);
                                setSecretValueDraft(e.target.value);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                }
                              }}
                              onBlur={(e) => {
                                void commitSecretValueAtRow(
                                  row.key,
                                  e.currentTarget.value.trim(),
                                  false
                                );
                              }}
                            />
                          )
                        ) : kind === "file" ? (
                          <div className="env-entry-value-with-browse">
                            <input
                              className="env-entry-value-input"
                              placeholder="path"
                              data-testid={`env-entry-value-${i}`}
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
                              className="env-entry-browse-btn"
                              data-testid={`env-entry-browse-${i}`}
                              title="Choose file"
                              onClick={() => pickEnvironmentFilePath(i)}
                            >
                              …
                            </button>
                          </div>
                        ) : (
                          <input
                            className="env-entry-value-input"
                            placeholder="value"
                            data-testid={`env-entry-value-${i}`}
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
                        )}
                        <button
                          type="button"
                          className="env-entry-remove-btn"
                          title="Remove"
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
                    );
                  })}
                  <button
                    type="button"
                    data-testid="add-environment-entry"
                    onClick={() => {
                      setState((s) => {
                        if (!s || !activeEnv) return s;
                        const row: KeyValue = {
                          key: "",
                          value: "",
                          enabled: true,
                          entryKind: "variable",
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
                    + Entry
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
                  data-testid="body-type-select"
                  value={activeRequest.bodyType}
                  onChange={(e) => {
                    const v = e.target.value as RequestItem["bodyType"];
                    updateActiveRequest((r) => {
                      if (v === "multipart") {
                        const parts =
                          r.multipartParts?.length && r.multipartParts.length > 0
                            ? r.multipartParts
                            : [
                                {
                                  enabled: true,
                                  key: "",
                                  partKind: "text" as const,
                                  text: "",
                                },
                              ];
                        return {
                          ...r,
                          bodyType: v,
                          body: "",
                          multipartParts: parts,
                        };
                      }
                      if (v === "binary") {
                        return {
                          ...r,
                          bodyType: v,
                          body: "",
                          binaryBody:
                            r.binaryBody ?? { path: "", contentType: "" },
                        };
                      }
                      return { ...r, bodyType: v };
                    });
                  }}
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="raw">Raw</option>
                  <option value="form">x-www-form-urlencoded</option>
                  <option value="multipart">multipart/form-data</option>
                  <option value="binary">Binary (file)</option>
                </select>
                {activeRequest.bodyType === "json" ||
                activeRequest.bodyType === "raw" ||
                activeRequest.bodyType === "form" ? (
                  <textarea
                    className="body-input"
                    data-testid="body-input"
                    value={activeRequest.body}
                    onChange={(e) =>
                      updateActiveRequest((r) => ({ ...r, body: e.target.value }))
                    }
                  />
                ) : null}
                {activeRequest.bodyType === "multipart" ? (
                  <div className="multipart-panel" style={{ marginTop: 8 }}>
                    <p className="response-meta" style={{ marginTop: 0 }}>
                      Form fields and files. Desktop reads file paths from disk;
                      the web build keeps picked files in memory for this session
                      only (not in saved workspace JSON).
                    </p>
                    <div className="multipart-parts-grid">
                      {(activeRequest.multipartParts ?? []).map((row, i) => (
                        <div
                          className="multipart-part-row"
                          key={`mp-${activeRequest.id}-${i}`}
                        >
                          <input
                            type="checkbox"
                            title="Enabled"
                            checked={row.enabled}
                            onChange={(e) =>
                              updateActiveRequest((r) => {
                                const parts = [...(r.multipartParts ?? [])];
                                parts[i] = {
                                  ...row,
                                  enabled: e.target.checked,
                                };
                                return { ...r, multipartParts: parts };
                              })
                            }
                          />
                          <input
                            className="multipart-key-input"
                            placeholder="field name"
                            data-testid={`multipart-key-${i}`}
                            value={row.key}
                            onChange={(e) =>
                              updateActiveRequest((r) => {
                                const parts = [...(r.multipartParts ?? [])];
                                parts[i] = { ...row, key: e.target.value };
                                return { ...r, multipartParts: parts };
                              })
                            }
                          />
                          <select
                            className="multipart-kind-select"
                            aria-label="Part kind"
                            data-testid={`multipart-kind-${i}`}
                            value={row.partKind}
                            onChange={(e) => {
                              const kind = e.target.value as "text" | "file";
                              updateActiveRequest((r) => {
                                const parts = [...(r.multipartParts ?? [])];
                                const cur = parts[i]!;
                                parts[i] =
                                  kind === "text"
                                    ? {
                                        enabled: cur.enabled,
                                        key: cur.key,
                                        partKind: "text",
                                        text: "",
                                      }
                                    : {
                                        enabled: cur.enabled,
                                        key: cur.key,
                                        partKind: "file",
                                      };
                                return { ...r, multipartParts: parts };
                              });
                            }}
                          >
                            <option value="text">Text</option>
                            <option value="file">File</option>
                          </select>
                          {row.partKind === "text" ? (
                            <input
                              className="multipart-value-input"
                              placeholder="value"
                              data-testid={`multipart-text-${i}`}
                              value={row.text ?? ""}
                              onChange={(e) =>
                                updateActiveRequest((r) => {
                                  const parts = [...(r.multipartParts ?? [])];
                                  parts[i] = {
                                    ...row,
                                    text: e.target.value,
                                  };
                                  return { ...r, multipartParts: parts };
                                })
                              }
                            />
                          ) : (
                            <div className="multipart-file-cell">
                              <div className="env-entry-value-with-browse">
                                <input
                                  className="env-entry-value-input"
                                  placeholder="path or Browse"
                                  data-testid={`multipart-file-path-${i}`}
                                  title={row.filePath ?? ""}
                                  value={row.filePath ?? ""}
                                  onChange={(e) =>
                                    updateActiveRequest((r) => {
                                      const parts = [...(r.multipartParts ?? [])];
                                      parts[i] = {
                                        ...row,
                                        filePath: e.target.value,
                                        ...(isTauri()
                                          ? {}
                                          : { fileDataBase64: undefined }),
                                      };
                                      return { ...r, multipartParts: parts };
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  className="env-entry-browse-btn"
                                  title="Choose file"
                                  data-testid={`multipart-browse-${i}`}
                                  onClick={() => pickMultipartFilePath(i)}
                                >
                                  …
                                </button>
                              </div>
                              <input
                                className="multipart-filename-input"
                                placeholder="filename (optional)"
                                data-testid={`multipart-filename-${i}`}
                                value={row.fileName ?? ""}
                                onChange={(e) =>
                                  updateActiveRequest((r) => {
                                    const parts = [...(r.multipartParts ?? [])];
                                    parts[i] = {
                                      ...row,
                                      fileName: e.target.value,
                                    };
                                    return { ...r, multipartParts: parts };
                                  })
                                }
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            className="env-entry-remove-btn"
                            title="Remove field"
                            data-testid={`multipart-remove-${i}`}
                            onClick={() =>
                              updateActiveRequest((r) => {
                                const parts = [...(r.multipartParts ?? [])];
                                parts.splice(i, 1);
                                return { ...r, multipartParts: parts };
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="env-toolbar-btn"
                      data-testid="multipart-add-field"
                      onClick={() =>
                        updateActiveRequest((r) => ({
                          ...r,
                          multipartParts: [
                            ...(r.multipartParts ?? []),
                            {
                              enabled: true,
                              key: "",
                              partKind: "text",
                              text: "",
                            },
                          ],
                        }))
                      }
                    >
                      + Field
                    </button>
                  </div>
                ) : null}
                {activeRequest.bodyType === "binary" ? (
                  <div className="binary-body-panel" style={{ marginTop: 8 }}>
                    <p className="response-meta" style={{ marginTop: 0 }}>
                      Raw body from a single file. Desktop reads{" "}
                      <code>path</code> from disk; web uses Browse (session-only).
                    </p>
                    <div className="binary-body-row">
                      <span className="binary-body-label">Path</span>
                      <div className="env-entry-value-with-browse">
                        <input
                          className="env-entry-value-input"
                          data-testid="binary-body-path"
                          placeholder={
                            isTauri() ? "Path or Browse" : "Browse to pick file"
                          }
                          value={activeRequest.binaryBody?.path ?? ""}
                          onChange={(e) => {
                            const path = e.target.value;
                            updateActiveRequest((r) => ({
                              ...r,
                              binaryBody: {
                                path,
                                contentType: r.binaryBody?.contentType ?? "",
                                ...(isTauri()
                                  ? {}
                                  : { browserBase64: undefined }),
                              },
                            }));
                          }}
                        />
                        <button
                          type="button"
                          className="env-entry-browse-btn"
                          title="Choose file"
                          data-testid="binary-body-browse"
                          onClick={() => pickBinaryBodyPath()}
                        >
                          …
                        </button>
                      </div>
                    </div>
                    <div className="binary-body-row">
                      <span className="binary-body-label">Content-Type</span>
                      <input
                        className="env-entry-value-input"
                        data-testid="binary-body-content-type"
                        placeholder="application/octet-stream"
                        value={activeRequest.binaryBody?.contentType ?? ""}
                        onChange={(e) =>
                          updateActiveRequest((r) => ({
                            ...r,
                            binaryBody: {
                              path: r.binaryBody?.path ?? "",
                              contentType: e.target.value,
                              browserBase64: r.binaryBody?.browserBase64,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="section">
                <h3>Completion script</h3>
                <p className="response-meta" style={{ marginTop: 0 }}>
                  <code>pm.response.status()</code>, <code>pm.response.text()</code>,{" "}
                  <code>pm.response.json()</code>, <code>pm.console.log()</code>,{" "}
                  <code>pm.environment.set(key, value)</code> (current env),{" "}
                  <code>await pm.sendRequest(&quot;folder/sub/request&quot;)</code> (chain)
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

        <div
          className={`response-panel${response ? " response-panel--populated" : ""}`}
          data-testid="response-panel"
        >
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
            {activeSendError ? (
              <span className="status-err">{activeSendError}</span>
            ) : null}
          </div>
          {activeRequest?.script.trim() ? (
            <div className="script-output-panel">
              <h4>Completion script output</h4>
              <pre className="response-body" data-testid="script-log">
                {scriptLog || "(Run Send to execute the script.)"}
              </pre>
            </div>
          ) : null}
          {response ? (
            <>
              <div className="response-toolbar">
                <button
                  type="button"
                  data-testid="response-view-raw"
                  className={responseViewMode === "raw" ? "active" : ""}
                  onClick={() => {
                    const id = state?.activeRequestId;
                    if (!id) return;
                    setResponseViewByRequest((prev) => ({
                      ...prev,
                      [id]: "raw",
                    }));
                  }}
                >
                  Raw
                </button>
                <button
                  type="button"
                  data-testid="response-view-pretty"
                  className={responseViewMode === "pretty" ? "active" : ""}
                  onClick={() => {
                    const id = state?.activeRequestId;
                    if (!id) return;
                    setResponseViewByRequest((prev) => ({
                      ...prev,
                      [id]: "pretty",
                    }));
                  }}
                >
                  Pretty
                </button>
                {showHtmlPreview ? (
                  <button
                    type="button"
                    data-testid="response-preview-html"
                    onClick={() => setHtmlPreviewOpen(true)}
                  >
                    Page preview
                  </button>
                ) : null}
                {formattedResponse ? (
                  <span className="response-format-badge">
                    {formattedResponse.kind}
                  </span>
                ) : null}
              </div>
              <pre
                className="response-body"
                data-testid="response-body"
                data-response-view={responseViewMode}
              >
                {selectResponseBodyForView(
                  responseViewMode,
                  response.body,
                  formattedResponse
                )}
              </pre>
            </>
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
          <button
            type="button"
            data-testid="meta-menu-import-workspace"
            onClick={() => {
              setMetaMenu(null);
              setImportReplaceDialogOpen(true);
            }}
          >
            Import workspace…
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
      <ImportWorkspaceConfirmDialog
        open={importReplaceDialogOpen}
        onClose={() => setImportReplaceDialogOpen(false)}
        onConfirmReplace={runImportReplaceWorkspace}
      />
      {htmlPreviewOpen && response ? (
        <HtmlPreviewModal
          html={response.body}
          onClose={() => setHtmlPreviewOpen(false)}
        />
      ) : null}
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
