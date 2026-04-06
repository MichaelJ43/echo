/** Inline create/rename in the collection tree (no window.prompt). */
export type TreeInlineDraft =
  | { mode: "new-folder"; parentId: string | null; value: string }
  | { mode: "new-request"; parentId: string; value: string }
  | {
      mode: "rename-folder";
      folderId: string;
      originalName: string;
      value: string;
    }
  | {
      mode: "rename-request";
      requestId: string;
      originalName: string;
      value: string;
    };

export function defaultNameForDraft(d: TreeInlineDraft): string {
  switch (d.mode) {
    case "new-folder":
      return d.parentId === null ? "My folder" : "New folder";
    case "new-request":
      return "New request";
    case "rename-folder":
    case "rename-request":
      return d.originalName;
    default:
      return "";
  }
}

/** Resolved name on commit (trimmed input or default). */
export function resolvedDraftName(d: TreeInlineDraft): string {
  const t = d.value.trim();
  if (t) return t;
  return defaultNameForDraft(d);
}
