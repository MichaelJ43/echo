import { test, expect } from "@playwright/test";

async function gotoLoaded(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15_000 });
}

test.describe("Sidebar Menu (meta menu)", () => {
  test("opens from Menu button and lists expected actions", async ({ page }) => {
    await gotoLoaded(page);

    await page.getByTestId("sidebar-menu-trigger").click();
    const menu = page.getByTestId("sidebar-meta-menu");
    await expect(menu).toBeVisible();

    await expect(menu.getByTestId("meta-menu-check-updates")).toBeVisible();
    await expect(menu.getByTestId("meta-menu-view-releases")).toBeVisible();
    await expect(menu.getByTestId("meta-menu-secrets")).toBeVisible();
    await expect(menu.getByTestId("meta-menu-export-workspace")).toBeVisible();
    await expect(menu.getByTestId("meta-menu-about")).toBeVisible();

    await expect(menu.getByRole("button", { name: "Check for updates" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "View releases" })).toBeVisible();
    await expect(
      menu.getByRole("button", { name: "Manage local secrets" })
    ).toBeVisible();
    await expect(menu.getByRole("button", { name: "Export workspace…" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "About Echo" })).toBeVisible();
  });

  test("opens from right-click on Menu label", async ({ page }) => {
    await gotoLoaded(page);

    await page.getByTestId("sidebar-menu-trigger").click({ button: "right" });
    await expect(page.getByTestId("sidebar-meta-menu")).toBeVisible();
  });

  test("About Echo opens modal with version and closes via header button", async ({
    page,
  }) => {
    await gotoLoaded(page);

    await page.getByTestId("sidebar-menu-trigger").click();
    await page.getByTestId("meta-menu-about").click();

    const dialog = page.getByTestId("about-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "About Echo" })).toBeVisible();
    await expect(page.getByTestId("about-version")).toContainText(/Version\s+\d+\.\d+\.\d+/);

    await page.getByTestId("about-dialog-close").click();
    await expect(page.getByTestId("about-dialog")).toBeHidden();
  });

  test("web build: Manage local secrets shows toast instead of modal", async ({
    page,
  }) => {
    await gotoLoaded(page);

    await page.getByTestId("sidebar-menu-trigger").click();
    await page.getByTestId("meta-menu-secrets").click();

    await expect(page.getByTestId("secrets-dialog")).toHaveCount(0);
    await expect(page.getByTestId("update-info-toast")).toContainText(
      /desktop app/i
    );
  });
});

test.describe("Folder tree context menus", () => {
  test("folder row opens folder context menu with export and rename actions", async ({
    page,
  }) => {
    await gotoLoaded(page);

    const folderRow = page.locator('[data-testid^="folder-"]').first();
    await folderRow.click({ button: "right" });

    const menu = page.getByTestId("folder-context-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("create-folder-in-folder")).toBeVisible();
    await expect(menu.getByTestId("create-request-in-folder")).toBeVisible();
    await expect(menu.getByTestId("export-folder")).toBeVisible();
    await expect(menu.getByTestId("import-workspace")).toBeVisible();
    await expect(menu.getByTestId("rename-folder")).toBeVisible();
    await expect(menu.getByTestId("delete-folder")).toBeVisible();
  });

  test("request row opens request context menu with export and rename", async ({
    page,
  }) => {
    await gotoLoaded(page);

    const requestRow = page.locator('[data-testid^="request-"]').first();
    await requestRow.click({ button: "right" });

    const menu = page.getByTestId("request-context-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("export-request")).toBeVisible();
    await expect(menu.getByTestId("rename-request")).toBeVisible();
    await expect(menu.getByTestId("delete-request")).toBeVisible();
  });

  test("opening a second context menu closes the previous one", async ({ page }) => {
    await gotoLoaded(page);

    await page.locator('[data-testid^="folder-"]').first().click({ button: "right" });
    await expect(page.getByTestId("folder-context-menu")).toBeVisible();

    await page.locator('[data-testid^="request-"]').first().click({ button: "right" });

    await expect(page.getByTestId("folder-context-menu")).toHaveCount(0);
    await expect(page.getByTestId("request-context-menu")).toBeVisible();
  });

  test("dismisses folder menu when clicking elsewhere", async ({ page }) => {
    await gotoLoaded(page);

    await page.locator('[data-testid^="folder-"]').first().click({ button: "right" });
    await expect(page.getByTestId("folder-context-menu")).toBeVisible();

    await page.getByTestId("request-panel").click({ position: { x: 20, y: 20 } });
    await expect(page.getByTestId("folder-context-menu")).toHaveCount(0);
  });
});

test.describe("Environment section (smoke)", () => {
  test("shows environment controls when a request is selected", async ({ page }) => {
    await gotoLoaded(page);

    await expect(page.getByTestId("environment-select")).toBeVisible();
    await expect(page.getByTestId("add-environment")).toBeVisible();
    await expect(page.getByTestId("rename-environment")).toBeVisible();
    await expect(page.getByTestId("duplicate-environment")).toBeVisible();
    await expect(page.getByTestId("delete-environment")).toBeVisible();
  });
});
