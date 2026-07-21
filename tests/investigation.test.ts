import { describe, expect, it } from "vitest";

import { makeDemoSession } from "@/lib/demo-data";
import { buildInvestigationData, polishFindingStatement } from "@/lib/research/investigation";
import type {
  Citation,
  GroundedFact,
  GroundedFactCategory,
  ResearchContentType,
  ResearchSession,
} from "@/lib/types";

describe("investigation summary model", () => {
  it("builds the complete evidence investigation with a citation on every item", () => {
    const session = makeAcceptanceSession();
    const investigation = buildInvestigationData(session);

    expect(investigation.directAnswer).toBe(
      "Several medication-related concerns are documented, with cumulative QT-prolongation risk as the strongest concern, but no harmful arrhythmia or medication-caused injury is proven.",
    );
    expect(investigation.findings.length).toBeGreaterThanOrEqual(4);
    expect(new Set(investigation.findings.map((item) => item.statement)).size).toBe(investigation.findings.length);
    expect(investigation.findings[0].priority).toBe("Primary finding");
    expect(investigation.findings.map((item) => item.statement).join(" ")).toMatch(/QT|gastrointestinal|Propranolol|Omeprazole/i);
    expect(investigation.findings.every((item) => item.theme.length > 3)).toBe(true);
    expect(new Set(investigation.strongestCitationIds.map((id) =>
      session.results?.citations?.find((citation) => citation.id === id)?.documentId,
    )).size).toBeGreaterThan(1);
    expect(investigation.conflicts).toHaveLength(1);
    expect(investigation.conflicts[0].type).toBe("Documentation discrepancy");
    expect(investigation.changes.map((item) => [item.measure, item.earlierValue, item.laterValue])).toEqual([
      ["QTc", "477", "449"],
      ["Potassium", "3.6", "4.1"],
      ["Magnesium", "1.7", "2.0"],
      ["Palpitations", "Present", "Reduced but persisted"],
    ]);
    expect(investigation.openQuestions.map((item) => item.question).join(" ")).toMatch(/palpitations|QTc|blood loss|omeprazole/i);
    expect(investigation.openQuestions.every((item) =>
      item.known.length > 20 && item.missingEvidence.length > 20 && item.whyItMatters.length > 20,
    )).toBe(true);

    const allItems = [
      ...investigation.findings,
      ...investigation.conflicts,
      ...investigation.changes,
      ...investigation.openQuestions,
    ];
    expect(allItems.every((item) => item.citationIds.length > 0)).toBe(true);
    expect(allItems.flatMap((item) => item.citationIds).every(
      (id) => session.results?.citations?.some((citation) => citation.id === id),
    )).toBe(true);
  });

  it("does not invent conflict or change views for a session without those records", () => {
    const session = makeDemoSession();
    const firstEvidence = session.evidence[0];
    const fact = makeFact(
      session,
      0,
      "interaction_concern",
      "Therapy plus a strong inhibitor may increase systemic exposure.",
      firstEvidence.id,
    );

    session.results = {
      ...session.results!,
      groundedFacts: [fact],
      reportGeneration: {
        ...session.results!.reportGeneration,
        researchIntelligence: undefined,
        recommendedFollowUpQuestions: [],
      },
    };

    const investigation = buildInvestigationData(session);
    expect(investigation.findings).toHaveLength(1);
    expect(investigation.conflicts).toEqual([]);
    expect(investigation.changes).toEqual([]);
  });

  it("maps open questions only to semantically relevant, non-question evidence", () => {
    const investigation = buildInvestigationData(makeSemanticMappingSession());
    const ferritin = investigation.openQuestions.find((item) => /ferritin/i.test(`${item.question} ${item.known}`));
    const bloodLoss = investigation.openQuestions.filter((item) => /blood loss/i.test(item.question));

    expect(ferritin).toBeDefined();
    expect(ferritin?.known).toMatch(/ferritin|14 ng\/mL|remains low/i);
    expect(ferritin?.relationships.map((item) => item.exactQuote).join(" ")).toMatch(/ferritin/i);
    expect(ferritin?.relationships.map((item) => item.exactQuote).join(" ")).not.toMatch(/palpitations|QTc|ambulatory/i);
    expect(ferritin?.relationships.map((item) => item.exactQuote)).not.toContain("Will ferritin normalize with oral therapy alone?");
    expect(ferritin?.relationships.every((item) =>
      ["provides_context", "identifies_missing_evidence"].includes(item.relationshipType),
    )).toBe(true);
    expect(bloodLoss).toHaveLength(1);
    expect(investigation.openQuestions.some((item) =>
      /source observation that directly|materially change the evidence-based conclusion/i.test(
        `${item.known} ${item.missingEvidence} ${item.whyItMatters}`,
      ),
    )).toBe(false);
  });

  it("identifies a concrete cross-document outcome disagreement and preserves both source positions", () => {
    const session = makeDemoSession();
    const positiveText = "AX-217 improved disease activity by 34% versus 18% for placebo.";
    const negativeText = "AX-217 did not improve disease activity versus the active comparator.";
    session.question = "Does AX-217 improve disease activity across the uploaded trials?";
    session.documents = [
      {
        ...session.documents[0],
        id: "document:placebo-trial",
        name: "Placebo_Controlled_Trial.pdf",
        text: positiveText,
        pageCount: 1,
        pages: [{ number: 1, text: positiveText, startOffset: 0, endOffset: positiveText.length }],
      },
      {
        ...session.documents[1],
        id: "document:comparator-trial",
        name: "Active_Comparator_Trial.pdf",
        text: negativeText,
        pageCount: 1,
        pages: [{ number: 1, text: negativeText, startOffset: 0, endOffset: negativeText.length }],
      },
    ];
    const facts = [
      makeFact(session, 0, "finding", positiveText, "evidence:positive"),
      makeFact(session, 1, "finding", negativeText, "evidence:negative"),
    ];
    session.evidence = facts.map((fact, index) => ({
      id: fact.evidenceId,
      chunkId: `chunk:conflict:${index}`,
      documentId: fact.documentId,
      excerpt: fact.excerpt,
      documentName: fact.documentName,
      page: 1,
      section: "Page 1",
      relevance: fact.relevance,
      contextBefore: "",
      contextAfter: "",
      matchedTerms: ["AX-217", "disease activity"],
      lexicalScore: 1 - index / 10,
      similarityScore: null,
      retrievalMethod: "lexical",
    }));
    session.results = {
      ...session.results!,
      groundedFacts: facts,
      citations: undefined,
      reportGeneration: {
        ...session.results!.reportGeneration,
        citations: undefined,
        recommendedFollowUpQuestions: [],
        researchIntelligence: undefined,
      },
    };

    const conflict = buildInvestigationData(session).conflicts.find(
      (item) => item.type === "Outcome disagreement",
    );

    expect(conflict).toBeDefined();
    expect(conflict?.documentNames).toEqual([
      "Placebo_Controlled_Trial.pdf",
      "Active_Comparator_Trial.pdf",
    ]);
    expect(conflict?.positions.map((position) => position.statement)).toEqual([
      positiveText,
      negativeText,
    ]);
    expect(conflict?.statement).toContain("Placebo_Controlled_Trial.pdf");
    expect(conflict?.statement).toContain("34%");
    expect(conflict?.statement).toContain("Active_Comparator_Trial.pdf");
    expect(conflict?.statement).toMatch(/did not improve/i);
    expect(conflict?.explanation).toMatch(/not consistent|representative/i);
    expect(conflict?.citationIds).toHaveLength(2);
  });

  it("detects proceed-versus-delay treatment recommendations as a source conflict", () => {
    const session = makeDemoSession();
    const proceedText = "The oncology review recommends starting NX-410 treatment now.";
    const delayText = "The safety review recommends delaying NX-410 treatment until liver enzymes normalize.";
    session.question = "Should NX-410 treatment begin now?";
    session.documents = [
      {
        ...session.documents[0],
        id: "document:oncology",
        name: "Oncology_Review.pdf",
        text: proceedText,
        pageCount: 1,
        pages: [{ number: 1, text: proceedText, startOffset: 0, endOffset: proceedText.length }],
      },
      {
        ...session.documents[1],
        id: "document:safety",
        name: "Safety_Review.pdf",
        text: delayText,
        pageCount: 1,
        pages: [{ number: 1, text: delayText, startOffset: 0, endOffset: delayText.length }],
      },
    ];
    const facts = [
      makeFact(session, 0, "recommendation", proceedText, "evidence:proceed"),
      makeFact(session, 1, "recommendation", delayText, "evidence:delay"),
    ];
    session.evidence = facts.map(makeEvidence);
    session.results = {
      ...session.results!,
      groundedFacts: facts,
      citations: undefined,
      reportGeneration: {
        ...session.results!.reportGeneration,
        citations: undefined,
        recommendedFollowUpQuestions: [],
        researchIntelligence: undefined,
      },
    };

    const investigation = buildInvestigationData(session);
    const conflict = investigation.conflicts.find((item) => item.type === "Recommendation disagreement");

    expect(conflict?.positions.map((position) => position.statement)).toEqual([proceedText, delayText]);
    expect(conflict?.documentNames).toEqual(["Oncology_Review.pdf", "Safety_Review.pdf"]);
    expect(conflict?.explanation).toMatch(/recommended next step|not be combined/i);
  });

  it("surfaces a treatment-benefit versus treatment-risk tradeoff across sources", () => {
    const session = makeDemoSession();
    const benefit = "Continued intravenous fluids may support stabilization during early resuscitation.";
    const risk = "Aggressive intravenous fluids may worsen volume overload and pulmonary complications.";
    session.question = "What treatment approach best balances stabilization and documented risk?";
    session.documents = [
      {
        ...session.documents[0],
        id: "document:acute-care",
        name: "Acute_Care_Note.pdf",
        text: benefit,
        pageCount: 1,
        pages: [{ number: 1, text: benefit, startOffset: 0, endOffset: benefit.length }],
      },
      {
        ...session.documents[1],
        id: "document:risk-review",
        name: "Risk_Review.pdf",
        text: risk,
        pageCount: 1,
        pages: [{ number: 1, text: risk, startOffset: 0, endOffset: risk.length }],
      },
    ];
    const facts = [
      makeFact(session, 0, "recommendation", benefit, "evidence:benefit"),
      makeFact(session, 1, "safety_observation", risk, "evidence:risk"),
    ];
    session.evidence = facts.map(makeEvidence);
    session.results = {
      ...session.results!,
      groundedFacts: facts,
      citations: undefined,
      reportGeneration: {
        ...session.results!.reportGeneration,
        citations: undefined,
        recommendedFollowUpQuestions: [],
        researchIntelligence: undefined,
      },
    };

    const conflict = buildInvestigationData(session).conflicts.find(
      (item) => item.type === "Benefit-risk tension",
    );

    expect(conflict).toBeDefined();
    expect(conflict?.documentNames).toEqual(["Acute_Care_Note.pdf", "Risk_Review.pdf"]);
    expect(conflict?.positions.map((position) => position.statement)).toEqual([benefit, risk]);
    expect(conflict?.explanation).toMatch(/competing decision priorities|risk/i);
  });

  it("merges equivalent claims even when generated theme labels differ", () => {
    const session = makeDemoSession();
    const text = "The documented syndrome remains the leading diagnosis across the reviewed record.";
    session.documents = [{
      ...session.documents[0],
      id: "document:diagnostic-review",
      name: "Diagnostic_Review.pdf",
      text,
      pageCount: 1,
      pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
    }];
    const fact = makeFact(session, 0, "finding", text, "evidence:diagnosis");
    session.evidence = [makeEvidence(fact, 0)];
    session.results = {
      ...session.results!,
      groundedFacts: [fact],
      citations: undefined,
      reportGeneration: {
        ...session.results!.reportGeneration,
        citations: undefined,
        recommendedFollowUpQuestions: [],
        researchIntelligence: {
          answerStatus: "direct",
          directAnswer: "The uploaded record supports the documented syndrome as the leading diagnosis.",
          strongestSupportedConclusion: text,
          strongestCounterpoint: "The conclusion remains limited to the uploaded record.",
          evidenceTrajectory: [],
          interactionPathways: [],
          contradictions: [],
          decisionChangingUnknowns: [],
          evidenceMappings: [],
          structuredClaims: [
            {
              id: "claim:diagnosis:one",
              conclusion: "The documented syndrome remains the leading diagnosis.",
              kind: "direct_observation",
              dimension: "context",
              theme: "Diagnostic synthesis",
              clinicalImplication: "This establishes the main interpretation that treatment priorities must address.",
              reasoningSummary: "The conclusion is directly stated in the uploaded diagnostic review.",
              evidenceIds: [fact.evidenceId],
              counterEvidenceIds: [],
              uncertainty: "The conclusion is limited to the uploaded record.",
              confidence: "high",
              priority: "primary",
            },
            {
              id: "claim:diagnosis:two",
              conclusion: "Across the record, the documented syndrome is still the leading diagnosis.",
              kind: "inference",
              dimension: "context",
              theme: "Clinical interpretation",
              clinicalImplication: "This remains the central diagnosis around which the decision should be organized.",
              reasoningSummary: "The same source-grounded diagnostic conclusion is phrased as a synthesis.",
              evidenceIds: [fact.evidenceId],
              counterEvidenceIds: [],
              uncertainty: "The conclusion is limited to the uploaded record.",
              confidence: "high",
              priority: "important",
            },
          ],
        },
      },
    };

    const findings = buildInvestigationData(session).findings.filter((item) => /leading diagnosis/i.test(item.statement));
    expect(findings).toHaveLength(1);
  });

  it("keeps an improving outcome with residual symptoms out of study limitations", () => {
    const session = makeDemoSession();
    const text = "Symptoms improved at follow-up, although mild fatigue persisted.";
    session.question = "How did symptoms change over time?";
    session.documents = [{
      ...session.documents[0],
      id: "document:follow-up-outcome",
      name: "Follow_Up_Outcome.pdf",
      text,
      pageCount: 1,
      pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
    }];
    const fact = makeFact(session, 0, "longitudinal_change", text, "evidence:follow-up-outcome");
    session.evidence = [makeEvidence(fact, 0)];
    session.results = {
      ...session.results!,
      groundedFacts: [fact],
      citations: undefined,
      reportGeneration: {
        ...session.results!.reportGeneration,
        citations: undefined,
        recommendedFollowUpQuestions: [],
        researchIntelligence: undefined,
      },
    };

    const finding = buildInvestigationData(session).findings[0];
    expect(finding.dimension).toBe("efficacy");
    expect(finding.theme).not.toBe("Study limitations");
  });

  it("supplements sparse AI claims to cover every requested multi-study dimension", () => {
    const session = makeScopedMultiStudySession();
    const investigation = buildInvestigationData(session);
    const themes = new Set(investigation.findings.map((item) => item.theme));

    expect(themes.size).toBeGreaterThanOrEqual(6);
    expect(Array.from(themes).join(" ")).toMatch(/efficacy|therapy|pain|safety|falls|durability|regulatory|dose|renal|discontinuation/i);
    expect(investigation.findings.length).toBeGreaterThanOrEqual(7);
    expect(new Set(investigation.findings.map((item) => item.statement)).size).toBe(investigation.findings.length);
    expect(investigation.findings.every((item) => item.citationIds.length > 0)).toBe(true);
    expect(investigation.findings.some((item) => /\.\.\.|\b(?:and|or|with|from|to)\s*$/i.test(item.statement))).toBe(false);

    const outcomeConflict = investigation.conflicts.find((item) => item.type === "Outcome disagreement");
    expect(outcomeConflict?.statement).toMatch(/32%|placebo/i);
    expect(outcomeConflict?.statement).toMatch(/did not meet|non-inferiority/i);
    expect(outcomeConflict?.documentNames).toHaveLength(2);

    expect(investigation.openQuestions.length).toBeGreaterThanOrEqual(3);
    expect(investigation.openQuestions.map((item) => item.question).join(" ")).toMatch(/sustained|follow-up/i);
    expect(investigation.openQuestions.map((item) => item.question).join(" ")).toMatch(/excluded|underrepresented/i);
    expect(investigation.openQuestions.map((item) => item.question).join(" ")).toMatch(/indication|dosing strategy/i);
    expect(investigation.openQuestions.every((item) =>
      item.known.length > 20 && item.missingEvidence.length > 20 && item.whyItMatters.length > 20,
    )).toBe(true);
    expect(investigation.openQuestions.some((item) =>
      /additional directly relevant|supports the reported assessment|materially change the conclusion/i.test(
        `${item.known} ${item.missingEvidence} ${item.whyItMatters}`,
      ),
    )).toBe(false);
    expect(new Set(investigation.strongestCitationIds.map((id) =>
      session.results?.citations?.find((citation) => citation.id === id)?.documentId,
    )).size).toBeGreaterThanOrEqual(3);
  });

  it("keeps a simple single-document briefing concise and non-duplicative", () => {
    const session = makeDemoSession();
    const text = "The primary endpoint improved by 18% after eight weeks of treatment.";
    session.question = "What efficacy result is reported?";
    session.documents = [{
      ...session.documents[0],
      id: "document:single",
      name: "Single_Study.pdf",
      text,
      pageCount: 1,
      pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
    }];
    const fact = makeFact(session, 0, "finding", text, "evidence:single");
    session.evidence = [makeEvidence(fact, 0)];
    session.results = {
      ...session.results!,
      groundedFacts: [fact],
      citations: undefined,
      reportGeneration: {
        ...session.results!.reportGeneration,
        citations: undefined,
        recommendedFollowUpQuestions: [],
        researchIntelligence: undefined,
      },
    };

    const investigation = buildInvestigationData(session);
    expect(investigation.findings).toHaveLength(1);
    expect(investigation.findings[0].theme).not.toBe("Study limitations");
    expect(investigation.findings[0].dimension).toBe("efficacy");
    expect(investigation.conflicts).toEqual([]);
    expect(investigation.openQuestions).toEqual([]);
    expect(investigation.strongestCitationIds).toHaveLength(1);
  });

  it("normalizes flattened result rows and removes unsafe efficacy overstatement", () => {
    expect(polishFindingStatement("Fatigue Severe, daily Moderate About 40% improved.")).toBe(
      "Fatigue improved by approximately 40% during follow-up.",
    );
    const session = makeSemanticMappingSession();
    session.results!.reportGeneration.researchIntelligence = {
      answerStatus: "direct",
      directAnswer: "The treatment regimen demonstrated significant hematologic and symptomatic efficacy.",
      strongestSupportedConclusion: "Treatment response was documented.",
      strongestCounterpoint: "Long-term response remains uncertain.",
      evidenceTrajectory: [],
      interactionPathways: [],
      contradictions: [],
      decisionChangingUnknowns: [],
      evidenceMappings: [],
    };
    const investigation = buildInvestigationData(session);
    expect(investigation.findings.some((item) => item.dimension === "efficacy")).toBe(true);
    expect(investigation.directAnswer).toMatch(/uploaded documents|increased|improved|follow-up/i);
    expect(investigation.directAnswer).not.toMatch(/significant|demonstrated efficacy/i);
  });
});

function makeScopedMultiStudySession(): ResearchSession {
  const session = makeDemoSession();
  const documentNames = [
    "Phase_II_Placebo_Trial.pdf",
    "Confirmatory_Comparator_Trial.pdf",
    "Independent_Safety_Review.pdf",
    "Regulatory_Clinical_Review.pdf",
    "Early_Access_Real_World_Report.pdf",
  ];
  const records: Array<{
    documentIndex: number;
    category: GroundedFactCategory;
    contentType: ResearchContentType;
    text: string;
  }> = [
    { documentIndex: 0, category: "efficacy", contentType: "finding", text: "The investigational therapy reduced pain score by 32% versus 18% with placebo at week 12." },
    { documentIndex: 1, category: "efficacy", contentType: "finding", text: "The confirmatory trial did not meet the prespecified non-inferiority margin versus the active comparator at week 16." },
    { documentIndex: 2, category: "safety", contentType: "safety_observation", text: "Falls occurred in 14% of adults aged 65 years or older versus 4% of younger adults." },
    { documentIndex: 3, category: "limitation", contentType: "recommendation", text: "The regulatory review recommends a restricted indication and a lower starting dose until the benefit-risk uncertainty is resolved." },
    { documentIndex: 4, category: "efficacy", contentType: "finding", text: "Real-world effectiveness was smaller than the placebo-controlled estimate and was difficult to interpret without a comparator." },
    { documentIndex: 1, category: "limitation", contentType: "limitation", text: "Long-term durability beyond 16 weeks was not established." },
    { documentIndex: 0, category: "exclusion", contentType: "limitation", text: "Adults older than 75 years and participants with severe renal impairment were excluded from the trial." },
    { documentIndex: 4, category: "limitation", contentType: "limitation", text: "Early discontinuation reached 28%, and missing outcome data were not addressed by a sensitivity analysis." },
  ];
  session.question = "Assess efficacy, safety, regulatory readiness, durability, generalizability, limitations, and age-related safety across the uploaded evidence.";
  session.documents = documentNames.map((name, documentIndex) => {
    const text = records.filter((record) => record.documentIndex === documentIndex).map((record) => record.text).join("\n");
    return {
      ...session.documents[documentIndex % session.documents.length],
      id: `document:scoped:${documentIndex}`,
      name,
      text,
      pageCount: 1,
      pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
    };
  });
  const facts: GroundedFact[] = records.map((record, index) => ({
    id: `fact:scoped:${index}`,
    category: record.category,
    contentType: record.contentType,
    text: record.text,
    evidenceId: `evidence:scoped:${index}`,
    documentId: session.documents[record.documentIndex].id,
    documentName: session.documents[record.documentIndex].name,
    page: 1,
    excerpt: record.text,
    relevance: "Direct source evidence for the multi-study review.",
  }));
  session.evidence = facts.map(makeEvidence);
  const citations: Citation[] = facts.map((fact, index) => ({
    id: `citation:scoped:${index}`,
    evidenceId: fact.evidenceId,
    chunkId: `chunk:scoped:${index}`,
    documentId: fact.documentId,
    documentName: fact.documentName,
    page: 1,
    excerpt: fact.excerpt,
    exactQuote: fact.excerpt,
    label: `[${index + 1}]`,
    supportedClaimIds: [fact.id],
  }));
  session.results = {
    ...session.results!,
    groundedFacts: facts,
    citations,
    reportGeneration: {
      ...session.results!.reportGeneration,
      citations,
      recommendedFollowUpQuestions: [],
      researchIntelligence: {
        answerStatus: "partial",
        directAnswer: "The studies show an efficacy signal, but comparator inconsistency, age-related safety findings, limited durability and generalizability, and unresolved dosing evidence do not support an unqualified broad-use conclusion.",
        strongestSupportedConclusion: "A placebo-controlled efficacy signal was observed.",
        strongestCounterpoint: "The confirmatory comparator result and evidence gaps limit the conclusion.",
        evidenceTrajectory: [],
        interactionPathways: [],
        contradictions: [],
        decisionChangingUnknowns: [],
        evidenceMappings: [],
        structuredClaims: [
          {
            id: "claim:scoped:efficacy",
            conclusion: "The placebo-controlled study reported a measurable efficacy benefit at week 12.",
            kind: "direct_observation",
            dimension: "efficacy",
            reasoningSummary: "The claim follows from the randomized placebo comparison reported in the source evidence.",
            evidenceIds: [facts[0].evidenceId],
            counterEvidenceIds: [facts[1].evidenceId],
            uncertainty: "The active-comparator study did not confirm the same treatment effect.",
            confidence: "medium",
            priority: "primary",
          },
          {
            id: "claim:scoped:safety",
            conclusion: "The safety burden was greater in older adults than in younger adults.",
            kind: "direct_observation",
            dimension: "safety",
            reasoningSummary: "The age-stratified source passage reports a higher observed fall frequency in older adults.",
            evidenceIds: [facts[2].evidenceId],
            counterEvidenceIds: [],
            uncertainty: "Exposure and follow-up by age remain incompletely characterized.",
            confidence: "high",
            priority: "important",
          },
        ],
      },
    },
  };
  return session;
}

function makeEvidence(fact: GroundedFact, index: number) {
  return {
    id: fact.evidenceId,
    chunkId: `chunk:scoped:${index}`,
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
    retrievalMethod: "lexical" as const,
  };
}

function makeAcceptanceSession(): ResearchSession {
  const session = makeDemoSession();
  const fourthDocument = {
    ...session.documents[0],
    id: "document:follow-up",
    name: "Follow_Up_Clinical_Record.pdf",
  };
  session.question = "Tell me if there are any drug interactions present within the documents.";
  session.documents = [
    { ...session.documents[0], id: "document:medication", name: "Medication_Safety_Review.pdf" },
    { ...session.documents[1], id: "document:clinical", name: "Clinical_Visit_Record.pdf" },
    { ...session.documents[2], id: "document:labs", name: "Laboratory_Results.pdf" },
    fourthDocument,
  ];

  const records: Array<{ type: ResearchContentType; text: string; excerpt?: string; documentIndex: number }> = [
    { type: "interaction_concern", text: "Hydroxychloroquine plus recent azithromycin exposure creates cumulative QT-prolongation concern.", excerpt: "Hydroxychloroquine + recent azithromycin exposure Moderate concern Both can prolong QT.", documentIndex: 0 },
    { type: "interaction_concern", text: "Hydroxychloroquine plus QTc 477 ms increases concern for QT prolongation.", excerpt: "Hydroxychloroquine + QTc 477 ms Moderate concern Electrolyte abnormalities may increase arrhythmia risk.", documentIndex: 0 },
    { type: "interaction_concern", text: "Propranolol plus orthostatic symptoms may worsen dizziness and presyncope.", documentIndex: 1 },
    { type: "interaction_concern", text: "Omeprazole plus oral iron may reduce iron absorption.", documentIndex: 1 },
    { type: "interaction_concern", text: "Ibuprofen 400 mg as needed Active Can worsen gastrointestinal blood loss and should be minimized if bleeding is suspected.", documentIndex: 2 },
    { type: "finding", text: "The medication list records omeprazole for use as needed.", documentIndex: 0 },
    { type: "discrepancy", text: "Medication records describe omeprazole as needed, whereas the clinical history reports use 5-6 days per week.", documentIndex: 1 },
    { type: "longitudinal_change", text: "QTc 477 to 449", documentIndex: 3 },
    { type: "longitudinal_change", text: "Potassium 3.6 to 4.1", documentIndex: 2 },
    { type: "longitudinal_change", text: "Magnesium 1.7 to 2.0", documentIndex: 2 },
    { type: "longitudinal_change", text: "Palpitations reduced but persisted.", documentIndex: 3 },
    { type: "unresolved_question", text: "Whether palpitations are entirely explained by anemia?", documentIndex: 1 },
    { type: "unresolved_question", text: "Whether QTc remained stable?", documentIndex: 3 },
    { type: "unresolved_question", text: "Whether gastrointestinal blood loss was excluded?", documentIndex: 2 },
    { type: "unresolved_question", text: "What is the actual omeprazole use frequency and timing?", documentIndex: 1 },
  ];
  session.documents = session.documents.map((document, documentIndex) => {
    const evidenceText = records
      .filter((record) => record.documentIndex === documentIndex)
      .map((record) => record.excerpt ?? record.text)
      .join("\n");
    const contextText = documentIndex === 2
      ? `${evidenceText}\nThe record documents anemia and heavy menstrual bleeding.`
      : evidenceText;
    return {
      ...document,
      text: contextText,
      pageCount: 1,
      pages: [{ number: 1, text: contextText, startOffset: 0, endOffset: contextText.length }],
    };
  });
  const facts = records.map((record, index) => makeFact(
    session,
    record.documentIndex,
    record.type,
    record.text,
    `evidence:acceptance:${index}`,
    record.excerpt,
  ));
  const citations: Citation[] = facts.map((fact, index) => ({
    id: `citation:acceptance:${index}`,
    evidenceId: fact.evidenceId,
    chunkId: `chunk:acceptance:${index}`,
    documentId: fact.documentId,
    documentName: fact.documentName,
    page: 1,
    excerpt: fact.excerpt,
    label: `[${index + 1}]`,
  }));

  session.results = {
    ...session.results!,
    groundedFacts: facts,
    citations,
    reportGeneration: {
      ...session.results!.reportGeneration,
      citations,
      recommendedFollowUpQuestions: [],
      researchIntelligence: {
        answerStatus: "direct",
        directAnswer: "Several medication-related concerns are documented, with cumulative QT-prolongation risk as the strongest concern, but no harmful arrhythmia or medication-caused injury is proven.",
        strongestSupportedConclusion: "Cumulative QT-prolongation risk is the highest-priority signal.",
        strongestCounterpoint: "No harmful arrhythmia or medication-caused injury is proven in the uploaded records.",
        evidenceTrajectory: [],
        interactionPathways: [],
        contradictions: [],
        decisionChangingUnknowns: [],
      },
    },
  };
  return session;
}

function makeSemanticMappingSession(): ResearchSession {
  const session = makeDemoSession();
  session.question = "Assess treatment efficacy, safety, and limitations.";
  const records: Array<{ type: ResearchContentType; text: string }> = [
    { type: "finding", text: "Baseline ferritin: 6 ng/mL." },
    { type: "limitation", text: "Follow-up ferritin: 14 ng/mL after four weeks; ferritin remains low." },
    { type: "longitudinal_change", text: "Hemoglobin increased from 8.7 to 10.4 g/dL after four weeks." },
    { type: "longitudinal_change", text: "Fatigue Severe, daily Moderate About 40% improved." },
    { type: "finding", text: "Symptoms improved but persist; ambulatory monitoring may still be useful." },
    { type: "longitudinal_change", text: "Follow-up QTc improved from 477 ms to 449 ms, but ongoing ECG surveillance may be prudent." },
    { type: "limitation", text: "Heavy menstrual bleeding persisted during follow-up." },
    { type: "limitation", text: "Gastrointestinal blood loss was not formally excluded." },
    { type: "unresolved_question", text: "Will ferritin normalize with oral therapy alone?" },
    { type: "unresolved_question", text: "Are palpitations entirely secondary to anemia?" },
    { type: "unresolved_question", text: "What is the definitive source of blood loss?" },
    { type: "unresolved_question", text: "Definitive source of blood loss?" },
  ];
  const pageText = records.map((record) => record.text).join("\n");
  session.documents = [{
    ...session.documents[0],
    id: "document:follow-up",
    name: "Follow_Up_and_Treatment_Response.pdf",
    text: pageText,
    pageCount: 1,
    pages: [{ number: 1, text: pageText, startOffset: 0, endOffset: pageText.length }],
  }];
  const facts = records.map((record, index) => makeFact(
    session,
    0,
    record.type,
    record.text,
    `evidence:semantic:${index}`,
  ));
  session.evidence = facts.map((fact, index) => ({
    id: fact.evidenceId,
    chunkId: `chunk:semantic:${index}`,
    documentId: fact.documentId,
    excerpt: fact.excerpt,
    documentName: fact.documentName,
    page: 1,
    section: "Page 1",
    relevance: fact.relevance,
    contextBefore: "",
    contextAfter: "",
    matchedTerms: [],
    lexicalScore: 1 - index / 100,
    similarityScore: null,
    retrievalMethod: "lexical",
  }));
  session.results = {
    ...session.results!,
    groundedFacts: facts,
    citations: undefined,
    reportGeneration: {
      ...session.results!.reportGeneration,
      citations: undefined,
      recommendedFollowUpQuestions: ["Definitive source of blood loss?"],
      researchIntelligence: undefined,
    },
  };
  return session;
}

function makeFact(
  session: ResearchSession,
  documentIndex: number,
  contentType: ResearchContentType,
  text: string,
  evidenceId: string,
  excerpt = text,
): GroundedFact {
  const document = session.documents[documentIndex];
  const category = contentType === "interaction_concern"
    ? "interaction"
    : contentType === "discrepancy" || contentType === "unresolved_question" || contentType === "limitation"
      ? "limitation"
      : "efficacy";
  return {
    id: `fact:${evidenceId}`,
    category,
    contentType,
    text,
    evidenceId,
    documentId: document.id,
    documentName: document.name,
    page: 1,
    excerpt,
    relevance: "Acceptance-test source evidence.",
  };
}
