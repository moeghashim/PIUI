import { expect, test } from "@playwright/test";

test("runs a streamed PI session and exposes extension behavior", async ({ page }, testInfo) => {
  page.on("pageerror", (error) => console.error("Browser page error:", error));
  await page.goto("/");
  await expect(page.getByText("What should PI build?")).toBeVisible();
  await page.getByRole("button", { name: "Start a session" }).click();
  await expect(page.getByRole("heading", { name: "Open a PI workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Start without project extensions" }).click();
  await expect(page.getByText("Fixture extension ready")).toBeVisible();
  const composer = page.getByLabel("Message PI");
  await composer.fill("Inspect the fixture");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("PIUI fixture response", { exact: false }).last()).toBeVisible();
  await expect(page.getByText("read", { exact: true }).first()).toBeVisible();
  await page.getByTitle("Extensions").click();
  await expect(page.getByRole("heading", { name: "Extensions" })).toBeVisible();
  await expect(page.getByText("TUI-only custom components", { exact: false })).toBeVisible();
  await page.screenshot({ path: `docs/piui-extensions-${testInfo.project.name}.png`, fullPage: false });
  await page.getByRole("button", { name: "Close extensions" }).click();
  await composer.fill("/dialog");
  const extensionHeading = page.getByRole("heading", { name: "Fixture extension" });
  if (!(await extensionHeading.isVisible())) await page.getByRole("button", { name: "Send message" }).click();
  await expect(extensionHeading).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Extension confirmed: yes", { exact: false })).toBeVisible();
  await page.screenshot({ path: `docs/piui-${testInfo.project.name}.png`, fullPage: false });
});

test("initial shell fits the viewport", async ({ page }) => {
  await page.goto("/");
  const fit = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    height: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    conversation: document.querySelector('[data-testid="conversation"]')?.getBoundingClientRect().toJSON(),
  }));
  expect(fit.width).toBe(0);
  expect(fit.height).toBe(0);
  expect(fit.conversation?.bottom).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
});
