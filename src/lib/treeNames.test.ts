import { describe, expect, it } from "vitest";
import { treeNameContainsColon } from "./treeNames";

describe("treeNames", () => {
  it("detects colon", () => {
    expect(treeNameContainsColon("a:b")).toBe(true);
    expect(treeNameContainsColon("ok")).toBe(false);
  });
});
