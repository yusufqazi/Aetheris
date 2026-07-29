import { describe, expect, it } from "vitest";
import { createClinicalFindingTitle } from "@/lib/research/finding-titles";

describe("createClinicalFindingTitle", () => {
  it("replaces fragment-based outstanding-evidence labels", () => {
    expect(
      createClinicalFindingTitle({
        statement:
          "Outstanding evidence needs final biopsy classification, blood and urine culture results, organism susceptibilities, creatinine trend, fever response, and a repeat tacrolimus trough to finalize management.",
        providedTitle: "Outstanding Needs Final",
        dimension: "limitation",
      }),
    ).toBe("Outstanding Evidence");
  });

  it("describes the consequence instead of copying connective words", () => {
    expect(
      createClinicalFindingTitle({
        statement:
          "Because delayed treatment could cause irreversible graft injury, begin empiric high-dose methylprednisolone now while biopsy is arranged.",
        providedTitle: "Because Delayed Cause",
        dimension: "context",
        contentTypes: ["recommendation"],
      }),
    ).toBe("Risk of Delayed Treatment");
  });

  it("turns malformed disagreement labels into meaningful treatment titles", () => {
    expect(
      createClinicalFindingTitle({
        statement:
          "Transplant nephrology recommends immediate pulse-dose steroids to protect the graft.",
        providedTitle: "True Disagreement Transplant",
        dimension: "context",
        contentTypes: ["recommendation"],
      }),
    ).toBe("Steroid Timing Disagreement");
  });

  it("summarizes the underlying safety concern", () => {
    expect(
      createClinicalFindingTitle({
        statement: "Starting steroids immediately may worsen active infection.",
        providedTitle: "Reasoning Pulse Dose",
        dimension: "safety",
      }),
    ).toBe("Infection Risk");
  });

  it("generalizes to diagnosis and outcome findings", () => {
    expect(
      createClinicalFindingTitle({
        statement:
          "Acute cellular rejection is the most likely cause of allograft dysfunction.",
        dimension: "diagnosis",
      }),
    ).toBe("Acute Cellular Rejection Diagnosis");

    expect(
      createClinicalFindingTitle({
        statement: "Hemoglobin improved after iron replacement therapy.",
        dimension: "efficacy",
      }),
    ).toBe("Hemoglobin Outcome");
  });

  it("preserves meaningful clinical acronym casing", () => {
    expect(
      createClinicalFindingTitle({
        statement: "QTc prolongation may increase the risk of arrhythmia.",
        dimension: "safety",
      }),
    ).toBe("QTc Prolongation Risk");
  });
});
