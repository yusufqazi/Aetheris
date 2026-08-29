import { describe, expect, it } from "vitest";

import { makeDemoSession } from "@/lib/demo-data";
import {
  classifyStatementRole,
  recommendationsMateriallyConflict,
} from "@/lib/research/conflict-semantics";
import { generatedFindingQualityIssues, polishGeneratedFinding } from "@/lib/research/finding-wording";
import { buildBestSupportedAnswer, classifyContentType } from "@/lib/research/grounding";
import { buildInvestigationData } from "@/lib/research/investigation";
import {
  openQuestionFromGap,
  openQuestionQualityIssues,
} from "@/lib/research/open-questions";
import { primaryAnswerQualityIssues } from "@/lib/research/primary-answer";
import { evidenceStateAlignmentIssues } from "@/lib/research/semantic-quality";
import type { EvidenceItem, GroundedFact, ResearchContentType, ResearchSession } from "@/lib/types";

const QUESTION =
  "What is the most likely cause of this patient's worsening respiratory illness, what treatment should be given now, where do the specialists genuinely disagree, and what additional evidence would most reduce uncertainty?";

const ID_RECOMMENDATION =
  "Infectious Disease recommends deferring high-dose corticosteroids while infection remains clinically credible.";
const ONCOLOGY_RECOMMENDATION =
  "Oncology favors starting high-dose corticosteroids now while continuing antibiotics because immune-mediated pneumonitis may be worsening.";
const PHARMACY_NEUTRAL =
  "Medication safety considerations should not be interpreted as a recommendation to start or withhold corticosteroids.";

describe("Gemini analysis quality regression", () => {
  it("builds a complete uncertainty-preserving answer for every part of the research question", () => {
    const { facts } = pneumonitisFixture();
    const answer = buildBestSupportedAnswer(QUESTION, facts);

    expect(primaryAnswerQualityIssues(answer)).toEqual([]);
    expect(answer).toMatch(/does not definitively distinguish/i);
    expect(answer).toMatch(/pneumonia/i);
    expect(answer).toMatch(/pneumonitis/i);
    expect(answer).toMatch(/2 L\/min/i);
    expect(answer).toMatch(/4 L\/min/i);
    expect(answer).toMatch(/continu(?:e|ing) empiric antibiotics/i);
    expect(answer).toMatch(/hold(?:ing)? pembrolizumab/i);
    expect(answer).toMatch(/Infectious Disease/i);
    expect(answer).toMatch(/Oncology/i);
    expect(answer).toMatch(/in contrast/i);
    expect(answer).toMatch(/pending|not been performed|unknown/i);
    expect(answer).toMatch(/BAL/i);
    expect(answer).toMatch(/trajectory/i);
    expect(answer).not.toMatch(/and and|final final|result result|most strongly supports pharmacy/i);
  });

  it("recognizes only the incompatible specialist recommendations as a conflict", () => {
    expect(recommendationsMateriallyConflict(ID_RECOMMENDATION, ONCOLOGY_RECOMMENDATION)).toBe(true);
    expect(classifyStatementRole(PHARMACY_NEUTRAL)).toBe("neutral");
    expect(recommendationsMateriallyConflict(PHARMACY_NEUTRAL, ID_RECOMMENDATION)).toBe(false);

    const investigation = buildInvestigationData(pneumonitisFixture().session);
    expect(investigation.conflicts).toHaveLength(1);
    expect(investigation.conflicts[0].positions.map((position) => position.documentName).join(" ")).toMatch(
      /infectious.*oncology/i,
    );
    expect(investigation.conflicts[0].positions.map((position) => position.statement).join(" ")).not.toMatch(
      /Medication safety considerations/i,
    );
  });

  it("creates specific unresolved questions without turning recommendations into interrogatives", () => {
    const cultureQuestion = openQuestionFromGap("Final blood and sputum culture results remain pending.");
    const balQuestion = openQuestionFromGap("Bronchoscopy with BAL has not yet been performed.");
    const malformedRecommendation = openQuestionFromGap(
      "Do not initiate high-dose corticosteroids at this time unless respiratory status worsens or infection becomes more likely?",
    );

    expect(openQuestionQualityIssues(cultureQuestion)).toEqual([]);
    expect(cultureQuestion).toMatch(/culture/i);
    expect(openQuestionQualityIssues(balQuestion)).toEqual([]);
    expect(balQuestion).toMatch(/^If .* is performed/i);
    expect(malformedRecommendation).toBe("");

    const questions = buildInvestigationData(pneumonitisFixture().session).openQuestions;
    expect(questions.map((item) => item.question).join(" ")).toMatch(/culture/i);
    expect(questions.map((item) => item.question).join(" ")).toMatch(/BAL|bronchoscop/i);
    expect(questions.every((item) => openQuestionQualityIssues(item.question).length === 0)).toBe(true);
    expect(questions.filter((item) => /culture/i.test(item.question))).toHaveLength(1);
    expect(new Set(questions.map((item) => item.id)).size).toBe(questions.length);
  });

  it("normalizes findings, retains the quantitative trajectory, and suppresses metadata and historical noise", () => {
    expect(
      polishGeneratedFinding("The evidence identifies immune checkpoint inhibitor pneumonitis cannot be excluded."),
    ).toBe("Immune checkpoint inhibitor pneumonitis cannot be excluded.");
    expect(generatedFindingQualityIssues(
      "The evidence identifies immune checkpoint inhibitor pneumonitis cannot be excluded.",
    )).toContain("mechanically-stitched");
    expect(classifyContentType("Oxygen requirement increased from 2 L/min to 4 L/min over six hours.")).toBe(
      "longitudinal_change",
    );

    const findings = buildInvestigationData(pneumonitisFixture().session).findings;
    expect(findings.length).toBeGreaterThanOrEqual(5);
    expect(findings.length).toBeLessThanOrEqual(10);
    expect(findings.map((item) => item.statement).join(" ")).toMatch(/2 L\/min.*4 L\/min/i);
    expect(findings.map((item) => item.statement).join(" ")).not.toMatch(/MRN|DOB|pathology_unrelated|synthetic/i);
    expect(findings[0].statement).not.toMatch(/remote prior biopsy|historical/i);
  });

  it("preserves pending, planned, possible, and neutral evidence states", () => {
    expect(evidenceStateAlignmentIssues(
      "Final cultures were negative.",
      ["Final cultures remain pending."],
    )).toContain("pending-promoted-to-final");
    expect(evidenceStateAlignmentIssues(
      "Bronchoscopy with BAL was performed.",
      ["Bronchoscopy with BAL is reasonable if respiratory status worsens."],
    )).toContain("planned-promoted-to-performed");
    expect(evidenceStateAlignmentIssues(
      "Immune-mediated pneumonitis was confirmed.",
      ["Immune-mediated pneumonitis cannot be excluded."],
    )).toContain("possibility-promoted-to-confirmed");
    expect(evidenceStateAlignmentIssues(
      "Pharmacy recommends withholding corticosteroids.",
      [PHARMACY_NEUTRAL],
    )).toContain("neutral-promoted-to-recommendation");
  });
});

function pneumonitisFixture() {
  const session = makeDemoSession();
  const records: Array<{
    name: string;
    contentType: ResearchContentType;
    text: string;
  }> = [
    {
      name: "08_multidisciplinary_case_summary.pdf",
      contentType: "limitation",
      text: "The available evidence does not definitively distinguish bacterial pneumonia from pembrolizumab-associated immune checkpoint inhibitor pneumonitis; both remain plausible.",
    },
    {
      name: "07_respiratory_status_update.pdf",
      contentType: "longitudinal_change",
      text: "Oxygen requirement increased from 2 L/min to 4 L/min over six hours.",
    },
    {
      name: "03_infectious_disease_consult.pdf",
      contentType: "recommendation",
      text: "Continue empiric antibiotics while infection remains clinically credible.",
    },
    {
      name: "04_oncology_consult.pdf",
      contentType: "recommendation",
      text: "Hold pembrolizumab during the current respiratory evaluation.",
    },
    {
      name: "03_infectious_disease_consult.pdf",
      contentType: "recommendation",
      text: ID_RECOMMENDATION,
    },
    {
      name: "04_oncology_consult.pdf",
      contentType: "recommendation",
      text: ONCOLOGY_RECOMMENDATION,
    },
    {
      name: "09_pharmacy_medication_review.pdf",
      contentType: "safety_observation",
      text: PHARMACY_NEUTRAL,
    },
    {
      name: "05_microbiology_results.pdf",
      contentType: "limitation",
      text: "Final blood and sputum culture results remain pending.",
    },
    {
      name: "06_pulmonology_consult.pdf",
      contentType: "limitation",
      text: "Bronchoscopy with BAL has not yet been performed.",
    },
    {
      name: "07_respiratory_status_update.pdf",
      contentType: "limitation",
      text: "The subsequent respiratory trajectory remains unknown.",
    },
    {
      name: "10_pathology_unrelated_prior_biopsy.pdf",
      contentType: "finding",
      text: "A remote prior biopsy documented historical malignancy context unrelated to the current respiratory deterioration.",
    },
  ];

  session.question = QUESTION;
  session.documents = records.map((record, index) => ({
    ...session.documents[index % session.documents.length],
    id: `document:pneumonitis:${index}`,
    name: record.name,
    text: record.text,
    pageCount: 1,
    pages: [{ number: 1, text: record.text, startOffset: 0, endOffset: record.text.length }],
  }));
  const facts: GroundedFact[] = records.map((record, index) => ({
    id: `fact:pneumonitis:${index}`,
    category: categoryFor(record.contentType),
    contentType: record.contentType,
    text: record.text,
    evidenceId: `evidence:pneumonitis:${index}`,
    documentId: session.documents[index].id,
    documentName: record.name,
    page: 1,
    excerpt: record.text,
    relevance: "Direct evidence for the respiratory differential and management question.",
  }));
  session.evidence = facts.map(makeEvidence);
  session.results = {
    ...session.results!,
    groundedFacts: facts,
    citations: undefined,
    reportGeneration: {
      ...session.results!.reportGeneration,
      citations: undefined,
      executiveSummary:
        "The evidence most strongly supports pharmacy review does not determine whether infection or pneumonitis as the leading diagnosis. This conclusion is reinforced by final final results result.",
      recommendedFollowUpQuestions: [
        "Do not initiate high-dose corticosteroids at this time unless infection becomes?",
        "What do the final blood and sputum cultures show?",
        "What are the finalized culture results?",
      ],
      researchIntelligence: undefined,
    },
  };
  return { session: session as ResearchSession, facts };
}

function categoryFor(contentType: ResearchContentType): GroundedFact["category"] {
  if (contentType === "safety_observation" || contentType === "longitudinal_change") return "safety";
  if (contentType === "limitation") return "limitation";
  return "context";
}

function makeEvidence(fact: GroundedFact, index: number): EvidenceItem {
  return {
    id: fact.evidenceId,
    chunkId: `chunk:pneumonitis:${index}`,
    documentId: fact.documentId,
    excerpt: fact.excerpt,
    documentName: fact.documentName,
    page: fact.page,
    section: "Page 1",
    relevance: fact.relevance,
    contextBefore: "",
    contextAfter: "",
    matchedTerms: [],
    lexicalScore: 1 - index / 100,
    similarityScore: null,
    retrievalMethod: "lexical",
  };
}
