import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const doc = {
      id: "logobar-test",
      title: "LogoBar Test.md",
      body: "# Test\n\nContent for logobar test.",
      createdAt: "2026-03-10T00:00:00.000Z",
    };
    window.localStorage.setItem("files", JSON.stringify([doc]));
    window.localStorage.setItem("currentDocument", JSON.stringify(doc));
  });
});

test("does not render advertising", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#logobar")).toHaveCount(0);
  await expect(page.locator('script[src*="servedby-buysellads"]')).toHaveCount(0);
});
