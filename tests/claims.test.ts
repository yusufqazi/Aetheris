import { describe, expect, it } from "vitest";

import {
  buildFallbackResearchIntelligence,
  buildStructuredResearchClaims,
} from "@/lib/research/claims";
import type { EvidenceItem, GroundedFact, ResearchContentType } from "@/lib/types";

describe("structured research claims", () => {
  it("covers requested answer dimensions without duplicating exact conclusions", () => {
    const records: Array<{ type: ResearchContentType; text: string }> = [
      { type: "longitudinal_change", text: "Hemoglobin increased from 8.7 to 10.4 g/dL after four weeks." },
      { type: "interaction_concern", text: "Hydroxychloroquine and recent azithromycin exposure create a cumulative QT-prolongation concern." },
      { type: "interaction_concern", text: "Hydroxychloroquine with QTc 477 ms increases concern for QT prolongation." },
      { type: "limitation", text: "Gastrointestinal blood loss was not formally excluded." },
    ];
    const evidence = records.map((record, index) => makeEvidence(index, record.text));
    const facts = records.map((record, index) => makeFact(index, record.type, record.text));

    const claims = buildStructuredResearchClaims({
      question: "Assess treatment efficacy, safety, and limitations.",
      facts,
      evidence,
    });

    expect(new Set(claims.map((claim) => claim.dimension))).toEqual(
      new Set(["efficacy", "safety", "limitation"]),
    );
    expect(new Set(claims.map((claim) => claim.conclusion)).size).toBe(claims.length);
    expect(claims.every((claim) => claim.reasoningSummary.length > 24)).toBe(true);
    expect(claims.every((claim) => claim.evidenceIds.length > 0)).toBe(true);
    expect(claims.every((claim) => claim.theme && claim.theme.length > 3)).toBe(true);
    expect(claims.some((claim) => claim.clinicalImplication?.includes("weighed") || claim.clinicalImplication?.includes("confidence"))).toBe(true);
  });

  it("does not misclassify a recommendation and a safety concern as a conflict", () => {
    const records: Array<{ type: ResearchContentType; text: string }> = [
      {
        type: "recommendation",
        text: "Continue cautious fluid resuscitation to support perfusion during septic shock.",
      },
      {
        type: "safety_observation",
        text: "Aggressive fluid resuscitation may worsen pulmonary edema in severe heart failure.",
      },
    ];
    const evidence = records.map((record, index) => makeEvidence(index, record.text));
    const facts = records.map((record, index) => makeFact(index, record.type, record.text));
    const intelligence = buildFallbackResearchIntelligence({
      question: "What treatment strategy balances shock resuscitation and cardiac risk?",
      facts,
      evidence,
      directAnswer: "The uploaded evidence supports cautious resuscitation while avoiding fluid intensity that could worsen the documented cardiac risk.",
      uncertainties: [],
      followUpQuestions: [],
    });

    expect(intelligence.contradictions).toEqual([]);
  });

  it("does not mislabel a shared uncertainty as a conflict", () => {
    const records: Array<{ type: ResearchContentType; text: string }> = [
      {
        type: "recommendation",
        text: "Defer definitive long-term therapy until tissue classification is available.",
      },
      {
        type: "limitation",
        text: "Tissue classification remains pending and disease severity is uncertain.",
      },
    ];
    const evidence = records.map((record, index) => makeEvidence(index, record.text));
    const facts = records.map((record, index) => makeFact(index, record.type, record.text));
    const intelligence = buildFallbackResearchIntelligence({
      question: "What diagnosis and treatment plan are supported, and what remains unresolved?",
      facts,
      evidence,
      directAnswer: "The current evidence supports a qualified treatment plan while tissue classification remains pending.",
      uncertainties: [records[1].text],
      followUpQuestions: ["What is the documented result for tissue classification?"],
    });

    expect(intelligence.contradictions).toEqual([]);
    expect(intelligence.decisionChangingUnknowns[0].unknown).toMatch(/tissue classification/i);
  });
});

function makeEvidence(index: number, excerpt: string): EvidenceItem {
  return {
    id: `evidence:${index}`,
    chunkId: `chunk:${index}`,
    documentId: `document:${index}`,
    excerpt,
    documentName: `source-${index}.pdf`,
    page: 1,
    section: "Page 1",
    relevance: "Test evidence",
    contextBefore: "",
    contextAfter: "",
    matchedTerms: [],
    lexicalScore: 1,
    similarityScore: null,
    retrievalMethod: "lexical",
  };
}

function makeFact(index: number, contentType: ResearchContentType, text: string): GroundedFact {
  return {
    id: `fact:${index}`,
    category: contentType === "interaction_concern"
      ? "interaction"
      : contentType === "limitation"
        ? "limitation"
        : "efficacy",
    contentType,
    text,
    evidenceId: `evidence:${index}`,
    documentId: `document:${index}`,
    documentName: `source-${index}.pdf`,
    page: 1,
    excerpt: text,
    relevance: "Test fact",
  };
}
