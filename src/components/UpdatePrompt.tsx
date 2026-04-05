type Props = {
  currentVersion: string;
  newVersion: string;
  onUpdate: () => void;
  onDismiss: () => void;
  onSuppressForever: () => void;
  onViewRelease: () => void;
};

export function UpdatePrompt({
  currentVersion,
  newVersion,
  onUpdate,
  onDismiss,
  onSuppressForever,
  onViewRelease,
}: Props) {
  return (
    <div
      className="update-prompt"
      role="dialog"
      aria-labelledby="update-prompt-title"
      aria-describedby="update-prompt-desc"
      data-testid="update-prompt"
    >
      <div className="update-prompt-inner">
        <div className="update-prompt-header">
          <span id="update-prompt-title" className="update-prompt-title">
            Update available
          </span>
        </div>
        <p id="update-prompt-desc" className="update-prompt-desc">
          Echo <strong>{newVersion}</strong> is available (you have {currentVersion}).{" "}
          <button type="button" className="update-prompt-link" onClick={onViewRelease}>
            View on GitHub
          </button>
        </p>
        <div className="update-prompt-actions">
          <button type="button" className="primary" data-testid="update-prompt-install" onClick={onUpdate}>
            Update
          </button>
          <button type="button" data-testid="update-prompt-dismiss" onClick={onDismiss}>
            Dismiss
          </button>
          <button type="button" className="muted" data-testid="update-prompt-suppress" onClick={onSuppressForever}>
            Don&apos;t notify me again
          </button>
        </div>
      </div>
    </div>
  );
}
