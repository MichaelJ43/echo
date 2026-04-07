import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRequestLogEntries,
  getRequestLogSettings,
  setRequestLogMaxEntries,
  type RequestLogEntry,
} from "../api";
import { isTauri } from "@tauri-apps/api/core";

const MAX_CHOICES = [
  50, 100, 200, 500, 1000, 2500, 5000, 10000, 20000, 50000,
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
};

function formatTs(iso: string): string {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return iso;
  try {
    return new Date(d).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function RequestLogDialog({ open, onClose }: Props) {
  const backdropDownRef = useRef(false);
  const [entries, setEntries] = useState<RequestLogEntry[]>([]);
  const [maxEntries, setMaxEntries] = useState(500);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const maxEntryChoices = useMemo(() => {
    const s = new Set<number>([...MAX_CHOICES, maxEntries]);
    return [...s].sort((a, b) => a - b);
  }, [maxEntries]);

  const reload = useCallback(async () => {
    if (!isTauri()) {
      setEntries([]);
      return;
    }
    setLoadErr(null);
    try {
      const [rows, settings] = await Promise.all([
        getRequestLogEntries(),
        getRequestLogSettings(),
      ]);
      setEntries(rows);
      setMaxEntries(settings.maxEntries);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  const onMaxChange = useCallback(
    async (n: number) => {
      setMaxEntries(n);
      try {
        await setRequestLogMaxEntries(n);
        await reload();
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : String(e));
      }
    },
    [reload]
  );

  if (!open) return null;

  return (
    <div
      className="secrets-dialog-backdrop"
      data-testid="request-log-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (
          backdropDownRef.current &&
          e.button === 0 &&
          e.target === e.currentTarget
        ) {
          onClose();
        }
        backdropDownRef.current = false;
      }}
    >
      <div
        className="about-dialog request-log-dialog"
        data-testid="request-log-dialog"
        role="dialog"
        aria-labelledby="request-log-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="secrets-dialog-header">
          <h2 id="request-log-title">Request log</h2>
          <button
            type="button"
            className="secrets-dialog-close"
            aria-label="Close"
            data-testid="request-log-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="secrets-dialog-hint request-log-hint">
          Recent sends (request name, time, status, duration). The log file lives next to your
          workspace on disk; nothing here includes URLs or bodies.
        </p>
        {loadErr ? (
          <p className="secrets-dialog-err" role="alert">
            {loadErr}
          </p>
        ) : null}
        <div className="request-log-toolbar">
          <label className="request-log-max-label">
            Keep at most{" "}
            <select
              className="request-log-max-select"
              value={maxEntries}
              onChange={(e) => void onMaxChange(Number(e.target.value))}
              aria-label="Maximum log entries before oldest are removed"
            >
              {maxEntryChoices.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>{" "}
            entries
          </label>
        </div>
        <div className="request-log-scroll" role="log" aria-live="polite">
          {entries.length === 0 ? (
            <p className="about-dialog-muted request-log-empty">
              {isTauri() ? "No entries yet. Send a request to record one." : "Request history is available in the desktop app."}
            </p>
          ) : (
            <table className="request-log-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Method</th>
                  <th scope="col">Request</th>
                  <th scope="col">Status</th>
                  <th scope="col">ms</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row, i) => (
                  <tr key={`${i}-${row.ts}-${row.requestId}`}>
                    <td className="request-log-cell-time">{formatTs(row.ts)}</td>
                    <td>{row.method}</td>
                    <td className="request-log-cell-name" title={row.requestName}>
                      {row.requestName}
                    </td>
                    <td>
                      {row.error ? (
                        <span className="request-log-err" title={row.error}>
                          Error
                        </span>
                      ) : (
                        String(row.status ?? "—")
                      )}
                    </td>
                    <td>{row.durationMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
