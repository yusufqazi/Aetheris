import { describe, expect, it } from "vitest";

import {
  isClinicallyImportantUncertainty,
  isGenericOpenQuestion,
  isOpenQuestionAnswered,
  openQuestionFromGap,
} from "@/lib/research/open-questions";
import type { GroundedFact, ResearchContentType } from "@/lib/types";

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

  it("recognizes when a finalized source result answers an older open question", () => {
    expect(isOpenQuestionAnswered(
      "What do the pending blood cultures show?",
      [fact("finding", "Final blood cultures grew Escherichia coli.")],
    )).toBe(true);
  });

  it("does not treat a conditional recommendation as the missing test result", () => {
    expect(isOpenQuestionAnswered(
      "What is the documented result for kidney biopsy?",
      [fact("recommendation", "Long-term therapy should be deferred until kidney biopsy is completed.")],
    )).toBe(false);
  });

  it("recognizes clinically important uncertainty outside formal limitation records", () => {
    expect(isClinicallyImportantUncertainty(
      "Possible urinary obstruction has not been excluded and may require source-control intervention.",
    )).toBe(true);
  });
});

function fact(contentType: ResearchContentType, text: string): GroundedFact {
  return {
    id: `fact:${contentType}`,
    category: contentType === "recommendation" ? "context" : "efficacy",
    contentType,
    text,
    evidenceId: `evidence:${contentType}`,
    documentId: `document:${contentType}`,
    documentName: `${contentType}.pdf`,
    page: 1,
    excerpt: text,
    relevance: "Test evidence.",
  };
}
