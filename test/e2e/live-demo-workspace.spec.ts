import { expect, test, type Page } from "@playwright/test";
import { seedDemoWorkspace } from "./helpers/load-demo-workspace";

/**
 * Live HTTP tests using `examples/echo-feature-demo.workspace.json` against
 * https://httpbin.org and https://jsonplaceholder.typicode.com (same as the demo file).
 * Requires network; run from repo root: `npm run test:e2e`.
 */

const R = {
  getQuery: "r0000001-0000-4000-8000-000000000001",
  postJson: "r0000001-0000-4000-8000-000000000002",
  postRaw: "r0000001-0000-4000-8000-000000000007",
  postForm: "r0000001-0000-4000-8000-000000000003",
  postMultipart: "r0000001-0000-4000-8000-000000000008",
  getHeaders: "r0000001-0000-4000-8000-000000000004",
  head: "r0000001-0000-4000-8000-000000000005",
  options: "r0000001-0000-4000-8000-000000000006",
  getUuid: "r0000002-0000-4000-8000-000000000001",
  bearer: "r0000003-0000-4000-8000-000000000001",
  basic: "r0000003-0000-4000-8000-000000000002",
  apiKeyHeader: "r0000003-0000-4000-8000-000000000003",
  apiKeyQuery: "r0000003-0000-4000-8000-000000000004",
  jpGet: "r0000004-0000-4000-8000-000000000001",
  jpPut: "r0000004-0000-4000-8000-000000000002",
  jpPatch: "r0000004-0000-4000-8000-000000000003",
  jpDelete: "r0000004-0000-4000-8000-000000000004",
  scriptHttpbin: "r0000005-0000-4000-8000-000000000001",
  scriptCreate: "r0000005-0000-4000-8000-000000000002",
} as const;

async function gotoLoaded(page: Page) {
  await seedDemoWorkspace(page);
  await page.goto("/");
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 20_000 });
}

async function selectRequest(page: Page, requestId: string) {
  const row = page.getByTestId(`request-${requestId}`);
  await row.scrollIntoViewIfNeeded();
  await row.click();
}

async function sendExpectStatus(page: Page, statusRe: RegExp) {
  await page.getByTestId("send-button").click();
  await expect(page.getByTestId("send-button")).toHaveText("Send", {
    timeout: 90_000,
  });
  const statusEl = page.getByTestId("response-status");
  try {
    await expect(statusEl).toBeVisible({ timeout: 5_000 });
  } catch {
    const headerErr = page.locator(".response-header .status-err").last();
    const msg = (await headerErr.isVisible())
      ? await headerErr.textContent()
      : "no response-status";
    throw new Error(`Expected response after Send: ${msg}`);
  }
  await expect(statusEl).toContainText(statusRe);
}

/** Same host the app uses; skip demo tests if DNS/firewall blocks it. */
async function jsonPlaceholderReachable(page: Page): Promise<boolean> {
  try {
    const res = await page.request.get(
      "https://jsonplaceholder.typicode.com/posts/1",
      { timeout: 30_000 }
    );
    return res.ok();
  } catch {
    return false;
  }
}

test.describe("Live demo workspace (examples/echo-feature-demo.workspace.json)", () => {
  test.describe.configure({
    mode: "serial",
    timeout: 120_000,
    retries: process.env.CI ? 1 : 0,
  });

  test("Basics — GET query, POST JSON/raw/form/multipart, custom headers, HEAD, OPTIONS", async ({
    page,
  }) => {
    await gotoLoaded(page);

    await selectRequest(page, R.getQuery);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("alpha", {
      timeout: 5_000,
    });

    await selectRequest(page, R.postJson);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("Echo", {
      timeout: 5_000,
    });

    await selectRequest(page, R.postRaw);
    await sendExpectStatus(page, /200/);

    await selectRequest(page, R.postForm);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("form", {
      timeout: 5_000,
    });

    await selectRequest(page, R.postMultipart);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("Echo demo multipart", {
      timeout: 5_000,
    });

    await selectRequest(page, R.getHeaders);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("X-Echo-Demo", {
      timeout: 5_000,
    });

    await selectRequest(page, R.head);
    await sendExpectStatus(page, /200/);

    await selectRequest(page, R.options);
    await sendExpectStatus(page, /200/);
  });

  test("Environments — {{httpbin}} in URL (GET uuid)", async ({ page }) => {
    await gotoLoaded(page);
    await selectRequest(page, R.getUuid);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("uuid", {
      timeout: 5_000,
    });
  });

  test("Auth — Bearer, Basic, API key header & query (httpbin)", async ({ page }) => {
    await gotoLoaded(page);

    await selectRequest(page, R.bearer);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("my-public-demo-token", {
      timeout: 5_000,
    });

    await selectRequest(page, R.basic);
    await sendExpectStatus(page, /200/);

    await selectRequest(page, R.apiKeyHeader);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("X-Api-Token", {
      timeout: 5_000,
    });

    await selectRequest(page, R.apiKeyQuery);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("api_key", {
      timeout: 5_000,
    });
  });

  test("JSONPlaceholder — GET, PUT, PATCH, DELETE post 1", async ({ page }) => {
    test.skip(
      !(await jsonPlaceholderReachable(page)),
      "jsonplaceholder.typicode.com unreachable from this environment"
    );
    await gotoLoaded(page);

    await selectRequest(page, R.jpGet);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("userId", {
      timeout: 5_000,
    });

    await selectRequest(page, R.jpPut);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("Echo demo PUT", {
      timeout: 5_000,
    });

    await selectRequest(page, R.jpPatch);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("Echo demo PATCH", {
      timeout: 5_000,
    });

    await selectRequest(page, R.jpDelete);
    await sendExpectStatus(page, /200/);
  });

  test("Completion script — pm.response / console.log (httpbin /json)", async ({ page }) => {
    await gotoLoaded(page);

    await selectRequest(page, R.scriptHttpbin);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("script-log")).toContainText("Slideshow author:", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("script-log")).toContainText("HTTP status:", {
      timeout: 5_000,
    });
  });

  test("Completion script — JSONPlaceholder POST (create post)", async ({ page }) => {
    test.skip(
      !(await jsonPlaceholderReachable(page)),
      "jsonplaceholder.typicode.com unreachable from this environment"
    );
    await gotoLoaded(page);

    await selectRequest(page, R.scriptCreate);
    await sendExpectStatus(page, /201/);
    await expect(page.getByTestId("script-log")).toContainText("New post id:", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("script-log")).toContainText("Echo completion script", {
      timeout: 5_000,
    });
  });

  test("Response panel is per-request when switching", async ({ page }) => {
    await gotoLoaded(page);

    await selectRequest(page, R.getQuery);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("alpha");

    await selectRequest(page, R.postJson);
    await sendExpectStatus(page, /200/);
    await expect(page.getByTestId("response-body")).toContainText("Echo");

    await selectRequest(page, R.getQuery);
    await expect(page.getByTestId("response-body")).toContainText("alpha", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("response-body")).not.toContainText(
      "JSON body with Content-Type"
    );
  });
});
