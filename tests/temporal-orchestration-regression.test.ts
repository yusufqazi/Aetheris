import { describe, expect, it } from "vitest";

import { selectStrongestEvidenceItems } from "@/components/workspace/report/InteractiveReport";
import {
  buildFallbackContradictions,
  buildFallbackResearchIntelligence,
} from "@/lib/research/claims";
import {
  groundedRecommendationsMateriallyConflict,
  groundedRecommendationConflictState,
} from "@/lib/research/conflict-semantics";
import {
  buildBestSupportedAnswer,
  primaryAnswerCoverageIssues,
} from "@/lib/research/grounding";
import { getSessionCitations } from "@/lib/research/evidence-spans";
import { sanitizeResearchIntelligence } from "@/lib/research/intelligence";
import {
  isOpenQuestionAnswered,
  reconcileTemporalEvidence,
} from "@/lib/research/open-questions";
import { buildInvestigationData } from "@/lib/research/investigation";
import { makeDemoSession } from "@/lib/demo-data";
import type {
  EvidenceItem,
  GroundedFact,
  ResearchContentType,
  ResearchSession,
} from "@/lib/types";

describe("temporal orchestration regression", () => {
  it("removes earlier missing evidence after a later source documents the answer", () => {
    const facts = [
      fact(0, "limitation", "The record does not yet document ambulatory oxygen saturation.", "08/15/2026 Progress note"),
      fact(1, "finding", "Ambulatory oxygen saturation was documented at 94-95% on room air.", "08/16/2026 Discharge addendum"),
      fact(2, "limitation", "The record does not yet document the response to oral diuretic therapy.", "08/15/2026 Progress note"),
      fact(3, "finding", "Oral furosemide was tolerated with documented urine output.", "08/16/2026 Discharge addendum"),
      fact(4, "limitation", "The record does not yet document a scheduled cardiology appointment.", "08/15/2026 Progress note"),
      fact(5, "finding", "The cardiology appointment was scheduled before discharge.", "08/16/2026 Discharge addendum"),
      fact(6, "limitation", "The record does not yet document a home scale or heart-failure education.", "08/15/2026 Progress note"),
      fact(7, "finding", "A home scale was provided and heart-failure education was completed.", "08/16/2026 Discharge addendum"),
    ];
    const evidence = facts.map(evidenceForFact);
    const currentFacts = reconcileTemporalEvidence(facts);
    const intelligence = buildFallbackResearchIntelligence({
      question: "What evidence is still needed before discharge?",
      facts: currentFacts,
      evidence,
      directAnswer: "The latest record documents the ambulatory oxygen measurement.",
      uncertainties: [],
      followUpQuestions: [],
      consensus: {
        disagreements: [],
        missingEvidence: [
          "Documentation of ambulatory oxygen saturation.",
          "Documentation of response to oral diuretic therapy.",
          "Documentation of a scheduled cardiology appointment.",
          "Documentation of a home scale and heart-failure education.",
        ],
      },
    });

    expect(currentFacts.filter((item) => item.contentType === "limitation")).toHaveLength(0);
    expect(intelligence.decisionChangingUnknowns).toHaveLength(0);
  });

  it("does not treat a later fulfillment of an earlier conditional plan as a conflict", () => {
    const earlier = fact(
      0,
      "recommendation",
      "Defer the ischemic evaluation until renal function stabilizes; inpatient versus outpatient timing depends on the clinical course.",
      "08/15/2026 Cardiology note",
    );
    const later = fact(
      1,
      "recommendation",
      "Proceed with expedited outpatient ischemic evaluation after renal function stabilized; there is no objection to discharge.",
      "08/16/2026 Cardiology addendum",
    );
    const facts = [earlier, later];
    const evidence = facts.map(evidenceForFact);
    const fallback = buildFallbackResearchIntelligence({
      question: "When should ischemic evaluation occur?",
      facts,
      evidence,
      directAnswer: later.text,
      uncertainties: [],
      followUpQuestions: [],
    });
    const sanitized = sanitizeResearchIntelligence({
      ...fallback,
      contradictions: [{
        issue: "The two notes appear to disagree about whether evaluation should proceed.",
        sourcePositions: [
          "Do not proceed with ischemic evaluation.",
          "Proceed with ischemic evaluation.",
        ],
        reconciliation: "The decision must be reconciled.",
        impact: "The recommendations appear different.",
        evidenceIds: [earlier.evidenceId, later.evidenceId],
      }],
    }, evidence, facts);

    expect(groundedRecommendationsMateriallyConflict(earlier, later)).toBe(false);
    expect(sanitized?.contradictions).toHaveLength(0);
  });

  it("preserves simultaneous incompatible treatment-intensity recommendations", () => {
    const cardiology = fact(
      0,
      "recommendation",
      "Continue decongestion with a net negative fluid balance goal of 1.5-2.0 L/day.",
      "08/15/2026 Cardiology recommendation",
      "03_cardiology_consult.pdf",
    );
    const nephrology = fact(
      1,
      "recommendation",
      "Reduce decongestion intensity to a net negative fluid balance goal of 0.5-1.0 L/day.",
      "08/15/2026 Nephrology recommendation",
      "04_nephrology_consult.pdf",
    );

    expect(groundedRecommendationsMateriallyConflict(cardiology, nephrology)).toBe(true);
    expect(buildFallbackContradictions(
      [cardiology, nephrology],
      [cardiology, nephrology].map(evidenceForFact),
    )).toHaveLength(1);
  });

  it("answers a supported discharge-readiness question directly in the first sentence", () => {
    const question = "Based on all available records, is this patient ready for discharge, what are the major active clinical problems, and what important uncertainties or follow-up needs remain?";
    const facts = [
      fact(0, "recommendation", "Discharge is reasonable with the documented outpatient plan.", "08/16/2026 Discharge addendum"),
      fact(1, "finding", "Mild residual congestion remains clinically stable on oral therapy.", "08/16/2026 Progress note"),
      fact(2, "recommendation", "Repeat renal laboratory testing is scheduled after discharge.", "08/16/2026 Follow-up plan"),
    ];

    const answer = buildBestSupportedAnswer(question, facts);

    expect(answer).toMatch(/^Yes, based on the latest available records,/i);
    expect(primaryAnswerCoverageIssues(answer, question, facts)).not.toContain(
      "indirect-disposition-answer",
    );
    expect(primaryAnswerCoverageIssues(
      "The records summarize the current clinical problems and follow-up plan. The patient is ready for discharge.",
      question,
      facts,
    )).toContain("indirect-disposition-answer");
  });

  it("keeps only unanswered members of a compound prior-state gap", () => {
    const facts = [
      fact(0, "limitation", "The record does not yet contain a documented mobility assessment, a finalized laboratory result, or confirmation of completed teaching.", "08/15/2026 Progress note"),
      fact(1, "finding", "The finalized laboratory result was documented the next day.", "08/16/2026 Addendum"),
      fact(2, "finding", "Completion of teaching was confirmed in the addendum.", "08/16/2026 Addendum"),
    ];

    const current = reconcileTemporalEvidence(facts);

    const unresolved = current.filter((item) => ["limitation", "unresolved_question"].includes(item.contentType));
    expect(unresolved.some((item) => /finalized laboratory|completed teaching/i.test(item.text))).toBe(false);
    expect(unresolved.some((item) => /mobility assessment/i.test(item.text))).toBe(true);
  });

  it("does not let unrelated later evidence resolve a missing subject", () => {
    const facts = [
      fact(0, "limitation", "The record does not yet document a mobility assessment.", "08/15/2026 Progress note"),
      fact(1, "finding", "A laboratory result was documented as normal.", "08/16/2026 Addendum"),
    ];

    expect(isOpenQuestionAnswered("What mobility assessment is documented?", facts)).toBe(false);
    expect(reconcileTemporalEvidence(facts).some((item) => /mobility assessment/i.test(item.text))).toBe(true);
  });

  it("matches differently phrased fulfillment of the same missing subject", () => {
    const facts = [
      fact(0, "limitation", "The chart does not yet contain confirmation of functional tolerance on the intended regimen.", "08/15/2026 Progress note"),
      fact(1, "finding", "Functional tolerance was confirmed after transition to the intended regimen.", "08/16/2026 Addendum"),
    ];

    expect(reconcileTemporalEvidence(facts).filter((item) => item.contentType === "limitation")).toHaveLength(0);
  });

  it("does not conflict a conservative recommendation with a later compatible disposition update", () => {
    const earlier = fact(0, "recommendation", "Continue holding therapy X and avoid exposure Y while recovery continues.", "08/15/2026 Alpha consult", "01_alpha_consult.pdf");
    const later = fact(1, "recommendation", "Discharge is reasonable with continued holding of therapy X and avoidance of exposure Y.", "08/16/2026 Alpha addendum", "02_alpha_addendum.pdf");

    expect(groundedRecommendationsMateriallyConflict(earlier, later, [earlier, later])).toBe(false);
  });

  it("does not conflict recommendations that apply to distinct conditional branches", () => {
    const increase = fact(0, "recommendation", "Increase therapy X if hemodynamic instability develops.", "08/15/2026 Alpha consult", "01_alpha_consult.pdf");
    const reduce = fact(1, "recommendation", "Reduce therapy X if laboratory recovery is confirmed.", "08/15/2026 Bravo consult", "02_bravo_consult.pdf");

    expect(groundedRecommendationsMateriallyConflict(increase, reduce, [increase, reduce])).toBe(false);
  });

  it("keeps a contemporaneous same-decision intensity disagreement current", () => {
    const increase = fact(0, "recommendation", "Increase therapy X now to a target of 20 units.", "08/15/2026 Alpha consult", "01_alpha_consult.pdf");
    const reduce = fact(1, "recommendation", "Reduce therapy X now to a target of 10 units.", "08/15/2026 Bravo consult", "02_bravo_consult.pdf");

    expect(groundedRecommendationConflictState(increase, reduce, [increase, reduce])).toBe("current");
  });

  it("retains a historical disagreement while recognizing later convergence", () => {
    const alphaEarlier = fact(0, "recommendation", "Increase therapy X now to a target of 20 units.", "08/15/2026 Alpha consult", "01_alpha_consult.pdf");
    const bravoEarlier = fact(1, "recommendation", "Reduce therapy X now to a target of 10 units.", "08/15/2026 Bravo consult", "02_bravo_consult.pdf");
    const alphaLater = fact(2, "recommendation", "Continue therapy X at the agreed target of 12 units.", "08/16/2026 Alpha addendum", "03_alpha_addendum.pdf");
    const bravoLater = fact(3, "recommendation", "Continue therapy X at the agreed target of 12 units.", "08/16/2026 Bravo addendum", "04_bravo_addendum.pdf");
    const facts = [alphaEarlier, bravoEarlier, alphaLater, bravoLater];

    expect(groundedRecommendationConflictState(alphaEarlier, bravoEarlier, facts)).toBe("historical-resolved");
    expect(reconcileTemporalEvidence(facts)).toEqual(facts);
  });

  it("treats a same-source fulfilled prerequisite as a temporal update", () => {
    const earlier = fact(0, "recommendation", "Defer procedure X until prerequisite Y is available.", "08/15/2026 Alpha consult", "01_alpha_consult.pdf");
    const later = fact(1, "recommendation", "Proceed with procedure X after prerequisite Y became available.", "08/16/2026 Alpha addendum", "02_alpha_addendum.pdf");

    expect(groundedRecommendationConflictState(earlier, later, [earlier, later])).toBe("invalid");
  });

  it("projects one reconciled state into displayed findings, conflicts, questions, and answer", () => {
    const records = [
      { type: "limitation" as const, text: "The record does not yet contain a finalized clearance result or confirmation of completed teaching.", section: "08/15/2026 Progress note", name: "01_progress_note.pdf" },
      { type: "finding" as const, text: "The finalized clearance result was documented as acceptable.", section: "08/16/2026 Addendum", name: "02_addendum.pdf" },
      { type: "finding" as const, text: "Completion of teaching was confirmed before disposition.", section: "08/16/2026 Addendum", name: "03_addendum.pdf" },
      { type: "recommendation" as const, text: "Increase therapy X now to a target of 20 units.", section: "08/16/2026 Alpha consult", name: "04_alpha_consult.pdf" },
      { type: "recommendation" as const, text: "Reduce therapy X now to a target of 10 units.", section: "08/16/2026 Bravo consult", name: "05_bravo_consult.pdf" },
    ];
    const session = sessionForRecords(records);
    const facts = session.results!.groundedFacts!;
    const evidence = session.evidence;
    const intelligence = buildFallbackResearchIntelligence({
      question: session.question,
      facts,
      evidence,
      directAnswer: "The specialist disagreement cannot be determined from the uploaded evidence.",
      uncertainties: [],
      followUpQuestions: [],
      consensus: {
        disagreements: ["The two services recommend materially different targets for therapy X."],
        missingEvidence: ["A finalized clearance result.", "Confirmation of completed teaching."],
      },
    });
    intelligence.directAnswer = "The specialist disagreement cannot be determined from the uploaded evidence.";
    intelligence.structuredClaims = [
      ...(intelligence.structuredClaims ?? []),
      {
        id: "claim:stale-gap",
        conclusion: "The record does not yet contain a finalized clearance result or confirmation of completed teaching.",
        kind: "direct_observation",
        dimension: "limitation",
        theme: "Unresolved evidence",
        reasoningSummary: "The earlier record described both items as absent at that time.",
        evidenceIds: [facts[0].evidenceId],
        counterEvidenceIds: [],
        uncertainty: "This prior-state statement was later resolved.",
        confidence: "high",
        priority: "important",
      },
    ];
    intelligence.decisionChangingUnknowns.push({
      unknown: "What does the finalized clearance result show?",
      known: "The earlier record did not contain the result.",
      evidenceNeeded: "The finalized clearance result.",
      whyItMatters: "The result changes the current decision state.",
      evidenceIds: [facts[0].evidenceId],
      priority: "high",
    });
    session.results = {
      ...session.results!,
      reportGeneration: {
        ...session.results!.reportGeneration,
        executiveSummary: intelligence.directAnswer,
        recommendedFollowUpQuestions: ["What does the finalized clearance result show?"],
        researchIntelligence: intelligence,
        citations: undefined,
      },
      citations: undefined,
    };

    const investigation = buildInvestigationData(session);
    const displayedFindings = investigation.findings.map((item) => item.statement).join(" ");
    const displayedQuestions = investigation.openQuestions.map((item) => item.question).join(" ");

    expect(displayedFindings).not.toMatch(/does not yet contain/i);
    expect(displayedQuestions).not.toMatch(/clearance result|completed teaching/i);
    expect(investigation.conflicts).toHaveLength(1);
    expect(investigation.directAnswer).not.toMatch(/disagreement cannot be determined/i);
    expect(investigation.directAnswer).toMatch(/different targets|20 units|10 units/i);
  });

  it("reconciles runtime-shaped shared chunks before every displayed report section", () => {
    const session = runtimeShapedSession();
    const storedFacts = session.results!.groundedFacts!;
    const intelligence = buildFallbackResearchIntelligence({
      question: session.question,
      facts: storedFacts,
      evidence: session.evidence,
      directAnswer: "The specialist disagreement cannot be determined from the uploaded evidence.",
      uncertainties: [],
      followUpQuestions: [],
      consensus: {
        disagreements: ["The services used different treatment-intensity targets earlier in the admission."],
        missingEvidence: [
          "A standardized ambulatory functional measurement after improvement.",
          "A confirmed next-day regimen response.",
          "A scheduled specialist appointment.",
          "Evidence that a home device was provided and education was completed.",
        ],
      },
    });
    intelligence.directAnswer = "The specialist disagreement cannot be determined from the uploaded evidence.";
    intelligence.structuredClaims = [
      ...(intelligence.structuredClaims ?? []),
      {
        id: "claim:runtime-stale-gap",
        conclusion: "The chart does not yet contain a confirmed next-day regimen response, a scheduled specialist appointment, or evidence that a home device was provided and education was completed.",
        kind: "direct_observation",
        dimension: "limitation",
        theme: "Unresolved evidence",
        reasoningSummary: "The earlier record described these items as absent at that time.",
        evidenceIds: ["evidence:runtime:prior-state"],
        counterEvidenceIds: [],
        uncertainty: "This prior-state statement was later resolved.",
        confidence: "high",
        priority: "important",
      },
    ];
    intelligence.decisionChangingUnknowns.push(
      {
        unknown: "What does the missing evidence establish about walking or ambulatory functional measurement after improvement?",
        known: "The earlier record did not contain the measurement.",
        evidenceNeeded: "A standardized ambulatory functional measurement.",
        whyItMatters: "It informs the current disposition decision.",
        evidenceIds: ["evidence:runtime:prior-state"],
        priority: "high",
      },
      {
        unknown: "What does the missing evidence establish about evidence that a home device was provided and education was completed?",
        known: "The earlier record did not contain either item.",
        evidenceNeeded: "Provision of the device and completion of education.",
        whyItMatters: "They are prerequisites for the current plan.",
        evidenceIds: ["evidence:runtime:prior-state"],
        priority: "high",
      },
    );
    session.results = {
      ...session.results!,
      debateConsensus: {
        ...session.results!.debateConsensus,
        disagreements: ["The services used different treatment-intensity targets earlier in the admission."],
        missingEvidence: [
          "A standardized ambulatory functional measurement after improvement.",
          "A confirmed next-day regimen response.",
          "A scheduled specialist appointment.",
          "Evidence that a home device was provided and education was completed.",
        ],
      },
      reportGeneration: {
        ...session.results!.reportGeneration,
        executiveSummary: intelligence.directAnswer,
        recommendedFollowUpQuestions: [
          "What does the missing evidence establish about walking or ambulatory functional measurement after improvement?",
          "What does the missing evidence establish about the confirmed next-day regimen response and scheduled specialist appointment?",
          "What does the missing evidence establish about evidence that a home device was provided and education was completed?",
        ],
        researchIntelligence: intelligence,
        citations: undefined,
      },
      citations: undefined,
    };

    const currentFacts = reconcileTemporalEvidence(storedFacts, session.evidence);
    const investigation = buildInvestigationData(session);
    const citations = getSessionCitations(session);
    const supportingEvidence = selectStrongestEvidenceItems(investigation, citations, session.question);
    const displayedFindings = investigation.findings.map((item) => item.statement).join(" ");
    const displayedQuestions = investigation.openQuestions.map((item) => item.question).join(" ");

    expect(currentFacts.some((item) => /does not yet|no documented/i.test(item.text))).toBe(false);
    expect(displayedFindings).not.toMatch(/does not yet|no documented/i);
    expect(displayedQuestions).not.toMatch(/ambulatory|regimen response|appointment|home device|education/i);
    expect(investigation.conflicts).toHaveLength(1);
    expect(investigation.conflicts[0]?.statement).toMatch(/1\.5-2\.0 L\/day|0\.5-1\.0 L\/day/i);
    expect(investigation.conflicts[0]?.explanation).toMatch(/earlier|historical|converged/i);
    expect(investigation.directAnswer).toMatch(/^Yes,/i);
    expect(investigation.directAnswer).not.toMatch(/disagreement cannot be determined/i);
    expect(investigation.directAnswer).toMatch(/1\.5-2\.0 L\/day|0\.5-1\.0 L\/day|different/i);
    expect(supportingEvidence.map((item) => item.quote).join(" ")).not.toMatch(/does not yet|no documented/i);
    expect(storedFacts.some((item) => /does not yet|no documented/i.test(item.text))).toBe(true);
  });
});

function runtimeShapedSession(): ResearchSession {
  const session = makeDemoSession();
  session.question = "What caused the admission, how did the patient respond, where did the services genuinely disagree, and by the latest evidence is the patient ready for discharge? What evidence remains unresolved?";
  const priorText = [
    "Clinical status improved after treatment X.",
    "There is no documented walking or ambulatory functional measurement after improvement.",
    "The chart does not yet contain a confirmed next-day regimen response, a scheduled specialist appointment, or evidence that a home device was provided and education was completed.",
  ].join(" ");
  const laterText = [
    "The next-day regimen response was documented and tolerated.",
    "A standardized ambulatory functional measurement was documented after improvement.",
    "The specialist appointment was scheduled before discharge.",
    "A home device was provided before discharge.",
    "Patient education was completed before discharge.",
    "Both services have no objection to discharge with close follow-up.",
  ].join(" ");
  const documentInputs = [
    ["01_alpha_consult.pdf", "08/15/2026 Alpha Consult. Continue treatment X with a goal of 1.5-2.0 L/day if status permits."],
    ["02_bravo_consult.pdf", "08/15/2026 Bravo Consult. Continue treatment X, but use a more conservative goal of 0.5-1.0 L/day while monitoring status."],
    ["03_progress_note.pdf", `08/15/2026 Progress Note. ${priorText}`],
    ["04_discharge_addendum.pdf", `08/16/2026 Discharge Addendum. ${laterText}`],
  ] as const;
  session.documents = documentInputs.map(([name, text], index) => ({
    id: `document:runtime:${index}`,
    name,
    size: text.length,
    pageCount: 1,
    uploadedAt: "2026-08-16T12:00:00.000Z",
    preview: text.slice(0, 120),
    text,
    pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
  }));

  const facts: GroundedFact[] = [
    runtimeFact(0, "finding", "The admission was caused by condition Z.", 0, "08/15/2026 Alpha Consult"),
    runtimeFact(1, "recommendation", "Continue treatment X with a goal of 1.5-2.0 L/day if status permits.", 0, "08/15/2026 Alpha Consult"),
    runtimeFact(2, "recommendation", "Continue treatment X, but use a more conservative goal of 0.5-1.0 L/day while monitoring status.", 1, "08/15/2026 Bravo Consult"),
    runtimeFact(3, "finding", "Clinical status improved after treatment X.", 2, "08/15/2026 Progress Note", "evidence:runtime:prior-state"),
    runtimeFact(4, "limitation", "There is no documented walking or ambulatory functional measurement after improvement.", 2, "08/15/2026 Progress Note", "evidence:runtime:prior-state"),
    runtimeFact(5, "limitation", "The chart does not yet contain a confirmed next-day regimen response, a scheduled specialist appointment, or evidence that a home device was provided and education was completed.", 2, "08/15/2026 Progress Note", "evidence:runtime:prior-state"),
    runtimeFact(6, "finding", "The next-day regimen response was documented and tolerated.", 3, "08/16/2026 Discharge Addendum", "evidence:runtime:latest-state"),
    runtimeFact(7, "finding", "A standardized ambulatory functional measurement was documented after improvement.", 3, "08/16/2026 Discharge Addendum", "evidence:runtime:latest-state"),
    runtimeFact(8, "finding", "The specialist appointment was scheduled before discharge.", 3, "08/16/2026 Discharge Addendum", "evidence:runtime:latest-state"),
    runtimeFact(9, "finding", "A home device was provided before discharge.", 3, "08/16/2026 Discharge Addendum", "evidence:runtime:latest-state"),
    runtimeFact(10, "recommendation", "Alpha service has no objection to discharge with close follow-up.", 3, "08/16/2026 Alpha Addendum", "evidence:runtime:latest-state"),
    runtimeFact(11, "recommendation", "Bravo service has no objection to discharge with close follow-up.", 3, "08/16/2026 Bravo Addendum", "evidence:runtime:latest-state"),
  ];
  session.evidence = [
    evidenceForFact(facts[0], 0),
    evidenceForFact(facts[1], 1),
    evidenceForFact(facts[2], 2),
    { ...evidenceForFact(facts[3], 3), excerpt: priorText },
    { ...evidenceForFact(facts[6], 4), excerpt: laterText },
  ];
  session.results = {
    ...session.results!,
    groundedFacts: facts,
  };
  return session;
}

function runtimeFact(
  index: number,
  contentType: ResearchContentType,
  text: string,
  documentIndex: number,
  sourceSection: string,
  evidenceId = `evidence:runtime:${index}`,
): GroundedFact {
  const names = [
    "01_alpha_consult.pdf",
    "02_bravo_consult.pdf",
    "03_progress_note.pdf",
    "04_discharge_addendum.pdf",
  ];
  return {
    ...fact(index, contentType, text, sourceSection, names[documentIndex]),
    id: `fact:runtime:${index}`,
    evidenceId,
    documentId: `document:runtime:${documentIndex}`,
    excerpt: text,
  };
}

function sessionForRecords(records: Array<{
  type: ResearchContentType;
  text: string;
  section: string;
  name: string;
}>): ResearchSession {
  const session = makeDemoSession();
  session.question = "What is the current decision, where do the services disagree, and what evidence remains unresolved?";
  session.documents = records.map((record, index) => ({
    id: `document:projection:${index}`,
    name: record.name,
    size: record.text.length,
    type: "application/pdf",
    pageCount: 1,
    preview: record.text.slice(0, 120),
    text: record.text,
    pages: [{ number: 1, text: record.text, startOffset: 0, endOffset: record.text.length }],
    uploadedAt: "2026-08-16T12:00:00.000Z",
    extractionStatus: "ready",
    extractionWarnings: [],
  }));
  const facts = records.map((record, index) => ({
    ...fact(index, record.type, record.text, record.section, record.name),
    documentId: session.documents[index].id,
  }));
  session.evidence = facts.map(evidenceForFact);
  session.results = {
    ...session.results!,
    groundedFacts: facts,
  };
  return session;
}

function fact(
  index: number,
  contentType: ResearchContentType,
  text: string,
  sourceSection: string,
  documentName = `${index + 1}_clinical_note.pdf`,
): GroundedFact {
  return {
    id: `fact:temporal:${index}`,
    category: contentType === "limitation" ? "limitation" : "context",
    contentType,
    text,
    evidenceId: `evidence:temporal:${index}`,
    documentId: `document:temporal:${index}`,
    documentName,
    sourceSection,
    page: 1,
    excerpt: text,
    relevance: "Direct evidence for the current clinical decision.",
  };
}

function evidenceForFact(item: GroundedFact, index: number): EvidenceItem {
  return {
    id: item.evidenceId,
    chunkId: `chunk:temporal:${index}`,
    documentId: item.documentId,
    excerpt: item.excerpt,
    documentName: item.documentName,
    page: item.page ?? 1,
    section: item.sourceSection ?? "Page 1",
    relevance: item.relevance,
    contextBefore: "",
    contextAfter: "",
    matchedTerms: [],
    lexicalScore: 1,
    similarityScore: null,
    retrievalMethod: "lexical",
  };
}
