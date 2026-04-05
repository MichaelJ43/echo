import { useRef } from "react";
import { APP_VERSION } from "../appVersion";
import { openGitHubRepoPage } from "../lib/updater";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AboutDialog({ open, onClose }: Props) {
  const backdropDownRef = useRef(false);

  if (!open) return null;

  return (
    <div
      className="secrets-dialog-backdrop"
      data-testid="about-dialog-backdrop"
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
        className="about-dialog"
        data-testid="about-dialog"
        role="dialog"
        aria-labelledby="about-dialog-title"
        aria-describedby="about-dialog-desc"
      >
        <div className="secrets-dialog-header">
          <h2 id="about-dialog-title">About Echo</h2>
          <button
            type="button"
            className="secrets-dialog-close"
            data-testid="about-dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="about-dialog-body">
          <p className="about-dialog-version" data-testid="about-version">
            Version {APP_VERSION}
          </p>
          <p id="about-dialog-desc">
            Echo is a free, cross-platform desktop app for exploring and testing
            HTTP APIs—collections, environments, authentication, and responses.
          </p>
          <p>
            <button
              type="button"
              className="about-dialog-link"
              data-testid="about-github-link"
              onClick={() => void openGitHubRepoPage()}
            >
              GitHub
            </button>
            {" · "}
            <span className="about-dialog-muted">MIT License</span>
          </p>
        </div>
      </div>
    </div>
  );
}
