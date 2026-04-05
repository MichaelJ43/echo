import { useCallback, useEffect, useRef, useState } from "react";
import { deleteSecret, listSecretKeys, setSecret } from "../api";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SecretsDialog({ open, onClose }: Props) {
  const [keys, setKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  /** Only close when both press and release happen on the dimmed backdrop (not after text selection). */
  const backdropPointerDownRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const k = await listSecretKeys();
      setKeys(k);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const onAdd = async () => {
    const key = newKey.trim();
    if (!key) {
      setError("Enter a secret name.");
      return;
    }
    setError(null);
    try {
      await setSecret(key, newValue);
      setNewKey("");
      setNewValue("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onRemove = async (key: string) => {
    setError(null);
    try {
      await deleteSecret(key);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!open) return null;

  return (
    <div
      className="secrets-dialog-backdrop"
      data-testid="secrets-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        backdropPointerDownRef.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (
          backdropPointerDownRef.current &&
          e.button === 0 &&
          e.target === e.currentTarget
        ) {
          onClose();
        }
        backdropPointerDownRef.current = false;
      }}
    >
      <div
        className="secrets-dialog"
        data-testid="secrets-dialog"
        role="dialog"
        aria-labelledby="secrets-dialog-title"
      >
        <div className="secrets-dialog-header">
          <h2 id="secrets-dialog-title">Local secrets</h2>
          <button
            type="button"
            className="secrets-dialog-close"
            data-testid="secrets-dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="secrets-dialog-hint">
          Values are stored in the OS credential manager (Windows Credential
          Locker / macOS Keychain / freedesktop Secret Service). Use{" "}
          <code>{"{{secret:NAME}}"}</code> in URLs, headers, body, or auth
          fields — values are read only when you send a request, not when
          editing or saving collections.
        </p>
        {error ? <p className="status-err secrets-dialog-err">{error}</p> : null}
        <div className="secrets-add-row">
          <input
            type="text"
            placeholder="NAME (e.g. api_token, api-key)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <input
            type="password"
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            autoComplete="new-password"
          />
          <button type="button" onClick={() => void onAdd()} disabled={loading}>
            Save
          </button>
        </div>
        {loading && keys.length === 0 ? (
          <p className="secrets-dialog-muted">Loading…</p>
        ) : (
          <ul className="secrets-list">
            {keys.map((k) => (
              <li key={k}>
                <code>{k}</code>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void onRemove(k)}
                  disabled={loading}
                >
                  Remove
                </button>
              </li>
            ))}
            {keys.length === 0 && !loading ? (
              <li className="secrets-list-empty">No secrets yet.</li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}
