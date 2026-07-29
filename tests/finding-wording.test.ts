import { describe, expect, it } from "vitest";
import { polishGeneratedFinding } from "@/lib/research/finding-wording";

describe("polishGeneratedFinding", () => {
  it("preserves an already complete synthesized finding", () => {
    const finding =
      "Severe systolic dysfunction substantially increases procedural risk but is not an absolute contraindication.";

    expect(polishGeneratedFinding(finding, "Procedural Risk")).toBe(finding);
  });

  it("removes source headings without changing the clinical conclusion", () => {
    expect(
      polishGeneratedFinding(
        "Cardiology consultation: Aggressive fluid resuscitation may worsen pulmonary edema.",
        "Fluid Resuscitation Risk",
      ),
    ).toBe("Aggressive fluid resuscitation may worsen pulmonary edema.");
  });

  it("turns a laboratory fragment into a complete evidence statement", () => {
    expect(
      polishGeneratedFinding(
        "Positive ANA, elevated anti-dsDNA, and low complement levels.",
        "Autoimmune Evidence",
      ),
    ).toBe(
      "The evidence documents positive ANA, elevated anti-dsDNA, and low complement levels.",
    );
  });

  it("removes malformed generated labels from the finding itself", () => {
    expect(
      polishGeneratedFinding(
        "True Disagreement Transplant nephrology recommends immediate pulse-dose steroids to protect the graft.",
        "Steroid Timing Disagreement",
      ),
    ).toBe(
      "Transplant nephrology recommends immediate pulse-dose steroids to protect the graft.",
    );
  });

  it("rewrites a source section fragment as a complete statement", () => {
    expect(
      polishGeneratedFinding(
        "ASSESSMENT AND PLAN: Severe systolic heart failure with an ejection fraction of 20%.",
        "Heart Failure Assessment",
      ),
    ).toBe(
      "The evidence documents severe systolic heart failure with an ejection fraction of 20%.",
    );
  });
});
