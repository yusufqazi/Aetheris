import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({
  runStructuredGeneration: vi.fn(async ({ fallback }) => {
    const grounded = fallback();
    return {
      ...grounded,
      directAnswer:
        "CT perfusion should be obtained before deciding whether to add the downstream intervention. The diagnosis or cause cannot be determined from the uploaded evidence. The specialist disagreement cannot be determined from the uploaded evidence.",
      contradictions: [
        {
          issue: "The treatment recommendation conflicts with imaging eligibility evidence.",
          sourcePositions: [
            "Do not delay eligible intravenous thrombolysis.",
            "No hemorrhage or other CT contraindication to intravenous thrombolytic treatment is identified.",
          ],
          reconciliation: "These statements were incorrectly treated as opposing actions.",
          impact: "They concern the same treatment.",
          evidenceIds: ["evidence:stroke:2", "evidence:stroke:3"],
        },
        {
          issue: "The treatment recommendation conflicts with medication eligibility evidence.",
          sourcePositions: [
            "Do not delay eligible intravenous thrombolysis.",
            "No medication or laboratory contraindication to intravenous thrombolytic therapy is identified.",
          ],
          reconciliation: "These statements were incorrectly treated as opposing actions.",
          impact: "They concern the same treatment.",
          evidenceIds: ["evidence:stroke:2", "evidence:stroke:4"],
        },
        ...grounded.contradictions,
      ],
    };
  }),
}));

import { runReportAgent } from "@/lib/agents/reportAgent";
import { makeDemoSession } from "@/lib/demo-data";
import {
  classifyStatementRole,
  recommendationsMateriallyConflict,
} from "@/lib/research/conflict-semantics";
import { normalizeEvidenceItems } from "@/lib/research/evidence-normalization";
import type {
  EvidenceItem,
  GroundedFact,
  ResearchContentType,
  UploadedDocument,
} from "@/lib/types";

const QUESTION =
  "What caused the acute neurologic presentation, what treatment should be prioritized immediately, when should a downstream intervention be added, where do the specialists genuinely differ, and what evidence is still needed?";
const IMMEDIATE_TREATMENT =
  "Immediate intravenous thrombolysis should proceed without delay.";
const DO_NOT_DELAY_TREATMENT =
  "Do not delay eligible intravenous thrombolysis while additional evidence is obtained for the separate downstream intervention decision.";
const CT_ELIGIBILITY =
  "No hemorrhage or other CT contraindication to intravenous thrombolytic treatment is identified.";
const PHARMACY_ELIGIBILITY =
  "No medication or laboratory contraindication to intravenous thrombolytic therapy is identified.";
const ACCEPTED_ESCALATION_DISAGREEMENT =
  "Vascular Neurology and Neurointerventional differ on the escalation threshold for mechanical thrombectomy: Vascular Neurology would not add it solely because a distal occlusion is present, while Neurointerventional requires CT perfusion before deciding whether to proceed.";

describe("established treatment and escalation reasoning regression", () => {
  it("rejects eligibility false conflicts and recovers the established diagnosis, immediate action, and accepted escalation disagreement", async () => {
    expect(classifyStatementRole(DO_NOT_DELAY_TREATMENT)).toBe("recommendation_for");
    expect(classifyStatementRole(CT_ELIGIBILITY)).toBe("safety_information");
    expect(classifyStatementRole(PHARMACY_ELIGIBILITY)).toBe("safety_information");
    expect(recommendationsMateriallyConflict(DO_NOT_DELAY_TREATMENT, CT_ELIGIBILITY)).toBe(false);
    expect(recommendationsMateriallyConflict(DO_NOT_DELAY_TREATMENT, PHARMACY_ELIGIBILITY)).toBe(false);

    const base = makeDemoSession();
    const records: Array<{ name: string; type: ResearchContentType; text: string }> = [
      {
        name: "01_neurologic_assessment.pdf",
        type: "finding",
        text: "The acute ischemic event in the right cerebral territory was caused by a distal arterial occlusion.",
      },
      { name: "02_acute_treatment_consensus.pdf", type: "recommendation", text: IMMEDIATE_TREATMENT },
      { name: "02_acute_treatment_consensus.pdf", type: "recommendation", text: DO_NOT_DELAY_TREATMENT },
      { name: "03_noncontrast_imaging.pdf", type: "safety_observation", text: CT_ELIGIBILITY },
      { name: "04_medication_review.pdf", type: "safety_observation", text: PHARMACY_ELIGIBILITY },
      {
        name: "05_vascular_neurology_consult.pdf",
        type: "recommendation",
        text: "Vascular Neurology recommends against proceeding with mechanical thrombectomy solely because a distal occlusion is present.",
      },
      {
        name: "06_neurointerventional_consult.pdf",
        type: "recommendation",
        text: "Neurointerventional recommends deferring the mechanical thrombectomy decision until CT perfusion is available.",
      },
      { name: "07_pending_evidence.pdf", type: "limitation", text: "CT perfusion remains pending." },
      { name: "08_status_update.pdf", type: "limitation", text: "Post-treatment neurologic response and the repeat severity score remain pending." },
      { name: "09_follow_up_imaging.pdf", type: "limitation", text: "Follow-up brain imaging at 24 hours remains pending." },
      { name: "10_swallow_assessment.pdf", type: "limitation", text: "The swallowing evaluation remains pending." },
      { name: "11_mobility_assessment.pdf", type: "limitation", text: "The mobility and therapy assessment remains pending." },
    ];
    const documents = records.map((record, index) =>
      makeDocument(base.id, index, record.name, record.text)
    );
    const facts: GroundedFact[] = records.map((record, index) => ({
      id: `fact:stroke:${index}`,
      category: record.type === "limitation" ? "limitation" : "context",
      contentType: record.type,
      text: record.text,
      evidenceId: `evidence:stroke:${index}`,
      documentId: documents[index].id,
      documentName: record.name,
      page: 1,
      excerpt: record.text,
      relevance: "Direct evidence for the requested clinical decision.",
    }));
    const evidence = facts.map(makeEvidence);
    const debate = {
      ...base.results!.debateConsensus,
      disagreements: [ACCEPTED_ESCALATION_DISAGREEMENT],
      missingEvidence: [
        "CT perfusion remains pending for the escalation decision.",
        "Post-treatment neurologic response and the repeat severity score remain pending.",
        "Follow-up brain imaging at 24 hours remains pending.",
        "The swallowing evaluation remains pending.",
        "The mobility and therapy assessment remains pending.",
      ],
      finalConsensus:
        "Immediate treatment should proceed without delay; the separate downstream intervention decision remains conditional on additional evidence and the specialists use different escalation thresholds.",
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
    const answer = report.executiveSummary;
    const unknowns = report.researchIntelligence!.decisionChangingUnknowns
      .map((item) => `${item.unknown} ${item.evidenceNeeded}`)
      .join(" ");

    expect(answer).toMatch(/acute ischemic event.*caused by.*distal arterial occlusion/i);
    expect(answer).toMatch(/intravenous thrombolysis.*(?:without delay|immediate)/i);
    expect(answer).not.toMatch(/thrombolysis[^.]{0,100}(?:wait|defer|pending)[^.]*perfusion/i);
    expect(answer).not.toMatch(/diagnosis or cause.{0,60}cannot be determined/i);
    expect(answer).not.toMatch(/specialist disagreement.{0,60}cannot be determined/i);

    expect(report.researchIntelligence!.contradictions).toHaveLength(1);
    expect(report.researchIntelligence!.contradictions[0].issue).toBe(
      ACCEPTED_ESCALATION_DISAGREEMENT,
    );
    expect(report.researchIntelligence!.contradictions[0].sourcePositions.join(" ")).toMatch(
      /recommends against proceeding.*recommends deferring/i,
    );

    expect(unknowns).toMatch(/CT perfusion/i);
    expect(unknowns).toMatch(/neurologic response|severity score/i);
    expect(unknowns).toMatch(/24 hours|follow-up brain imaging/i);
    expect(unknowns).toMatch(/swallowing evaluation/i);
    expect(unknowns).toMatch(/mobility and therapy assessment/i);
  });
});

function makeDocument(
  sessionId: string,
  index: number,
  name: string,
  text: string,
): UploadedDocument {
  return {
    id: `document:stroke:${index}`,
    sessionId,
    name,
    size: text.length,
    pageCount: 1,
    uploadedAt: "2026-09-02T00:00:00.000Z",
    preview: text,
    text,
    pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
  };
}

function makeEvidence(fact: GroundedFact, index: number): EvidenceItem {
  return {
    id: fact.evidenceId,
    chunkId: `chunk:stroke:${index}`,
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
