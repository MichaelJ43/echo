import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  /** Full composed storage keys (`echo_<uuid>_…`) present in the index but not in the workspace. */
  keys: string[];
  onClose: () => void;
  /** Deletes selected keys from the OS credential store and `secret_index.json`. */
  onRemoveSelected: (selected: string[]) => void | Promise<void>;
};

export function OrphanCredentialsDialog({
  open,
  keys,
  onClose,
  onRemoveSelected,
}: Props) {
  const backdropDownRef = useRef(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const k of keys) next[k] = true;
    setSelected(next);
  }, [open, keys]);

  if (!open) return null;

  const allSelected = keys.length > 0 && keys.every((k) => selected[k]);
  const selectedList = keys.filter((k) => selected[k]);

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    for (const k of keys) next[k] = checked;
    setSelected(next);
  };

  return (
    <div
      className="secrets-dialog-backdrop"
      data-testid="orphan-credentials-backdrop"
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
        className="about-dialog orphan-credentials-dialog"
        data-testid="orphan-credentials-dialog"
        role="alertdialog"
        aria-labelledby="orphan-credentials-title"
        aria-describedby="orphan-credentials-desc"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="secrets-dialog-header">
          <h2 id="orphan-credentials-title">Unused credential entries</h2>
          <button
            type="button"
            className="secrets-dialog-close"
            data-testid="orphan-credentials-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="about-dialog-body">
          <p id="orphan-credentials-desc">
            These storage keys are listed in your secret index but are not used by any
            Secret environment entry. You can remove them from the OS credential store to
            reduce clutter.
          </p>
          <label className="orphan-credentials-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => toggleAll(e.target.checked)}
            />{" "}
            Select all ({keys.length})
          </label>
          <ul className="orphan-credentials-list" data-testid="orphan-credentials-list">
            {keys.map((k) => (
              <li key={k}>
                <label className="orphan-credentials-row">
                  <input
                    type="checkbox"
                    checked={selected[k] ?? false}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [k]: e.target.checked }))
                    }
                  />
                  <code className="orphan-credentials-key">{k}</code>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="import-confirm-dialog-actions">
          <button
            type="button"
            className="import-confirm-dialog-btn"
            data-testid="orphan-credentials-cancel"
            disabled={busy}
            onClick={onClose}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="import-confirm-dialog-btn import-confirm-dialog-btn-danger"
            data-testid="orphan-credentials-remove"
            disabled={busy || selectedList.length === 0}
            onClick={() => {
              setBusy(true);
              void Promise.resolve(onRemoveSelected(selectedList))
                .catch(() => {})
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Removing…" : `Remove selected (${selectedList.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
