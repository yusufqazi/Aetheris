import { describe, expect, it } from "vitest";

import { makeDemoSession } from "@/lib/demo-data";
import {
  normalizeRecommendation,
  recommendationsMateriallyConflict,
} from "@/lib/research/conflict-semantics";
import { normalizeEvidenceItems } from "@/lib/research/evidence-normalization";
import { createClinicalFindingTitle } from "@/lib/research/finding-titles";
import {
  assessPrimaryAnswerEvidence,
  buildBestSupportedAnswer,
  primaryAnswerConsistencyIssues,
} from "@/lib/research/grounding";
import { buildInvestigationData } from "@/lib/research/investigation";
import {
  openQuestionQualityIssues,
  openQuestionsFromGap,
} from "@/lib/research/open-questions";
import type {
  EvidenceItem,
  GroundedFact,
  ResearchContentType,
  ResearchSession,
} from "@/lib/types";

const QUESTION =
  "What is driving this patient's heart-failure admission, how aggressively should diuresis continue now, is the patient ready for discharge, where do Cardiology and Nephrology genuinely differ, and what evidence is still needed before discharge?";

const STRONGER_RECOMMENDATION =
  "Continue IV loop diuresis with a goal net negative fluid balance of approximately 1.5-2.0 L/day while congestion persists.";
const LOWER_INTENSITY_RECOMMENDATION =
  "Reduce the intensity of IV diuresis today rather than pursuing another 2 L net-negative day; this is not a recommendation to stop all diuretic therapy.";
const PENDING_DISCHARGE_EVIDENCE =
  "Unresolved discharge evidence: Response to oral diuretic therapy, next-morning renal function, final standing weight, and recurrence or absence of orthostatic symptoms remain relevant to the discharge decision.";

describe("decision-level reasoning regression", () => {
  it("normalizes treatment intensity and detects a material disagreement without requiring yes versus no", () => {
    expect(normalizeRecommendation(STRONGER_RECOMMENDATION)).toMatchObject({
      action: "proceed",
      stance: "for",
    });
    expect(normalizeRecommendation(LOWER_INTENSITY_RECOMMENDATION)).toMatchObject({
      action: "restrict",
      stance: "against",
      intensity: "decrease",
    });
    expect(recommendationsMateriallyConflict(
      STRONGER_RECOMMENDATION,
      LOWER_INTENSITY_RECOMMENDATION,
    )).toBe(true);
  });

  it("keeps supported diagnosis separate from narrower treatment uncertainty", () => {
    const { facts } = heartFailureFixture();
    const coverage = assessPrimaryAnswerEvidence(QUESTION, facts);

    expect(coverage.supportedParts).toEqual(expect.arrayContaining([
      "diagnosis",
      "treatment",
      "disposition",
      "disagreement",
      "remaining-evidence",
    ]));
    expect(coverage.unsupportedParts).not.toContain("diagnosis");
  });

  it("turns explicit pending decision evidence into a small set of natural questions", () => {
    const questions = openQuestionsFromGap(PENDING_DISCHARGE_EVIDENCE);

    expect(questions.length).toBeGreaterThanOrEqual(2);
    expect(questions.length).toBeLessThanOrEqual(4);
    expect(questions.join(" ")).toMatch(/oral diuretic/i);
    expect(questions.join(" ")).toMatch(/renal function/i);
    expect(questions.join(" ")).toMatch(/standing weight|orthostatic/i);
    expect(questions.every((question) => openQuestionQualityIssues(question).length === 0)).toBe(true);
  });

  it("covers every supported part of the compound question and cannot deny its own conflict", () => {
    const { facts } = heartFailureFixture();
    const answer = buildBestSupportedAnswer(QUESTION, facts);

    expect(answer).toMatch(/acute decompensated HFrEF|volume overload/i);
    expect(answer).toMatch(/diuresis|decongestion/i);
    expect(answer).toMatch(/discharge/i);
    expect(answer).toMatch(/Cardiology/i);
    expect(answer).toMatch(/Nephrology/i);
    expect(answer).toMatch(/pending|oral diuretic|renal function|standing weight|orthostatic/i);
    expect(primaryAnswerConsistencyIssues(answer, QUESTION, facts)).toEqual([]);
    expect(primaryAnswerConsistencyIssues(
      "The specialist disagreement cannot be determined from the uploaded evidence.",
      QUESTION,
      facts,
    )).toContain("supported-disagreement-denied");
  });

  it("classifies diagnostic evidence semantically and removes source headings and timestamps", () => {
    expect(createClinicalFindingTitle({
      statement: "There is no evidence of a new major decline in LVEF.",
      providedTitle: "Treatment recommendation",
    })).toBe("Diagnostic evidence");

    const normalized = normalizeEvidenceItems([rawCardiologyEvidence(), rawNephrologyEvidence()]);
    const statements = normalized.objects.map((item) => item.statement);
    const nephrologyRecommendation = normalized.objects.find((item) =>
      /Reduce the intensity of IV diuresis/i.test(item.statement)
    );

    expect(statements.join(" ")).not.toMatch(/Cardiology Consult|Nephrology Consult|11:40|08:25/);
    expect(nephrologyRecommendation?.kind).toBe("recommendation");
  });

  it("surfaces the conflict and pending questions with valid direct-source citations", () => {
    const { session } = heartFailureFixture();
    const investigation = buildInvestigationData(session);

    expect(investigation.conflicts.length).toBeGreaterThan(0);
    expect(investigation.conflicts.map((item) => item.positions
      .map((position) => position.statement).join(" ")).join(" ")).toMatch(/continue.*reduce|reduce.*continue/i);
    expect(investigation.openQuestions.length).toBeGreaterThan(0);
    expect(investigation.findings.every((finding) => finding.citationIds.length > 0)).toBe(true);
    expect(investigation.findings.map((finding) => finding.statement).join(" ")).not.toMatch(
      /(?:Cardiology|Nephrology) Consult\s*[—-]|\b\d{1,2}:\d{2}\b/,
    );
  });
});

function heartFailureFixture() {
  const session = makeDemoSession();
  const records: Array<{
    name: string;
    contentType: ResearchContentType;
    text: string;
  }> = [
    {
      name: "01_admission_note.pdf",
      contentType: "finding",
      text: "The presentation is most consistent with acute decompensated HFrEF due to volume overload.",
    },
    {
      name: "05_progress_note.pdf",
      contentType: "finding",
      text: "Mild residual congestion persists despite improvement with IV diuresis.",
    },
    {
      name: "03_cardiology_consult.pdf",
      contentType: "recommendation",
      text: STRONGER_RECOMMENDATION,
    },
    {
      name: "04_nephrology_consult.pdf",
      contentType: "recommendation",
      text: LOWER_INTENSITY_RECOMMENDATION,
    },
    {
      name: "07_laboratory_trend.pdf",
      contentType: "longitudinal_change",
      text: "Creatinine increased from 1.6 mg/dL to 2.0 mg/dL during decongestion.",
    },
    {
      name: "09_disposition_note.pdf",
      contentType: "recommendation",
      text: "The patient is not ready for discharge until response to oral therapy and renal stability are established.",
    },
    {
      name: "10_case_summary.pdf",
      contentType: "limitation",
      text: PENDING_DISCHARGE_EVIDENCE,
    },
  ];

  session.question = QUESTION;
  session.documents = records.map((record, index) => ({
    ...session.documents[index % session.documents.length],
    id: `document:decision-regression:${index}`,
    name: record.name,
    text: record.text,
    pageCount: 1,
    pages: [{ number: 1, text: record.text, startOffset: 0, endOffset: record.text.length }],
  }));
  const facts: GroundedFact[] = records.map((record, index) => ({
    id: `fact:decision-regression:${index}`,
    category: record.contentType === "limitation" ? "limitation" : "context",
    contentType: record.contentType,
    text: record.text,
    evidenceId: `evidence:decision-regression:${index}`,
    documentId: session.documents[index].id,
    documentName: record.name,
    page: 1,
    excerpt: record.text,
    relevance: "Direct evidence for the compound clinical research question.",
  }));
  session.evidence = facts.map(makeEvidence);
  session.results = {
    ...session.results!,
    groundedFacts: facts,
    citations: undefined,
    reportGeneration: {
      ...session.results!.reportGeneration,
      citations: undefined,
      researchIntelligence: undefined,
      recommendedFollowUpQuestions: [],
      executiveSummary: "The specialist disagreement cannot be determined from the uploaded evidence.",
    },
  };
  return { session: session as ResearchSession, facts };
}

function makeEvidence(fact: GroundedFact, index: number): EvidenceItem {
  return {
    id: fact.evidenceId,
    chunkId: `chunk:decision-regression:${index}`,
    documentId: fact.documentId,
    excerpt: fact.excerpt,
    documentName: fact.documentName,
    page: fact.page,
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

function rawCardiologyEvidence(): EvidenceItem {
  return {
    ...makeEvidence({
      id: "raw-cardio-fact",
      category: "context",
      contentType: "finding",
      text: STRONGER_RECOMMENDATION,
      evidenceId: "raw-cardio-evidence",
      documentId: "raw-cardio-document",
      documentName: "03_specialist_a.pdf",
      page: 1,
      excerpt: "",
      relevance: "",
    }, 0),
    excerpt: `Cardiology Consult — 2026-08-15 11:40\nDiuresis recommendation\n${STRONGER_RECOMMENDATION}\nThere is no evidence of a new major decline in LVEF.`,
  };
}

function rawNephrologyEvidence(): EvidenceItem {
  return {
    ...makeEvidence({
      id: "raw-nephrology-fact",
      category: "context",
      contentType: "finding",
      text: LOWER_INTENSITY_RECOMMENDATION,
      evidenceId: "raw-nephrology-evidence",
      documentId: "raw-nephrology-document",
      documentName: "04_specialist_b.pdf",
      page: 1,
      excerpt: "",
      relevance: "",
    }, 1),
    excerpt: `Nephrology Consult — 2026-08-16 08:25\nTreatment recommendation\n${LOWER_INTENSITY_RECOMMENDATION}`,
  };
}
