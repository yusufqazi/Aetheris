import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({
  runStructuredGeneration: vi.fn(async ({ fallback }) => ({
    ...fallback(),
    directAnswer:
      "The respiratory diagnosis and current treatment are supported. The specialist disagreement cannot be determined from the uploaded evidence.",
  })),
}));

import { runReportAgent } from "@/lib/agents/reportAgent";
import { makeDemoSession } from "@/lib/demo-data";
import { normalizeEvidenceItems } from "@/lib/research/evidence-normalization";
import { buildInvestigationData } from "@/lib/research/investigation";
import {
  openQuestionQualityIssues,
  openQuestionsFromGap,
} from "@/lib/research/open-questions";
import type {
  EvidenceItem,
  GroundedFact,
  ResearchContentType,
  UploadedDocument,
} from "@/lib/types";

const QUESTION =
  "What is driving this patient's respiratory admission, how should treatment proceed, is the patient ready for discharge, where do the clinical teams genuinely differ about oxygen and discharge, and what evidence is still needed?";

const PULMONOLOGY_POSITION =
  "Would not prescribe new continuous home oxygen solely from the current inpatient requirement without documenting room-air resting and ambulatory oxygen saturation near discharge.";
const GENERAL_MEDICINE_POSITION =
  "General Medicine favors arranging ambulatory oxygen for discharge if repeat walking saturation remains below the qualifying threshold and does not require return to the exact baseline oxygen pattern before discharge.";
const ACCEPTED_DISAGREEMENT =
  "Pulmonology and General Medicine differ on the threshold for prescribing home oxygen: Pulmonology requires formal room-air saturation data, while General Medicine is willing to proceed if exertional desaturation persists without requiring a return to pre-admission baselines.";
const PENDING_EVIDENCE =
  "Before the oxygen/discharge decision is finalized, the chart still needs: a documented room-air resting saturation, a standardized room-air ambulatory saturation, oxygen saturation during ambulation if supplemental oxygen is applied, and confirmation that bronchodilator frequency is manageable on the intended outpatient regimen.";

describe("COPD downstream consensus preservation", () => {
  it("preserves the accepted oxygen-plan disagreement and expands the explicit pending list into four natural questions", async () => {
    const base = makeDemoSession();
    const records: Array<{ name: string; type: ResearchContentType; text: string }> = [
      { name: "03_pulmonology_consult.pdf", type: "unresolved_question", text: PULMONOLOGY_POSITION },
      { name: "09_general_medicine_consult.pdf", type: "recommendation", text: GENERAL_MEDICINE_POSITION },
      { name: "10_multidisciplinary_summary.pdf", type: "limitation", text: ACCEPTED_DISAGREEMENT },
      { name: "10_multidisciplinary_summary.pdf", type: "limitation", text: PENDING_EVIDENCE },
    ];
    const documents = records.map((record, index) => makeDocument(base.id, index, record.name, record.text));
    const facts: GroundedFact[] = records.map((record, index) => ({
      id: `fact:copd:${index}`,
      category: record.type === "limitation" ? "limitation" : "context",
      contentType: record.type,
      text: record.text,
      evidenceId: `evidence:copd:${index}`,
      documentId: documents[index].id,
      documentName: record.name,
      page: 1,
      excerpt: record.text,
      relevance: "Direct evidence for the oxygen and discharge decision.",
    }));
    const evidence = facts.map(makeEvidence);
    const debate = {
      ...base.results!.debateConsensus,
      disagreements: [ACCEPTED_DISAGREEMENT],
      missingEvidence: [
        "Documented room-air resting saturation.",
        "Documented standardized room-air ambulatory saturation.",
        "Confirmation that bronchodilator frequency is manageable on an outpatient basis.",
      ],
      finalConsensus: "The oxygen and discharge threshold remains disputed pending formal measurements.",
    };

    const report = await runReportAgent({
      question: QUESTION,
      literature: base.results!.literatureSearch,
      drug: base.results!.drugInteraction,
      adverse: base.results!.adverseReaction,
      trial: base.results!.trialSummarizer,
      debate,
      facts,
      evidence,
      normalizedEvidence: normalizeEvidenceItems(evidence),
      shouldUseProvider: () => false,
    });
    const session = {
      ...base,
      question: QUESTION,
      documents,
      evidence,
      results: {
        ...base.results!,
        debateConsensus: debate,
        reportGeneration: report,
        groundedFacts: facts,
        evidenceIndex: evidence,
        citations: undefined,
      },
    };
    const investigation = buildInvestigationData(session);
    const questionText = investigation.openQuestions.map((item) => item.question).join(" ");

    expect(report.researchIntelligence?.contradictions).toHaveLength(1);
    expect(report.researchIntelligence?.contradictions[0].issue).toBe(ACCEPTED_DISAGREEMENT);
    expect(report.executiveSummary).not.toMatch(
      /disagreement.{0,50}(?:cannot be determined|is unknown|is unclear)/i,
    );
    expect(report.executiveSummary).toContain(
      "Pulmonology and General Medicine differ on the threshold for prescribing home oxygen",
    );
    expect(report.researchIntelligence?.contradictions[0].sourcePositions.join(" ")).toMatch(
      /would not prescribe.*favors arranging/i,
    );
    expect(investigation.conflicts).toHaveLength(1);
    expect(investigation.conflicts[0].statement).toMatch(/Pulmonology.*General Medicine/i);

    expect(openQuestionsFromGap(PENDING_EVIDENCE)).toHaveLength(4);
    expect(investigation.openQuestions).toHaveLength(4);
    expect(questionText).toMatch(/room-air resting saturation/i);
    expect(questionText).toMatch(/standardized room-air ambulatory saturation/i);
    expect(questionText).toMatch(/supplemental oxygen is applied/i);
    expect(questionText).toMatch(/bronchodilator frequency is manageable/i);
    expect(investigation.openQuestions.every(
      (item) => openQuestionQualityIssues(item.question).length === 0,
    )).toBe(true);
    expect(questionText).not.toMatch(/would not prescribe|how does .* is .* change/i);
  });
});

function makeDocument(
  sessionId: string,
  index: number,
  name: string,
  text: string,
): UploadedDocument {
  return {
    id: `document:copd:${index}`,
    sessionId,
    name,
    size: text.length,
    pageCount: 1,
    uploadedAt: "2026-08-31T00:00:00.000Z",
    preview: text,
    text,
    pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
  };
}

function makeEvidence(fact: GroundedFact, index: number): EvidenceItem {
  return {
    id: fact.evidenceId,
    chunkId: `chunk:copd:${index}`,
    documentId: fact.documentId,
    excerpt: fact.excerpt,
    documentName: fact.documentName,
    page: 1,
    section: "Page 1",
    relevance: fact.relevance,
    contextBefore: "",
    contextAfter: "",
    matchedTerms: [],
    lexicalScore: 1,
    similarityScore: null,
    retrievalMethod: "lexical",
  };
}
