import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  exportWorkspaceFile,
  getPaths,
  importWorkspaceFile,
  loadState,
  saveState,
  sendHttpRequest,
} from "./api";
import { findRequest, firstRequestId, mapCollection } from "./lib/collection";
import { runCompletionScript } from "./lib/scriptRunner";
import { variablesToMap } from "./lib/variables";
import type { AppState, HttpResponsePayload, RequestItem } from "./types";
import { TreeNodes } from "./components/TreeNodes";
import { startUpdateChecks } from "./lib/updater";

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

  const activeEnv = useMemo(() => {
    if (!state) return null;
    const id = state.activeEnvironmentId ?? state.environments[0]?.id;
    return state.environments.find((e) => e.id === id) ?? state.environments[0] ?? null;
  }, [state]);

  useEffect(() => {
    startUpdateChecks();
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

  const onExport = useCallback(async () => {
    if (!state) return;
    const file = await save({
      filters: [{ name: "Echo workspace", extensions: ["json"] }],
      defaultPath: "echo-workspace.json",
    });
    if (file === null) return;
    await exportWorkspaceFile(file, state);
  }, [state]);

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
        <div className="sidebar-header">Collections</div>
        <div className="tree">
          <TreeNodes
            nodes={state.collections}
            activeId={state.activeRequestId}
            onSelectRequest={(id) =>
              setState((s) => (s ? { ...s, activeRequestId: id } : s))
            }
            onExport={onExport}
            onImport={onImport}
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
                <select
                  value={state.activeEnvironmentId ?? activeEnv?.id ?? ""}
                  onChange={(e) =>
                    setState((s) =>
                      s ? { ...s, activeEnvironmentId: e.target.value } : s
                    )
                  }
                >
                  {state.environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
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
