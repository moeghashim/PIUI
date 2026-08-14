import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function waitForReady(page: import("@playwright/test").Page) {
  await expect(page.getByLabel("Message PI")).toBeEditable();
  await expect(page.getByRole("button", { name: /Choose model, current/ })).toBeEnabled();
}

test("runs the complete PIUI workflow and survives reload", async ({ page }, testInfo) => {
  page.on("pageerror", (error) => console.error("Browser page error:", error));
  await page.goto("/");
  await waitForReady(page);
  await expect(page.getByText("Fixture extension ready")).toBeVisible();

  const composer = page.getByLabel("Message PI");
  await composer.fill("PIUI textbox QA");
  await expect(composer).toHaveValue("PIUI textbox QA");
  await page.locator('input[type="file"]').setInputFiles({
    name: "qa-pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByText("qa-pixel.png")).toBeVisible();
  await page.getByRole("button", { name: "Remove qa-pixel.png" }).click();

  await page.getByRole("button", { name: /Choose model, current PI Test/ }).click();
  await expect(page.getByRole("heading", { name: "Choose a model" })).toBeVisible();
  await page.getByLabel("Search models").fill("alternate");
  await page.getByRole("button", { name: /PI Alternate/ }).click();
  await expect(page.getByRole("button", { name: /Choose model, current PI Alternate/ })).toBeVisible();
  await expect(page.getByLabel("Thinking level")).toHaveValue("off");

  await page.reload();
  await waitForReady(page);
  await expect(page.getByRole("button", { name: /Choose model, current PI Alternate/ })).toBeVisible();
  await expect(page.getByText("Fixture extension ready")).toBeVisible();
  await expect(page.getByRole("button", { name: "Commands", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: /Choose model, current PI Alternate/ }).click();
  await page.getByLabel("Search models").fill("PI Test");
  await page.getByRole("button", { name: /^PI Test / }).click();
  await expect(page.getByRole("button", { name: /Choose model, current PI Test/ })).toBeVisible();
  await expect(page.getByLabel("Thinking level").locator("option")).toHaveCount(4);

  await composer.fill("Inspect the fixture");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("PIUI fixture response", { exact: false }).last()).toBeVisible();
  await expect(page.getByText("read", { exact: true }).first()).toBeVisible();

  await page.reload();
  await waitForReady(page);
  await expect(page.getByText("PIUI fixture response", { exact: false }).last()).toBeVisible();
  await expect(page.locator(".session-strip").getByText(/\d+ messages/)).toBeVisible();

  await page.getByRole("button", { name: /Trajectory/ }).click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Session ledger" })).toBeVisible();
  await page.getByRole("button", { name: "Close session details" }).click();

  await page.getByTitle("Settings").click();
  await page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "Extensions" }).click();
  await expect(page.getByRole("heading", { name: "Extensions" })).toBeVisible();
  await expect(page.getByText("configured sources")).toBeVisible();
  await expect(page.getByText("Terminal-only custom components", { exact: false })).toBeVisible();
  await page.screenshot({ path: `docs/qa/piui/extensions-${testInfo.project.name}.png`, fullPage: false });
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "General" }).click();
  await expect(settings.getByText("PI permissions")).toBeVisible();
  await settings.getByRole("button", { name: "dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await settings.getByRole("button", { name: "system" }).click();
  await settings.getByRole("button", { name: "Models" }).click();
  await expect(settings.getByText("Reasoning effort")).toBeVisible();
  await settings.getByRole("button", { name: "Session" }).click();
  await expect(settings.getByRole("button", { name: "Compact context" })).toBeVisible();
  await expect(settings.getByRole("button", { name: "Export HTML" })).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();

  await page.getByRole("button", { name: "Commands", exact: true }).click();
  await page.getByRole("option", { name: /dialog/ }).click();
  await expect(composer).toHaveValue("/dialog ");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("heading", { name: "Fixture extension" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Extension confirmed: yes", { exact: false }).last()).toBeVisible();
  await page.screenshot({ path: `docs/qa/piui/complete-${testInfo.project.name}.png`, fullPage: false });
});

test("shell fits the viewport and has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await waitForReady(page);
  const fit = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    height: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    conversation: document.querySelector('[data-testid="conversation"]')?.getBoundingClientRect().toJSON(),
  }));
  expect(fit.width).toBe(0);
  expect(fit.height).toBe(0);
  expect(fit.conversation?.bottom).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
  expect(serious, serious.map((violation) => `${violation.id}: ${violation.description}`).join("\n")).toEqual([]);
});
