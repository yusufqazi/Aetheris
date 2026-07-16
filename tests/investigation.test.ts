import { describe, expect, it } from "vitest";

import { makeDemoSession } from "@/lib/demo-data";
import { buildInvestigationData, polishFindingStatement } from "@/lib/research/investigation";
import type {
  Citation,
  GroundedFact,
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
    expect(investigation.findings.map((item) => item.statement)).toEqual([
      "Potential cumulative QT-prolongation concern involving Hydroxychloroquine, recent azithromycin exposure, and QTc 477 ms.",
      "Ibuprofen may increase gastrointestinal bleeding risk and should be reviewed in the context of anemia and heavy menstrual bleeding.",
      "Propranolol plus orthostatic symptoms may worsen dizziness and presyncope.",
      "Omeprazole plus oral iron may reduce iron absorption.",
    ]);
    expect(investigation.findings.map((item) => item.priority)).toEqual([
      "Primary finding",
      "Important finding",
      "Important finding",
      "Important finding",
    ]);
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
    expect(investigation.openQuestions.map((item) => item.question)).toEqual([
      "Are palpitations entirely secondary to anemia?",
      "Did the QTc remain stable after the documented changes?",
      "What is the definitive source of blood loss?",
      "What is the actual omeprazole use frequency and timing?",
    ]);

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
    const ferritin = investigation.openQuestions.find((item) => item.id === "question:ferritin");
    const bloodLoss = investigation.openQuestions.filter((item) => item.id === "question:blood-loss");

    expect(ferritin).toBeDefined();
    expect(ferritin?.known).toBe(
      "Ferritin increased from 6 ng/mL to 14 ng/mL after four weeks of treatment but remained below the reference range.",
    );
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
    expect(investigation.directAnswer).toBe(
      "The modified regimen was followed by meaningful hematologic and symptomatic improvement over four weeks.",
    );
    expect(investigation.directAnswer).not.toMatch(/significant|demonstrated efficacy/i);
  });
});

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
    page: index % 3 + 1,
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
