import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";

test("empty workspace offers an explicit research and demo path", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Start your first research session." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Start an analysis/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Explore demo session/ })).toBeVisible();
});

test("demo sources stream through research into traceable report evidence", async ({ page }) => {
  await page.goto("/research/new");
  await expect(page.getByText("Local evidence extraction", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Try Aetheris with example clinical documents/ }).click();
  await expect(page.getByText("3 ready", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: /Extract evidence locally|Run six-agent analysis/ }).click();
  await expect(page).toHaveURL(/\/research\/[A-Za-z0-9_-]+/);
  await expect(page.getByRole("heading", { name: "The answer, with the evidence attached." })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Bottom line")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Findings that answer your question", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Safety findings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What the documents describe", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What remains uncertain", exact: true })).toBeVisible();
  await expect(page.getByText("Aetheris assessment")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Specialist review record" })).toBeVisible();
  await expect(page.getByText("Drug Interaction", { exact: true })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "PDF", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("aetheris-evidence-brief.pdf");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect((await stat(downloadPath!)).size).toBeGreaterThan(2_000);

  await page.getByRole("button", { name: /Open evidence from/ }).first().click();
  await expect(page.getByText("Source evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("Why this matters")).toBeVisible();
  await page.getByRole("button", { name: "Close source evidence" }).click();

  await page.getByText("How Aetheris produced this answer").click();
  await expect(page.getByText(/page boundaries preserved/)).toBeVisible();
});

test("a prior analysis can be deleted without leaving stale workspace entries", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Explore demo session/ }).click();
  await expect(page).toHaveURL(/\/research\//);
  await page.goto("/dashboard");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Delete analysis:/ }).click();
  await expect(page.getByRole("heading", { name: "Start your first research session." })).toBeVisible();
});
