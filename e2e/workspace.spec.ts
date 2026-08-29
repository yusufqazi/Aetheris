import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";

import { makeDemoSession } from "@/lib/demo-data";
import type { GroundedFact, ResearchContentType, ResearchSession } from "@/lib/types";

test("empty workspace offers an explicit research and demo path", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Start your first research session." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Start an analysis/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Explore demo session/ })).toBeVisible();
});

test("demo report stays concise while preserving export and source inspection", async ({ page }, testInfo) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Explore demo session/ }).click();
  await expect(page).toHaveURL(/\/research\/[A-Za-z0-9_-]+/);
  await expect(page.getByText("Primary answer", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Findings and unresolved evidence" })).toBeVisible();
  await expect(page.getByText("Bottom line")).toHaveCount(0);
  await expect(page.getByText("Aetheris assessment")).toHaveCount(0);
  await expect(page.getByText("Evidence brief ready")).toHaveCount(0);

  if (testInfo.project.name === "mobile") {
    await expect(page.locator("details").filter({ hasText: /^Findings/ }).first()).toBeVisible();
    const contentBox = await page.locator('[data-testid="finding-content"]:visible').first().boundingBox();
    const citationBox = await page.locator('[data-testid="finding-citations"]:visible').first().boundingBox();
    expect(contentBox).not.toBeNull();
    expect(citationBox).not.toBeNull();
    expect(citationBox!.y).toBeGreaterThanOrEqual(contentBox!.y + contentBox!.height);
  } else {
    await expect(page.getByRole("tab", { name: /Findings/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Conflicts 0/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Open Questions/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Changes/ })).toHaveCount(0);
    const contentBox = await page.locator('[data-testid="finding-content"]:visible').first().boundingBox();
    const citationBox = await page.locator('[data-testid="finding-citations"]:visible').first().boundingBox();
    const citationButtonBox = await page.locator('[data-testid="finding-citations"]:visible button').first().boundingBox();
    expect(contentBox).not.toBeNull();
    expect(citationBox).not.toBeNull();
    expect(citationButtonBox).not.toBeNull();
    expect(contentBox!.width).toBeGreaterThan(400);
    expect(citationBox!.x).toBeGreaterThanOrEqual(contentBox!.x + contentBox!.width);
    expect(citationButtonBox!.x).toBeGreaterThanOrEqual(contentBox!.x + contentBox!.width);
    expect(citationButtonBox!.x + citationButtonBox!.width).toBeLessThanOrEqual(citationBox!.x + citationBox!.width);
  }

  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "PDF", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("aetheris-evidence-brief.pdf");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect((await stat(downloadPath!)).size).toBeGreaterThan(2_000);

  await page.getByRole("button", { name: /Open \d+ evidence excerpt.* from/ }).first().click();
  await expect(page.getByText("Source evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("Mapped evidence", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Relevant evidence" })).toBeVisible();
  await expect(page.getByText("Mapped to", { exact: true })).toBeVisible();
  await expect(page.getByText("Show more context", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close source evidence" }).click();

  await page.getByText("How Aetheris analyzed this").click();
  await expect(page.getByText(/passages ranked with lexical retrieval/i)).toBeVisible();
  await expect(page.getByText("Interaction extraction", { exact: true })).toBeVisible();
});

test("results stay within common laptop viewports", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Laptop viewport checks run in the desktop browser.");
  const session = makeDemoSession();
  await page.addInitScript((prepared) => {
    window.localStorage.setItem("aetheris-sessions", JSON.stringify([prepared]));
  }, session);

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1512, height: 982 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/research/${session.id}`);
    await expect(page.getByText("Primary answer", { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "PDF", exact: true })).toBeInViewport();
  }
});

test("guest research is not retained after a full reload", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Explore demo session/ }).click();
  await expect(page).toHaveURL(/\/research\//);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Start your first research session." })).toBeVisible();
});

test("the account entry validates email and makes guest persistence clear", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();

  await page.getByLabel("Email address").fill("not-an-email");
  await page.getByLabel("Password").fill("researcher");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("status")).toHaveText("Enter a valid email address before continuing.");

  await page.getByRole("button", { name: /Continue as guest/ }).click();
  await expect(page).toHaveURL(/\/research\/new\?guest=1/);
  await expect(page.getByRole("complementary", { name: "Guest workspace notice" })).toBeVisible();
});

test("balanced findings, conflicts, and open questions remain readable", async ({ page }, testInfo) => {
  const session = makeBalancedResultsSession();
  await page.addInitScript((prepared) => {
    window.localStorage.setItem("aetheris-sessions", JSON.stringify([prepared]));
  }, session);
  await page.goto(`/research/${session.id}`);
  await expect(page.getByText("Primary answer", { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath("findings.png"), fullPage: true });

  if (testInfo.project.name === "desktop") {
    const contentBox = await page.locator('[data-testid="finding-content"]:visible').first().boundingBox();
    const citationBox = await page.locator('[data-testid="finding-citations"]:visible').first().boundingBox();
    const citationButtonBox = await page.locator('[data-testid="finding-citations"]:visible button').first().boundingBox();
    expect(contentBox).not.toBeNull();
    expect(citationBox).not.toBeNull();
    expect(citationButtonBox).not.toBeNull();
    expect(contentBox!.width).toBeGreaterThan(400);
    expect(citationBox!.x).toBeGreaterThanOrEqual(contentBox!.x + contentBox!.width);
    expect(citationButtonBox!.x).toBeGreaterThanOrEqual(contentBox!.x + contentBox!.width);
    expect(citationButtonBox!.x + citationButtonBox!.width).toBeLessThanOrEqual(citationBox!.x + citationBox!.width);
    await page.getByRole("tab", { name: /Conflicts/ }).click();
    await expect(page.locator("p:visible").filter({ hasText: /medication records describe omeprazole/i }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("conflicts.png"), fullPage: true });
    await page.getByRole("tab", { name: /Open Questions/ }).click();
  } else {
    const citationsBox = await page.locator('[data-testid="finding-citations"]:visible').first().boundingBox();
    const contentBox = await page.locator('[data-testid="finding-content"]:visible').first().boundingBox();
    expect(citationsBox!.y).toBeGreaterThanOrEqual(contentBox!.y + contentBox!.height);
    const conflictDetails = page.locator("details").filter({ hasText: /^Conflicts/ }).first();
    await conflictDetails.locator("summary").click();
    await expect(conflictDetails.getByText(/medication records describe omeprazole/i).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("conflicts.png"), fullPage: true });
    const questionDetails = page.locator("details").filter({ hasText: /^Open Questions/ }).first();
    await questionDetails.locator("summary").first().click();
  }

  const ferritin = page.locator("details:visible").filter({ hasText: /Will ferritin normalize with oral therapy alone\?/ }).last();
  await ferritin.locator("summary").click();
  await expect(ferritin.getByText(/Follow-up ferritin.*14 ng\/mL.*remains low/i)).toBeVisible();
  await expect(ferritin.getByText(/palpitations|QTc/i)).toHaveCount(0);
  await ferritin.getByRole("button", { name: /Open 2 evidence excerpts/ }).click();
  const inspector = page.locator('[data-testid="evidence-inspector"]:visible');
  await expect(inspector.getByText("Mapped evidence", { exact: true })).toBeVisible();
  const visibleQuotes = inspector.locator("mark:visible");
  await expect(visibleQuotes).toHaveCount(2);
  expect((await visibleQuotes.allTextContents()).join(" ")).toMatch(/ferritin/i);
  expect((await visibleQuotes.allTextContents()).join(" ")).not.toMatch(/palpitations|QTc|ambulatory/i);
  await expect(inspector.getByText("View full page text", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("open-questions.png"), fullPage: true });
});

function makeBalancedResultsSession(): ResearchSession {
  const session = makeDemoSession();
  session.id = "balanced-results-session";
  session.question = "Assess treatment efficacy, safety, and limitations.";
  const records: Array<{ type: ResearchContentType; text: string; documentIndex?: number }> = [
    { type: "finding", text: "Baseline ferritin: 6 ng/mL." },
    { type: "limitation", text: "Follow-up ferritin: 14 ng/mL after four weeks; ferritin remains low." },
    { type: "longitudinal_change", text: "Hemoglobin increased from 8.7 to 10.4 g/dL after four weeks." },
    { type: "longitudinal_change", text: "Fatigue Severe, daily Moderate About 40% improved." },
    { type: "finding", text: "Symptoms improved but persist; ambulatory monitoring may still be useful." },
    { type: "longitudinal_change", text: "Follow-up QTc improved from 477 ms to 449 ms, but ongoing ECG surveillance may be prudent." },
    { type: "limitation", text: "Heavy menstrual bleeding persisted during follow-up." },
    { type: "limitation", text: "Gastrointestinal blood loss was not formally excluded." },
    { type: "finding", text: "The medication list records omeprazole for use as needed.", documentIndex: 1 },
    { type: "discrepancy", text: "Medication records describe omeprazole as needed, whereas the clinical history reports use 5-6 days per week." },
    { type: "unresolved_question", text: "Will ferritin normalize with oral therapy alone?" },
    { type: "unresolved_question", text: "Are palpitations entirely secondary to anemia?" },
    { type: "unresolved_question", text: "What is the definitive source of blood loss?" },
    { type: "unresolved_question", text: "Definitive source of blood loss?" },
  ];
  const pageText = records.filter((record) => record.documentIndex !== 1).map((record) => record.text).join("\n");
  const document = {
    ...session.documents[0],
    id: "document:balanced",
    name: "Follow_Up_and_Treatment_Response.pdf",
    text: pageText,
    pageCount: 1,
    pages: [{ number: 1, text: pageText, startOffset: 0, endOffset: pageText.length }],
  };
  const medicationText = records.filter((record) => record.documentIndex === 1).map((record) => record.text).join("\n");
  const medicationDocument = {
    ...session.documents[1],
    id: "document:medication-list",
    name: "Medication_List.pdf",
    text: medicationText,
    pageCount: 1,
    pages: [{ number: 1, text: medicationText, startOffset: 0, endOffset: medicationText.length }],
  };
  session.documents = [document, medicationDocument];
  const facts: GroundedFact[] = records.map((record, index) => {
    const source = record.documentIndex === 1 ? medicationDocument : document;
    return {
      id: `fact:balanced:${index}`,
      category: record.type === "discrepancy" || record.type === "unresolved_question" || record.type === "limitation" ? "limitation" : "efficacy",
      contentType: record.type,
      text: record.text,
      evidenceId: `evidence:balanced:${index}`,
      documentId: source.id,
      documentName: source.name,
      page: 1,
      excerpt: record.text,
      relevance: "Directly relevant follow-up evidence.",
    };
  });
  session.evidence = facts.map((fact, index) => ({
    id: fact.evidenceId,
    chunkId: `chunk:balanced:${index}`,
    documentId: fact.documentId,
    excerpt: fact.excerpt,
    documentName: fact.documentName,
    page: 1,
    section: "Page 1",
    relevance: fact.relevance,
    contextBefore: "",
    contextAfter: "",
    matchedTerms: [],
    lexicalScore: 1 - index / 100,
    similarityScore: null,
    retrievalMethod: "lexical",
  }));
  session.results = {
    ...session.results!,
    groundedFacts: facts,
    citations: undefined,
    reportGeneration: {
      ...session.results!.reportGeneration,
      executiveSummary: "The modified regimen was followed by meaningful hematologic and symptomatic improvement over four weeks, while low ferritin and unresolved blood loss limit conclusions about durability.",
      recommendedFollowUpQuestions: ["Definitive source of blood loss?"],
      citations: undefined,
      researchIntelligence: undefined,
    },
  };
  return session;
}
