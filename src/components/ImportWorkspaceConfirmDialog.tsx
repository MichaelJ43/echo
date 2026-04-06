import { useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** User confirmed — caller opens file picker and replaces workspace. */
  onConfirmReplace: () => void | Promise<void>;
};

/**
 * Confirms full workspace replace before file pick (matches modal patterns in About/Secrets).
 */
export function ImportWorkspaceConfirmDialog({
  open,
  onClose,
  onConfirmReplace,
}: Props) {
  const backdropDownRef = useRef(false);

  if (!open) return null;

  return (
    <div
      className="secrets-dialog-backdrop"
      data-testid="import-replace-dialog-backdrop"
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
        className="about-dialog import-confirm-dialog"
        data-testid="import-replace-dialog"
        role="alertdialog"
        aria-labelledby="import-replace-title"
        aria-describedby="import-replace-desc"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="secrets-dialog-header">
          <h2 id="import-replace-title">Replace entire workspace?</h2>
          <button
            type="button"
            className="secrets-dialog-close"
            data-testid="import-replace-dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="about-dialog-body">
          <p id="import-replace-desc">
            Importing will <strong>replace</strong> all collections, environments, and the
            active request with the contents of the file you choose. This cannot be undone
            from Echo (use your own backup if needed).
          </p>
        </div>
        <div className="import-confirm-dialog-actions">
          <button
            type="button"
            data-testid="import-replace-cancel"
            className="import-confirm-dialog-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="import-replace-confirm"
            className="import-confirm-dialog-btn import-confirm-dialog-btn-danger"
            onClick={() => void onConfirmReplace()}
          >
            Choose file and replace…
          </button>
        </div>
      </div>
    </div>
  );
}
