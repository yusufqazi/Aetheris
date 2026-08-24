import { describe, expect, it } from "vitest";

import {
  containsPrimaryAnswerSourceLeakage,
  paraphrasePrimaryAnswerEvidence,
  primaryAnswerQualityIssues,
  polishPrimaryAnswerFluency,
} from "@/lib/research/primary-answer";

describe("primary answer fluency", () => {
  it("removes section labels, source tags, random capitalization, and repetition", () => {
    const answer = polishPrimaryAnswerFluency(
      "PRIMARY ANSWER: Septic shock Is the Leading Diagnosis. " +
      "TREATMENT PRIORITY: Antibiotics Should Begin Immediately. " +
      "[Source: ED_Note.pdf, page 1] KEY TRADEOFF: Aggressive fluids May Worsen pulmonary edema. " +
      "REMAINING EVIDENCE: Blood cultures remain pending. " +
      "Septic shock remains the leading diagnosis.",
    );

    expect(answer).toBe(
      "Septic shock is the leading diagnosis. " +
      "Antibiotics should begin immediately. " +
      "Aggressive fluids may worsen pulmonary edema. " +
      "Blood cultures remain pending.",
    );
  });

  it("preserves clinical acronyms, measurements, and the underlying conclusions", () => {
    const answer = polishPrimaryAnswerFluency(
      "According to the Cardiology Consultation, EF 25% substantially increases procedural risk. " +
      "The evidence supports SLE based on positive ANA and low C3.",
    );

    expect(answer).toBe(
      "EF 25% substantially increases procedural risk. " +
      "The evidence supports SLE based on positive ANA and low C3.",
    );
  });

  it("turns a clinically meaningful fragment into concise prose", () => {
    expect(polishPrimaryAnswerFluency(
      "DIAGNOSIS: Severe systolic heart failure. TREATMENT PRIORITY: Vasopressor support should continue.",
    )).toBe(
      "The evidence identifies severe systolic heart failure. Vasopressor support should continue.",
    );
  });

  it("drops heading-like fragments instead of presenting them as conclusions", () => {
    expect(polishPrimaryAnswerFluency(
      "On efficacy, Factors Arguing Against or Increasing Risk. The treatment response remains uncertain.",
    )).toBe("The treatment response remains uncertain.");
  });

  it("detects patient identifiers, dates, testing notices, and flattened table labels", () => {
    expect(containsPrimaryAnswerSourceLeakage(
      "Patient Elena Marisol Vega MRN SYN-774219 Study Date 2026-07-29 Region Finding response.",
    )).toBe(true);
    expect(containsPrimaryAnswerSourceLeakage(
      "Synthetic Restaging Imaging Report created for testing purposes only.",
    )).toBe(true);
    expect(containsPrimaryAnswerSourceLeakage(
      "The imaging shows a partial radiographic response, while pulmonary safety remains uncertain.",
    )).toBe(false);
  });

  it("extracts a natural clinical conclusion without repeating a flattened source row", () => {
    const paraphrase = paraphrasePrimaryAnswerEvidence(
      "Patient Elena Marisol Vega MRN SYN-774219 Study CT chest with contrast " +
      "Study Date 2026-07-29 Region Finding Right upper-lobe mass decreased from 4; 6 cm to 2.9 cm " +
      "Partial radiographic response of the primary tumor and mediastinal adenopathy.",
    );

    expect(paraphrase).toBe(
      "The available evidence shows a partial radiographic response of the primary tumor and mediastinal adenopathy.",
    );
    expect(containsPrimaryAnswerSourceLeakage(paraphrase)).toBe(false);
  });

  it("rejects document titles and workflow language before a primary answer is accepted", () => {
    const malformed =
      "The available evidence shows independent safety Monitoring Committee Memorandum detection, " +
      "longitudinal reasoning, and source citation.";

    expect(containsPrimaryAnswerSourceLeakage(malformed)).toBe(true);
    expect(primaryAnswerQualityIssues(malformed, { singleDocument: true })).toEqual(
      expect.arrayContaining(["source-text-leakage", "single-document-sentence-count"]),
    );
    expect(paraphrasePrimaryAnswerEvidence(malformed)).toBe("");
  });
});
