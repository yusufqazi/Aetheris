import { describe, expect, it } from "vitest";

import {
  areDuplicateSupportingPassages,
  areOverlappingClinicalConclusions,
  areOverlappingEvidencePassages,
} from "@/lib/research/finding-deduplication";
import { rankEvidenceRelationships } from "@/lib/research/evidence-relationships";
import type { EvidenceRelationship } from "@/lib/types";

describe("finding and evidence deduplication", () => {
  it("recognizes paraphrased conclusions that communicate the same clinical point", () => {
    expect(areOverlappingClinicalConclusions(
      "Septic shock remains the leading diagnosis.",
      "The uploaded evidence strongly supports septic shock as the most likely diagnosis.",
    )).toBe(true);
    expect(areOverlappingClinicalConclusions(
      "The documented syndrome remains the leading diagnosis.",
      "The documented syndrome remains the leading diagnosis across the reviewed record.",
    )).toBe(true);
  });

  it("preserves conclusions with different decisions, polarity, or measurements", () => {
    expect(areOverlappingClinicalConclusions(
      "Septic shock is the leading diagnosis.",
      "Septic shock requires immediate antibiotic treatment.",
    )).toBe(false);
    expect(areOverlappingClinicalConclusions(
      "Treatment should begin now.",
      "Treatment should be deferred pending biopsy.",
    )).toBe(false);
    expect(areOverlappingClinicalConclusions(
      "The response rate was 62%.",
      "The response rate was 41%.",
    )).toBe(false);
  });

  it("detects overlapping source passages without collapsing different values", () => {
    expect(areOverlappingEvidencePassages(
      "Persistent hypotension and lactate 4.8 mmol/L confirm septic shock as the leading diagnosis.",
      "Persistent hypotension and lactate 4.8 mmol/L confirm septic shock as the leading diagnosis during this admission.",
    )).toBe(true);
    expect(areOverlappingEvidencePassages(
      "The response rate was 62% after twelve weeks of treatment.",
      "The response rate was 41% after twelve weeks of treatment.",
    )).toBe(false);
    expect(areDuplicateSupportingPassages(
      "The same decisive source passage is repeated verbatim.",
      "The same decisive source passage is repeated verbatim.",
      false,
    )).toBe(true);
    expect(areDuplicateSupportingPassages(
      "Persistent hypotension and lactate 4.8 mmol/L confirm septic shock as the leading diagnosis.",
      "Persistent hypotension and lactate 4.8 mmol/L confirm septic shock as the leading diagnosis during this admission.",
      false,
    )).toBe(false);
  });

  it("keeps the strongest relationship when same-page passages overlap", () => {
    const target = "Septic shock is the leading diagnosis.";
    const weaker = relationship({
      id: "relationship:weak",
      citationId: "citation:weak",
      exactQuote: "Persistent hypotension and lactate 4.8 mmol/L confirm septic shock as the leading diagnosis during this admission.",
      confidence: "low",
    });
    const stronger = relationship({
      id: "relationship:strong",
      citationId: "citation:strong",
      exactQuote: "Persistent hypotension and lactate 4.8 mmol/L confirm septic shock as the leading diagnosis.",
      confidence: "high",
    });

    const ranked = rankEvidenceRelationships(target, [weaker, stronger]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].citationId).toBe("citation:strong");
  });
});

function relationship(
  overrides: Partial<EvidenceRelationship> & Pick<EvidenceRelationship, "id" | "citationId" | "exactQuote">,
): EvidenceRelationship {
  return {
    evidenceId: "evidence:one",
    supportedItemId: "finding:one",
    relationshipType: "supports",
    relevanceExplanation: "Directly establishes the selected conclusion.",
    documentId: "document:one",
    documentName: "Acute_Care_Note.pdf",
    page: 1,
    confidence: "medium",
    ...overrides,
  };
}
