import { test, expect } from "@playwright/test";

test.describe("Echo (web build smoke)", () => {
  test("loads the app (uses playwright.config baseURL or PW_BASE_URL)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15_000 });
  });
});
