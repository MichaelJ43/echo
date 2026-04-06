import { useEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { TREE_NAME_COLON_ERROR } from "../lib/treeNames";
import type { TreeInlineDraft } from "../lib/treeDraft";

type Props = {
  depth: number;
  draft: TreeInlineDraft;
  colonError: boolean;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  variant: "folder" | "request";
  /** Inside an existing tree row (rename); omits leading chevron/folder icon. */
  embedded?: boolean;
};

/**
 * Inline name editor for the collection tree: input + checkmark, blur cancels.
 */
export function TreeInlineNameRow({
  depth,
  draft,
  colonError,
  onChange,
  onConfirm,
  onCancel,
  variant,
  embedded = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const placeholder =
    draft.mode === "new-folder"
      ? draft.parentId === null
        ? "My folder"
        : "New folder"
      : draft.mode === "new-request"
        ? "New request"
        : undefined;

  const clearBlurTimer = () => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  };

  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => {
      onCancel();
    }, 150);
  };

  const handleConfirmClick = (e: MouseEvent) => {
    e.preventDefault();
    clearBlurTimer();
    if (colonError) return;
    onConfirm();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      clearBlurTimer();
      onCancel();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (colonError) return;
      onConfirm();
    }
  };

  const icon = variant === "folder" ? "📁" : "▸";

  const rowInner = (
    <>
      <input
        ref={inputRef}
        type="text"
        className="tree-inline-input"
        data-testid="tree-inline-name-input"
        value={draft.value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        aria-invalid={colonError}
        aria-describedby={colonError ? "tree-inline-colon-hint" : undefined}
      />
      <button
        type="button"
        className="tree-inline-confirm"
        data-testid="tree-inline-confirm"
        title="Save"
        aria-label="Save name"
        onMouseDown={handleConfirmClick}
      >
        ✓
      </button>
    </>
  );

  if (embedded) {
    return (
      <div
        className="tree-inline-embed"
        data-testid="tree-inline-name-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tree-inline-row">{rowInner}</div>
        {colonError ? (
          <p id="tree-inline-colon-hint" className="tree-inline-colon-err" role="alert">
            {TREE_NAME_COLON_ERROR}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="tree-inline-wrap"
      style={{ paddingLeft: 8 + depth * 12 }}
      data-testid="tree-inline-name-row"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tree-inline-row">
        <span className="tree-chevron tree-inline-spacer" aria-hidden />
        <span aria-hidden>{icon}</span>
        {rowInner}
      </div>
      {colonError ? (
        <p id="tree-inline-colon-hint" className="tree-inline-colon-err" role="alert">
          {TREE_NAME_COLON_ERROR}
        </p>
      ) : null}
    </div>
  );
}
