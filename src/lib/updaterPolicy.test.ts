import { describe, expect, it } from "vitest";
import { isAutoUpdatePromptBlocked } from "./updaterPolicy";

describe("isAutoUpdatePromptBlocked", () => {
  it("blocks when suppress forever", () => {
    expect(isAutoUpdatePromptBlocked(true, false, 0, 1000)).toBe(true);
  });

  it("blocks when dismissed this session and before snooze end", () => {
    expect(isAutoUpdatePromptBlocked(false, true, 10_000, 5000)).toBe(true);
  });

  it("does not block when dismissed but snooze elapsed (same session)", () => {
    expect(isAutoUpdatePromptBlocked(false, true, 5000, 10_000)).toBe(false);
  });

  it("does not block when not dismissed", () => {
    expect(isAutoUpdatePromptBlocked(false, false, 99_999, 1000)).toBe(false);
  });
});
