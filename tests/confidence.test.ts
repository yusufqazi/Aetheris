import { describe, expect, it } from "vitest";

import { assessEvidenceConfidence } from "@/lib/research/confidence";
import type { EvidenceItem, GroundedFact } from "@/lib/types";

describe("evidence confidence assessment", () => {
  it("does not convert a large retrieved-passage count into high confidence", () => {
    const fact = makeFact(
      0,
      "The available record describes a possible clinical association.",
      "document:one",
    );
    const repeatedEvidence = Array.from({ length: 12 }, (_, index) =>
      makeEvidence(index, fact.excerpt, "document:one")
    );

    const assessment = assessEvidenceConfidence({
      facts: [fact],
      evidence: repeatedEvidence,
    });

    expect(assessment.level).toBe("medium");
    expect(assessment.supportCount).toBe(1);
    expect(assessment.sourceCount).toBe(1);
  });

  it("recognizes strong, consistent support across independent sources", () => {
    const facts = [
      makeFact(0, "The laboratory result confirms hemoglobin was 8.7 g/dL.", "document:one"),
      makeFact(1, "The follow-up report documents hemoglobin improved to 10.4 g/dL.", "document:two"),
      makeFact(2, "The treatment record confirms symptoms improved after therapy.", "document:two"),
    ];
    const evidence = facts.map((fact, index) =>
      makeEvidence(index, fact.excerpt, fact.documentId)
    );

    const assessment = assessEvidenceConfidence({ facts, evidence });

    expect(assessment.level).toBe("high");
    expect(assessment.strongSupportCount).toBeGreaterThanOrEqual(2);
    expect(assessment.sourceCount).toBe(2);
    expect(assessment.consistencyScore).toBe(100);
  });

  it("lowers confidence when strong support has material counter-evidence", () => {
    const facts = [
      makeFact(0, "The laboratory result confirms hemoglobin was 8.7 g/dL.", "document:one"),
      makeFact(1, "The follow-up report documents hemoglobin improved to 10.4 g/dL.", "document:two"),
      makeFact(2, "The treatment record confirms symptoms improved after therapy.", "document:two"),
    ];
    const evidence = facts.map((fact, index) =>
      makeEvidence(index, fact.excerpt, fact.documentId)
    );

    const consistent = assessEvidenceConfidence({ facts, evidence });
    const qualified = assessEvidenceConfidence({
      facts,
      evidence,
      counterEvidenceCount: 2,
    });

    expect(consistent.level).toBe("high");
    expect(qualified.level).toBe("medium");
    expect(qualified.score).toBeLessThan(consistent.score);
    expect(qualified.consistencyScore).toBeLessThan(consistent.consistencyScore);
  });

  it("returns low confidence when passages contain no supported finding", () => {
    const evidence = Array.from({ length: 10 }, (_, index) =>
      makeEvidence(index, "Background text without an extracted conclusion.", "document:one")
    );

    expect(assessEvidenceConfidence({ facts: [], evidence }).level).toBe("low");
  });

  it("scores a documented limitation only when assessing that limitation itself", () => {
    const limitation = {
      ...makeFact(
        0,
        "Kidney biopsy results remain unavailable in the uploaded record.",
        "document:one",
      ),
      contentType: "limitation" as const,
    };
    const evidence = [makeEvidence(0, limitation.excerpt, limitation.documentId)];

    expect(assessEvidenceConfidence({ facts: [limitation], evidence }).level).toBe("low");
    expect(assessEvidenceConfidence({
      facts: [limitation],
      evidence,
      includeLimitationsAsSupport: true,
    }).level).toBe("medium");
  });
});

function makeFact(
  index: number,
  text: string,
  documentId: string,
): GroundedFact {
  return {
    id: `fact:${index}`,
    category: "context",
    contentType: "finding",
    text,
    evidenceId: `evidence:${index}`,
    documentId,
    documentName: `${documentId}.pdf`,
    page: 1,
    excerpt: text,
    relevance: "Directly relevant to the research question.",
  };
}

function makeEvidence(
  index: number,
  excerpt: string,
  documentId: string,
): EvidenceItem {
  return {
    id: `evidence:${index}`,
    chunkId: `chunk:${index}`,
    documentId,
    excerpt,
    documentName: `${documentId}.pdf`,
    page: 1,
    section: "Page 1",
    relevance: "Directly relevant to the research question.",
    contextBefore: "",
    contextAfter: "",
    matchedTerms: ["clinical", "result"],
    lexicalScore: 0.9,
    similarityScore: 0.86,
    retrievalMethod: "embedding",
  };
}
