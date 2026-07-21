import { describe, expect, it } from "vitest";

import {
  isResearchIntelligenceGrounded,
  researchIntelligenceGroundingIssues,
  sanitizeResearchIntelligence,
} from "@/lib/research/intelligence";
import type { EvidenceItem, ResearchIntelligence } from "@/lib/types";

const evidence: EvidenceItem[] = [{
  id: "evidence:valid",
  chunkId: "valid",
  documentId: "doc-1",
  excerpt: "QTc improved after medication changes and electrolyte correction.",
  documentName: "follow-up.pdf",
  page: 2,
  section: "Page 2",
  relevance: "Follow-up signal",
  contextBefore: "",
  contextAfter: "",
  matchedTerms: ["qtc"],
  lexicalScore: 1,
  similarityScore: 0.91,
  retrievalMethod: "embedding",
}];

describe("research intelligence grounding", () => {
  it("removes unsupported model citations and drops claims with no valid source", () => {
    const sanitized = sanitizeResearchIntelligence(makeIntelligence(), evidence);

    expect(sanitized?.evidenceTrajectory).toHaveLength(1);
    expect(sanitized?.evidenceTrajectory[0].evidenceIds).toEqual(["evidence:valid"]);
    expect(sanitized?.interactionPathways).toHaveLength(0);
    expect(sanitized?.evidenceMappings).toHaveLength(1);
    expect(sanitized?.evidenceMappings?.[0].exactQuote).toBe(
      "QTc improved after medication changes and electrolyte correction.",
    );
    expect(sanitized?.structuredClaims).toHaveLength(1);
    expect(sanitized?.structuredClaims?.[0].evidenceIds).toEqual(["evidence:valid"]);
    expect(isResearchIntelligenceGrounded(sanitized, evidence)).toBe(true);
  });

  it("rejects unsupported numeric claims in the direct answer", () => {
    const intelligence = makeIntelligence();
    intelligence.directAnswer = "The uploaded record confirms harmful arrhythmia in 12 patients after treatment.";

    expect(isResearchIntelligenceGrounded(intelligence, evidence)).toBe(false);
    expect(researchIntelligenceGroundingIssues(intelligence, evidence)).toContain(
      "direct-answer-contains-unsupported-number",
    );
  });
});

function makeIntelligence(): ResearchIntelligence {
  return {
    answerStatus: "direct",
    directAnswer: "The records support a medication-associated QT concern, but they do not establish causality.",
    strongestSupportedConclusion: "The QTc improved after the documented intervention.",
    strongestCounterpoint: "Electrolyte correction occurred at the same time.",
    evidenceTrajectory: [{
      sequence: 1,
      label: "Follow-up",
      finding: "QTc improved.",
      interpretation: "The timing supports reversibility but not a single cause.",
      evidenceIds: ["evidence:valid", "invented-id"],
    }],
    interactionPathways: [{
      title: "Unsupported pathway",
      priority: "high",
      finding: "Unsupported",
      observedSignal: "None",
      whyItMatters: "None",
      uncertainty: "Unsupported",
      evidenceIds: ["invented-id"],
    }],
    contradictions: [],
    decisionChangingUnknowns: [{
      unknown: "Exact exposure timing",
      whyItMatters: "It would strengthen temporal attribution.",
      evidenceNeeded: "Medication administration timestamps.",
      priority: "high",
    }],
    evidenceMappings: [{
      evidenceId: "evidence:valid",
      targetType: "finding",
      targetText: "QTc improved after the documented changes.",
      relationshipType: "supports",
      exactQuote: "QTc improved after medication changes and electrolyte correction.",
      relevanceExplanation: "Documents the follow-up QTc response.",
      confidence: "high",
    }, {
      evidenceId: "evidence:valid",
      targetType: "open_question",
      targetText: "Did QTc remain stable?",
      relationshipType: "supports",
      exactQuote: "Did QTc remain stable?",
      relevanceExplanation: "Incorrectly treats the question as evidence.",
      confidence: "low",
    }, {
      evidenceId: "evidence:valid",
      targetType: "finding",
      targetText: "QTc normalized.",
      relationshipType: "supports",
      exactQuote: "QTc normalized completely.",
      relevanceExplanation: "Fabricated quote.",
      confidence: "high",
    }],
    structuredClaims: [{
      id: "claim:qt",
      conclusion: "QTc improved after the documented medication changes.",
      kind: "inference",
      dimension: "safety",
      reasoningSummary: "The follow-up passage documents improvement after the recorded intervention.",
      evidenceIds: ["evidence:valid", "invented-id"],
      counterEvidenceIds: [],
      uncertainty: "The record does not isolate which intervention produced the change.",
      confidence: "medium",
      priority: "primary",
    }, {
      id: "claim:unsupported",
      conclusion: "A harmful arrhythmia was confirmed in 12 patients.",
      kind: "inference",
      dimension: "safety",
      reasoningSummary: "This conclusion relies on an evidence passage that does not exist.",
      evidenceIds: ["invented-id"],
      counterEvidenceIds: [],
      uncertainty: "None.",
      confidence: "high",
      priority: "important",
    }],
  };
}
