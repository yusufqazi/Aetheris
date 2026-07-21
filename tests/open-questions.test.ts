import { describe, expect, it } from "vitest";

import {
  isGenericOpenQuestion,
  openQuestionFromGap,
} from "@/lib/research/open-questions";

describe("evidence-specific open questions", () => {
  it.each([
    ["Kidney biopsy has not yet been performed.", /documented result for kidney biopsy/i],
    ["Urine protein quantification is pending.", /pending urine protein quantification show/i],
    ["Renal function trend remains unknown.", /how does renal function trend change on repeat measurement/i],
    ["Obstructive disease was not formally excluded.", /obstructive disease.*confirmed or excluded/i],
    ["Final culture results remain pending.", /pending final culture results show/i],
  ])("turns %s into a concrete missing-result question", (gap, expected) => {
    const question = openQuestionFromGap(gap);

    expect(question).toMatch(expected);
    expect(isGenericOpenQuestion(question)).toBe(false);
  });

  it("identifies generic evidence-request templates", () => {
    expect(isGenericOpenQuestion("What additional evidence would reduce uncertainty?")).toBe(true);
    expect(isGenericOpenQuestion("What does the pending pathology result show?")).toBe(false);
  });
});
