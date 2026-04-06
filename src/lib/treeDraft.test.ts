import { describe, expect, it } from "vitest";
import {
  defaultNameForDraft,
  resolvedDraftName,
  type TreeInlineDraft,
} from "./treeDraft";

describe("treeDraft", () => {
  it("defaultNameForDraft", () => {
    const a: TreeInlineDraft = { mode: "new-folder", parentId: null, value: "" };
    expect(defaultNameForDraft(a)).toBe("My folder");
    const b: TreeInlineDraft = { mode: "new-folder", parentId: "p", value: "" };
    expect(defaultNameForDraft(b)).toBe("New folder");
    const c: TreeInlineDraft = { mode: "new-request", parentId: "p", value: "" };
    expect(defaultNameForDraft(c)).toBe("New request");
  });

  it("resolvedDraftName uses trim or default", () => {
    const d: TreeInlineDraft = {
      mode: "rename-request",
      requestId: "r",
      originalName: "Old",
      value: "  ",
    };
    expect(resolvedDraftName(d)).toBe("Old");
  });
});
