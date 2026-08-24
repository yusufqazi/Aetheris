import { describe, expect, it } from "vitest";
import {
  generatedFindingQualityIssues,
  polishGeneratedFinding,
} from "@/lib/research/finding-wording";

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

  it("reduces a flattened metadata row to its clinical conclusion", () => {
    const raw =
      "The evidence documents patient Elena Marisol Vega MRN SYN-774219 study CT chest with contrast " +
      "study Date 2026-07-29 Region Finding Right upper-lobe mass decreased from 4.6 cm to 2.9 cm " +
      "Mediastinal lymph nodes decreased New lung finding Patchy ground-glass opacity Pleural effusion None " +
      "Distant disease No new metastatic lesion Partial radiographic response of the primary tumor and mediastinal adenopathy.";

    expect(generatedFindingQualityIssues(raw)).toContain("source-text-leakage");
    expect(polishGeneratedFinding(raw)).toBe(
      "The available evidence shows a partial radiographic response of the primary tumor and mediastinal adenopathy.",
    );
  });

  it("does not reject a clear longitudinal finding merely because it includes a date", () => {
    const finding = "At follow-up on 2026-07-29, the lesion decreased from 4.6 cm to 2.9 cm.";

    expect(generatedFindingQualityIssues(finding)).toEqual([]);
    expect(polishGeneratedFinding(finding)).toBe(finding);
  });
});
