import { test, expect } from "@playwright/test";

test.describe("Echo (web build smoke)", () => {
  test("placeholder — run against `vite dev` with PW_BASE_URL", async ({
    page,
  }) => {
    const base = process.env.PW_BASE_URL ?? "http://127.0.0.1:1420";
    await page.goto(base);
    await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  });
});
