import { describe, expect, it } from "vitest";

import { polishPrimaryAnswerFluency } from "@/lib/research/primary-answer";

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
});
