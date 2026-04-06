import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

/** Matches `LS_KEY` in `src/api.ts` (browser / web dev build). */
export const WORKSPACE_STORAGE_KEY = "echo.workspace.v1";

export function readDemoWorkspaceJson(): string {
  const path = join(process.cwd(), "examples", "echo-feature-demo.workspace.json");
  return readFileSync(path, "utf8");
}

/**
 * Seeds localStorage before the app loads so `loadState()` receives the demo workspace.
 * Call before the first `page.goto` in the test (or rely on addInitScript running before each navigation).
 */
export async function seedDemoWorkspace(page: Page): Promise<void> {
  const raw = readDemoWorkspaceJson();
  await page.addInitScript(
    (payload: { key: string; raw: string }) => {
      localStorage.setItem(payload.key, payload.raw);
    },
    { key: WORKSPACE_STORAGE_KEY, raw }
  );
}
