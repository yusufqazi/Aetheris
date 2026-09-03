import { describe, expect, it } from "vitest";

import { getAgentPrompt } from "@/lib/prompts";
import {
  numericOutcomeDiffers,
  recommendationsMateriallyConflict,
  sameManagementTarget,
} from "@/lib/research/conflict-semantics";

describe("conflict hardening", () => {
  it("recognizes a short clinical term as the shared management target", () => {
    const start = "Begin aspirin now.";
    const hold = "Withhold aspirin pending review.";

    expect(sameManagementTarget(start, hold)).toBe(true);
    expect(recommendationsMateriallyConflict(start, hold)).toBe(true);
  });

  it("does not turn two recommendations against the same therapy into a conflict", () => {
    expect(recommendationsMateriallyConflict(
      "Hold lisinopril and all NSAIDs.",
      "Avoid NSAIDs.",
    )).toBe(false);
  });

  it("preserves incompatible evidence thresholds within the same broad stance", () => {
    expect(recommendationsMateriallyConflict(
      "Do not proceed with biopsy solely because imaging is abnormal.",
      "Defer the biopsy decision until pathology review is available.",
    )).toBe(true);
  });

  it("recognizes different numeric results for the same measured outcome", () => {
    expect(numericOutcomeDiffers(
      "The response rate was 34% at week 12.",
      "The response rate was 12% at week 12.",
    )).toBe(true);
    expect(numericOutcomeDiffers(
      "The response rate was 34% at week 12.",
      "At week 12, the response rate was 34%.",
    )).toBe(false);
    expect(numericOutcomeDiffers(
      "Creatinine was 3.4 mg/dL on admission and 3.0 mg/dL after fluids.",
      "Follow-up creatinine improved to 2.7 mg/dL.",
    )).toBe(false);
  });

  it("instructs report generation to retain material and factual disagreements", () => {
    const prompt = getAgentPrompt("report-generation");

    expect(prompt).toMatch(/action, timing, intensity, threshold, escalation criteria/i);
    expect(prompt).toMatch(/incompatible factual results for the same outcome or measurement/i);
  });
});
