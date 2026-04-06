type Props = {
  html: string;
  onClose: () => void;
};

/**
 * Sandboxed, non-interactive HTML preview (no scripts, no pointer events on content).
 */
export function HtmlPreviewModal({ html, onClose }: Props) {
  return (
    <div
      className="secrets-dialog-backdrop"
      data-testid="html-preview-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.button === 0 && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="html-preview-dialog"
        data-testid="html-preview-dialog"
        role="dialog"
        aria-label="HTML response preview"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="html-preview-header">
          <h2 id="html-preview-title">Page preview</h2>
          <button
            type="button"
            className="secrets-dialog-close"
            data-testid="html-preview-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="html-preview-hint">
          Read-only preview — interaction is disabled.
        </p>
        <div className="html-preview-frame-host">
          <iframe
            className="html-preview-frame"
            title="HTML response preview"
            srcDoc={html}
            sandbox=""
            style={{ pointerEvents: "none" }}
          />
        </div>
      </div>
    </div>
  );
}
