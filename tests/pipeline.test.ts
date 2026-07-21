import { afterEach, describe, expect, it } from "vitest";

import { makeDemoDocuments } from "@/lib/demo-data";
import type { ResearchEventInput } from "@/lib/research/events";
import { buildInvestigationData } from "@/lib/research/investigation";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { createResearchSession } from "@/lib/research/session";
import { AGENT_IDS, SPECIALIST_AGENT_IDS, type UploadedDocument } from "@/lib/types";

const originalApiKey = process.env.OPENAI_API_KEY;
const originalGeminiApiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }
  if (originalGeminiApiKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = originalGeminiApiKey;
  }
});

describe("research pipeline orchestration", () => {
  it(
    "settles specialists independently before consensus and report assembly",
    async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      const session = createResearchSession({
        id: "pipeline-session",
        question: "Compare safety signals, interactions, and study limitations.",
        selectedAgents: [...AGENT_IDS],
        documents: makeDemoDocuments(),
        mode: "demo",
      });
      const events: ResearchEventInput[] = [];

      const result = await runResearchPipeline({
        session,
        emit: (event) => {
          events.push(event);
        },
      });

      const specialistStarted = events
        .map((event, index) => ({ event, index }))
        .filter(
          ({ event }) =>
            event.type === "agent.started" &&
            SPECIALIST_AGENT_IDS.some((agentId) => agentId === event.agentId),
        );
      const specialistCompleted = events
        .map((event, index) => ({ event, index }))
        .filter(
          ({ event }) =>
            event.type === "agent.completed" &&
            SPECIALIST_AGENT_IDS.some((agentId) => agentId === event.agentId),
        );
      const consensusStarted = events.findIndex(
        (event) => event.type === "agent.started" && event.agentId === "debate-consensus",
      );
      const consensusCompleted = events.findIndex(
        (event) => event.type === "agent.completed" && event.agentId === "debate-consensus",
      );
      const reportStarted = events.findIndex(
        (event) => event.type === "agent.started" && event.agentId === "report-generation",
      );
      const firstSection = events.findIndex((event) => event.type === "report.section.completed");

      expect(specialistStarted).toHaveLength(4);
      expect(specialistCompleted).toHaveLength(4);
      expect(Math.max(...specialistStarted.map(({ index }) => index))).toBeLessThan(
        Math.min(...specialistCompleted.map(({ index }) => index)),
      );
      expect(specialistCompleted.map(({ event }) => event.type === "agent.completed" && event.agentId)).toEqual([
        "literature-search",
        "drug-interaction",
        "adverse-reaction",
        "trial-summarizer",
      ]);
      expect(consensusStarted).toBeGreaterThan(Math.max(...specialistCompleted.map(({ index }) => index)));
      expect(reportStarted).toBeGreaterThan(consensusCompleted);
      expect(firstSection).toBeGreaterThan(reportStarted);
      expect(events.at(-1)?.type).toBe("session.completed");
      expect(result.metrics.retrievalMethod).toBe("lexical");
      expect(result.results.citations?.length).toBeGreaterThan(0);
      expect(result.confidence.dimensions).toHaveLength(6);
    },
    12_000,
  );

  it(
    "produces a concrete traceable AX-217 report in local fallback mode",
    async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      const session = createResearchSession({
        id: "ax-217-acceptance",
        question: "Summarize the efficacy, safety findings, and limitations of AX-217.",
        selectedAgents: [...AGENT_IDS],
        documents: [makeAx217Document()],
        mode: "live",
      });
      const events: ResearchEventInput[] = [];

      const result = await runResearchPipeline({
        session,
        emit: (event) => {
          events.push(event);
        },
      });

      const markdown = result.results.reportGeneration.markdownReport;
      const expectedDetails = [
        "34%",
        "18%",
        "p = 0.004",
        "41%",
        "22%",
        "24 weeks",
        "Pediatric, geriatric, and pregnant populations were excluded",
      ];

      expect(events).toContainEqual(expect.objectContaining({
        type: "analysis.mode",
        data: expect.objectContaining({ mode: "demo" }),
      }));
      expect(result.mode).toBe("demo");
      for (const detail of expectedDetails) {
        expect(markdown).toContain(detail);
      }
      expect(markdown).toContain("## Evidence Appendix");
      expect(markdown).toContain("## Research-Use Disclaimer");
      expect(markdown).not.toMatch(/physician briefing|patient-friendly/i);

      expect(result.results.reportGeneration.sections?.map((section) => section.title)).toEqual([
        "Executive Summary",
        "Findings That Answer the Question",
        "Safety Findings",
        "What the Documents Describe",
        "What Remains Uncertain",
        "Evidence Confidence",
        "Follow-Up Questions",
        "Source Evidence",
        "Research-Use Disclaimer",
      ]);
      expect(result.results.groundedFacts?.length).toBeGreaterThanOrEqual(10);
      expect(result.results.groundedFacts?.map((fact) => fact.text).join(" ")).toMatch(/adverse events|serious adverse events|headache|nausea/i);
      expect(result.results.citations?.length).toBeGreaterThan(0);
      expect(result.results.reportGeneration.researchIntelligence?.structuredClaims?.length).toBeGreaterThan(0);
      expect(new Set(
        result.results.reportGeneration.researchIntelligence?.structuredClaims?.map((claim) => claim.dimension),
      )).toEqual(new Set(["efficacy", "safety", "limitation"]));
      expect(result.results.reportGeneration.researchIntelligence?.structuredClaims?.every(
        (claim) => claim.reasoningSummary.length > 24 && claim.evidenceIds.length > 0,
      )).toBe(true);
      const investigation = buildInvestigationData({
        ...session,
        evidence: result.results.evidenceIndex ?? [],
        results: result.results,
      });
      expect(investigation.findings.length).toBeGreaterThan(0);
      expect(investigation.findings.every((finding) => finding.citationIds.length > 0)).toBe(true);
      expect(investigation.findings[0].reasoningType).toMatch(/conclusion|boundary|source observation/i);
      expect(result.confidence.dimensions.find((item) => item.id === "citation-strength")?.detail)
        .toMatch(/concrete findings link to exact source passages/i);
      expect(new Set([
        result.results.literatureSearch.confidence,
        result.results.drugInteraction.confidence,
        result.results.adverseReaction.confidence,
        result.results.trialSummarizer.confidence,
        result.results.debateConsensus.confidence,
        result.results.reportGeneration.confidence,
      ]).size).toBeGreaterThan(1);

      const evidenceIds = new Set(result.results.evidenceIndex?.map((item) => item.id));
      for (const fact of result.results.groundedFacts ?? []) {
        expect(evidenceIds.has(fact.evidenceId)).toBe(true);
        expect(fact.documentName).toBe("Aetheris_Mock_Clinical_Study.pdf");
        expect(fact.page).toBe(1);
        expect(fact.excerpt.length).toBeGreaterThan(0);
      }
    },
    12_000,
  );

  it(
    "answers a medication-interaction question directly without repeating source boilerplate",
    async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      const session = createResearchSession({
        id: "interaction-acceptance",
        question: "Are there any harmful drug interactions in these records?",
        selectedAgents: [...AGENT_IDS],
        documents: makeMedicationDocuments(),
        mode: "demo",
      });

      const result = await runResearchPipeline({ session, emit: () => undefined });
      const summary = result.results.reportGeneration.executiveSummary;
      const markdown = result.results.reportGeneration.markdownReport;
      const interactionFindings = result.results.groundedFacts?.filter((fact) => fact.category === "interaction") ?? [];

      expect(summary).toMatch(/uploaded documents|concern|interaction|QT/i);
      expect(summary).toMatch(/QT|arrhythmia/i);
      expect(markdown).toMatch(/Ibuprofen may contribute to gastrointestinal blood loss/i);
      expect(markdown).not.toMatch(/Synthetic test document/i);
      expect(markdown).not.toMatch(/Larger multi-center trials are recommended/i);
      expect(interactionFindings.length).toBeGreaterThanOrEqual(4);
      expect(new Set(interactionFindings.map((fact) => fact.text.toLowerCase())).size).toBe(interactionFindings.length);
      expect(result.results.drugInteraction.summary).toMatch(/hydroxychloroquine|omeprazole|propranolol|ibuprofen/i);
      expect(result.results.reportGeneration.researchIntelligence?.structuredClaims?.some(
        (claim) => /qtc?|qt-prolong/i.test(claim.conclusion),
      )).toBe(true);
    },
    12_000,
  );

  it(
    "synthesizes diagnosis, treatment timing, and specific evidence needs without inventing conflict",
    async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      const session = createResearchSession({
        id: "multidocument-diagnostic-acceptance",
        question:
          "What diagnosis is best supported, is there renal involvement, when should long-term treatment begin, and what evidence is still needed?",
        selectedAgents: [...AGENT_IDS],
        documents: makeMultidocumentDiagnosticCase(),
        mode: "demo",
      });

      const result = await runResearchPipeline({ session, emit: () => undefined });
      const answer = result.results.reportGeneration.executiveSummary;
      const investigation = buildInvestigationData({
        ...session,
        evidence: result.results.evidenceIndex ?? [],
        results: result.results,
      });
      const openQuestionText = investigation.openQuestions
        .map((item) => `${item.question} ${item.known} ${item.missingEvidence}`)
        .join(" ");

      expect(answer).toMatch(/systemic lupus erythematosus|lupus/i);
      expect(answer).toMatch(/ANA|anti-dsDNA|complement/i);
      expect(answer).toMatch(/proteinuria|hematuria|renal|nephritis/i);
      expect(answer).toMatch(/defer|biopsy|quantification|renal function/i);
      expect(answer).not.toMatch(/(?:\bthe|\ban|\ba|\band|\bor|\bwith|\bof|\bto|based on|consistent with)\s*[.;]?$/i);
      expect(investigation.conflicts).toHaveLength(0);
      expect(openQuestionText).toMatch(/biopsy/i);
      expect(openQuestionText).toMatch(/protein|quantification/i);
      expect(openQuestionText).toMatch(/renal function|kidney function/i);
      expect(investigation.openQuestions.every((item) => !/what additional source|what evidence would/i.test(item.question)))
        .toBe(true);
      expect(new Set((result.results.evidenceIndex ?? []).map((item) => item.documentId)).size)
        .toBeGreaterThanOrEqual(4);
      expect(result.results.groundedFacts?.every((fact) => /[.!?)]$/.test(fact.text.trim())))
        .toBe(true);
    },
    12_000,
  );
});

function makeAx217Document(): UploadedDocument {
  const text = [
    "Randomized, double-blind, placebo-controlled trial with 240 participants.",
    "120 received AX-217 and 120 received placebo over 24 weeks.",
    "Primary endpoint was Disease Activity Score (DAS).",
    "Secondary endpoints included biomarker changes, quality of life, and adverse events.",
    "AX-217 improved DAS by 34% versus 18% for placebo (p = 0.004).",
    "C-reactive protein decreased by 41% in the treatment arm.",
    "Quality-of-life scores improved by 22%.",
    "Common adverse events: headache (12%), nausea (9%), fatigue (8%), and injection-site reactions (6%).",
    "Two serious adverse events occurred in the treatment group and one in placebo; investigators judged none to be treatment-related.",
    "The study duration was limited to 24 weeks.",
    "Larger multi-center trials are recommended.",
    "Longer follow-up is needed to evaluate durability and delayed adverse events.",
    "Pediatric, geriatric, and pregnant populations were excluded.",
  ].join(" ");

  return {
    id: "ax-217-document",
    name: "Aetheris_Mock_Clinical_Study.pdf",
    size: text.length,
    pageCount: 1,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    preview: text.slice(0, 240),
    text,
    pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
  };
}

function makeMedicationDocuments(): UploadedDocument[] {
  return [
    makeDocument(
      "medication-review",
      "Medication_Safety_Review.pdf",
      [
        "Hydroxychloroquine + recent azithromycin exposure Moderate concern Both can prolong QT and create cumulative QT concern.",
        "Hydroxychloroquine + borderline QTc 477 ms Moderate concern Electrolyte abnormalities may increase arrhythmia risk.",
        "Propranolol may worsen orthostatic symptoms or blunt compensatory tachycardia.",
        "Omeprazole may reduce oral iron absorption and delay recovery.",
        "Ibuprofen may contribute to gastrointestinal blood loss when anemia is present.",
      ].join(" "),
    ),
    makeDocument(
      "follow-up",
      "Follow_Up_Clinical_Note.pdf",
      "Follow-up QTc improved to 449 ms after medication changes and electrolyte correction. This does not prove that medication exposure caused an arrhythmia.",
    ),
    makeDocument(
      "laboratory",
      "Laboratory_Trends.pdf",
      "Hemoglobin and ferritin remained depleted during follow-up, with iron deficiency anemia still present.",
    ),
    makeDocument(
      "clinical-note",
      "Clinical_Consultation.pdf",
      "The patient reported dizziness and orthostatic symptoms while propranolol was prescribed.",
    ),
  ];
}

function makeDocument(id: string, name: string, text: string): UploadedDocument {
  return {
    id,
    name,
    size: text.length,
    pageCount: 1,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    preview: text.slice(0, 240),
    text,
    pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
  };
}

function makeMultidocumentDiagnosticCase(): UploadedDocument[] {
  return [
    makeDocument(
      "clinical-presentation",
      "Clinical_Assessment.pdf",
      "The malar rash, inflammatory polyarthritis, oral ulcers, and photosensitivity strongly support systemic lupus erythematosus as the leading diagnosis.",
    ),
    makeDocument(
      "serology",
      "Autoimmune_Serology.pdf",
      "Antinuclear antibody testing was positive at high titer, anti-double-stranded DNA was elevated, and complement C3 and C4 levels were low.",
    ),
    makeDocument(
      "renal-findings",
      "Renal_Assessment.pdf",
      "Proteinuria and microscopic hematuria raise concern for lupus nephritis, but the severity and histologic class of renal involvement remain uncertain.",
    ),
    makeDocument(
      "treatment-plan",
      "Treatment_Recommendation.pdf",
      "Definitive long-term immunosuppressive therapy should be deferred until kidney biopsy and urine protein quantification are completed, unless renal function worsens.",
    ),
    makeDocument(
      "pending-workup",
      "Pending_Renal_Workup.pdf",
      "Kidney biopsy has not yet been performed. Urine protein quantification is pending. Renal function trends remain unknown.",
    ),
  ];
}
