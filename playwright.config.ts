import { defineConfig, devices } from "@playwright/test";

/** Match Vite dev server (`vite.config.ts` port 1420). */
const baseURL = process.env.PW_BASE_URL ?? "http://localhost:1420";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  /**
   * Start Vite on port 1420 (see `vite.config.ts`) unless you opt out.
   * Set `PLAYWRIGHT_SKIP_WEBSERVER=1` when you already run `npm run dev` (same URL);
   * `reuseExistingServer` reuses an existing listener locally.
   */
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
