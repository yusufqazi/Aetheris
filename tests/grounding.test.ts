import { describe, expect, it } from "vitest";

import { textItemsToStructuredText } from "@/lib/pdf.shared";
import {
  areEquivalentStatements,
  assessPrimaryAnswerEvidence,
  buildBestSupportedAnswer,
  buildGroundedReport,
  classifyContentType,
  extractGroundedFacts,
  isIncompletePrimaryAnswer,
} from "@/lib/research/grounding";
import type { EvidenceItem, GroundedFact } from "@/lib/types";

describe("research content normalization", () => {
  it.each([
    ["Whether QTc remained stable after the 449 ms measurement?", "unresolved_question"],
    ["Recommendation: Repeat the ECG after electrolyte correction.", "recommendation"],
    ["Plan: Monitor QTc and review concurrent therapy.", "recommendation"],
    ["Documentation discrepancy: one record says as needed, while another records use 5-6 days per week.", "discrepancy"],
    ["QTc improved from 477 ms to 449 ms at follow-up.", "longitudinal_change"],
  ] as const)("classifies %s", (statement, expected) => {
    expect(classifyContentType(statement)).toBe(expected);
  });

  it("removes structural table labels without promoting the header to a conclusion", () => {
    const facts = extractGroundedFacts([
      evidence([
        "Medication Combination Concern Rationale",
        "Finding: Therapy A + Therapy B Moderate concern Both therapies may prolong QT.",
      ].join("\n")),
    ], "Are medication interactions documented?");

    expect(facts).toHaveLength(1);
    expect(facts[0].text).toBe("Therapy A + Therapy B: Moderate concern. Both therapies may prolong QT.");
    expect(facts[0].contentType).toBe("interaction_concern");
  });

  it("deduplicates overlapping labeled fragments but preserves materially different values", () => {
    expect(areEquivalentStatements(
      "Finding: QTc improved from 477 ms to 449 ms after treatment review.",
      "QTc improved from 477 ms to 449 ms after treatment review and correction.",
    )).toBe(true);
    expect(areEquivalentStatements(
      "QTc improved from 477 ms to 449 ms.",
      "QTc improved from 477 ms to 459 ms.",
    )).toBe(false);
    expect(areEquivalentStatements(
      "Septic shock remains the leading diagnosis.",
      "Septic shock remains the leading diagnosis based on hypotension and elevated lactate.",
    )).toBe(true);
  });

  it("preserves the source excerpt while cleaning only the display statement", () => {
    const raw = "Finding: Hemoglobin was 8.7 g/dL after follow-up.";
    const facts = extractGroundedFacts([evidence(raw)], "What did follow-up show?");

    expect(facts[0].excerpt).toBe(raw);
    expect(facts[0].text).toBe("Hemoglobin was 8.7 g/dL after follow-up.");
  });

  it("preserves PDF item line and block boundaries in reading order", () => {
    const text = textItemsToStructuredText([
      { str: "Medication", transform: [1, 0, 0, 10, 10, 700] },
      { str: "Concern", hasEOL: true, transform: [1, 0, 0, 10, 90, 700] },
      { str: "Therapy A + Therapy B", transform: [1, 0, 0, 10, 10, 682] },
      { str: "Moderate", transform: [1, 0, 0, 10, 220, 682] },
      { str: "Follow-up", transform: [1, 0, 0, 10, 10, 650] },
    ]);

    expect(text).toBe("Medication Concern\n\nTherapy A + Therapy B Moderate\n\nFollow-up");
  });

  it("conservatively groups a medication table row before classifying its safety statement", () => {
    const facts = extractGroundedFacts([evidence([
      "Ibuprofen 400 mg as needed",
      "Active",
      "Can worsen gastrointestinal blood loss and should be minimized if bleeding is suspected.",
    ].join("\n"))], "Are medication interactions documented?");

    expect(facts).toHaveLength(1);
    expect(facts[0].contentType).toBe("interaction_concern");
    expect(facts[0].excerpt).toContain("Ibuprofen 400 mg as needed Active Can worsen gastrointestinal blood loss");
  });

  it("keeps truncated extraction fragments out of polished findings", () => {
    const facts = extractGroundedFacts([evidence([
      "The second concern is that frequent...",
      "Hemoglobin increased from 8.7 g/dL to 10.4 g/dL after four weeks.",
    ].join("\n"))], "Assess efficacy and limitations.");

    expect(facts.map((fact) => fact.text)).toEqual([
      "Hemoglobin increased from 8.7 g/dL to 10.4 g/dL after four weeks.",
    ]);
  });

  it("reassembles visual PDF line wraps before extracting a complete fact", () => {
    const facts = extractGroundedFacts([evidence([
      "The diagnostic assessment strongly supports the documented autoimmune syndrome based on",
      "the clinical presentation, antibody findings, and low complement measurements.",
    ].join("\n"))], "What diagnosis is best supported and why?");

    expect(facts).toHaveLength(1);
    expect(facts[0].text).toContain("based on the clinical presentation");
    expect(facts[0].text).toMatch(/measurements\.$/);
  });

  it("rejects a clipped source clause even when it contains diagnostic language", () => {
    const item = evidence("The diagnostic assessment strongly supports an autoimmune syndrome based on the");
    item.contextAfter = " antibody findings documented later on the page.";

    expect(extractGroundedFacts([item], "What diagnosis is supported?")).toEqual([]);
  });

  it("retains clinically meaningful laboratory and treatment changes", () => {
    const facts = extractGroundedFacts([evidence([
      "CRP decreased from 18 mg/L to 6 mg/L at follow-up.",
      "At the subsequent visit, treatment was held because toxicity worsened.",
    ].join("\n"))], "How did biomarkers, safety, and treatment change over time?");

    expect(facts.map((fact) => fact.text)).toEqual([
      "CRP decreased from 18 mg/L to 6 mg/L at follow-up.",
      "At the subsequent visit, treatment was held because toxicity worsened.",
    ]);
    expect(facts.map((fact) => fact.contentType)).toEqual([
      "longitudinal_change",
      "longitudinal_change",
    ]);
    expect(facts[1].category).toBe("safety");
  });

  it("retains imperative and progressive clinical decisions for conflict analysis", () => {
    const facts = extractGroundedFacts([evidence([
      "Continue cautious fluid resuscitation while initiating norepinephrine if hypotension persists.",
      "Favor early vasopressor support rather than repeated large fluid boluses.",
    ].join("\n"))], "How should immediate treatment balance benefit and risk?");

    expect(facts.map((fact) => fact.contentType)).toEqual([
      "recommendation",
      "recommendation",
    ]);
  });

  it("builds a qualified decision synthesis instead of giving up when uncertainty remains", () => {
    const statements: Array<Pick<GroundedFact, "text" | "contentType" | "category">> = [
      {
        text: "The documented acute syndrome remains the leading diagnosis.",
        contentType: "finding",
        category: "context",
      },
      {
        text: "Broad-spectrum antimicrobial therapy should begin immediately.",
        contentType: "recommendation",
        category: "context",
      },
      {
        text: "Early vasopressor support is recommended when perfusion remains inadequate.",
        contentType: "recommendation",
        category: "context",
      },
      {
        text: "Aggressive fluid administration may worsen volume overload and pulmonary complications.",
        contentType: "safety_observation",
        category: "safety",
      },
      {
        text: "The source-control requirement remains unresolved pending definitive imaging.",
        contentType: "limitation",
        category: "limitation",
      },
    ];
    const evidenceItems = statements.map((statement, index) => ({
      ...evidence(statement.text),
      id: `evidence:synthesis:${index}`,
      chunkId: `chunk:synthesis:${index}`,
      documentId: `document:synthesis:${index}`,
      documentName: `Source_${index + 1}.pdf`,
    }));
    const facts: GroundedFact[] = statements.map((statement, index) => ({
      id: `fact:synthesis:${index}`,
      ...statement,
      evidenceId: evidenceItems[index].id,
      documentId: evidenceItems[index].documentId,
      documentName: evidenceItems[index].documentName,
      page: 1,
      excerpt: statement.text,
      relevance: "Directly relevant to the requested decision synthesis.",
    }));

    const report = buildGroundedReport({
      question: "What is the leading diagnosis, which treatment priorities should be followed, what risks constrain treatment, and what remains uncertain?",
      facts,
      evidence: evidenceItems,
    });

    expect(report.executiveSummary).not.toMatch(/do not establish|not enough|incomplete answer/i);
    expect(report.executiveSummary).toMatch(/antimicrobial/i);
    expect(report.executiveSummary).toMatch(/leading diagnosis/i);
    expect(report.executiveSummary).toMatch(/vasopressor/i);
    expect(report.executiveSummary).toMatch(/fluid|volume overload|pulmonary/i);
    expect(report.executiveSummary).toMatch(/source-control|imaging|unresolved/i);
    expect(report.executiveSummary).toMatch(/^The evidence most strongly supports/i);
    expect(report.executiveSummary).toMatch(/Management should prioritize/i);
    expect(report.executiveSummary).toMatch(/main constraint|central tradeoff/i);
    expect(report.executiveSummary).toMatch(/decision still depends/i);
    expect(report.executiveSummary).not.toMatch(/Treatment priority:|Key tradeoff:|Remaining evidence:/i);
    expect(report.executiveSummary).not.toContain("\n");
    for (const statement of statements) {
      expect(report.executiveSummary).not.toContain(statement.text);
    }
    expect(report.executiveSummary.split(/\s+/).length).toBeLessThan(130);
  });

  it("preserves the strongest supported conclusion when one requested detail remains unresolved", () => {
    const statements: Array<Pick<GroundedFact, "text" | "contentType" | "category">> = [
      {
        text: "Systemic lupus erythematosus is the leading diagnosis based on positive ANA, elevated anti-dsDNA, and low complement levels.",
        contentType: "finding",
        category: "context",
      },
      {
        text: "Proteinuria and microscopic hematuria raise concern for renal involvement.",
        contentType: "finding",
        category: "context",
      },
      {
        text: "Long-term immunosuppressive therapy should be deferred until kidney biopsy and urine protein quantification are completed.",
        contentType: "recommendation",
        category: "context",
      },
      {
        text: "The class and severity of renal involvement remain uncertain pending kidney biopsy.",
        contentType: "limitation",
        category: "limitation",
      },
    ];
    const facts = statements.map((statement, index) => ({
      id: `fact:qualified:${index}`,
      ...statement,
      evidenceId: `evidence:qualified:${index}`,
      documentId: `document:qualified:${index}`,
      documentName: `Qualified_Source_${index + 1}.pdf`,
      page: 1,
      excerpt: statement.text,
      relevance: "Supports the qualified synthesis.",
    }));

    const answer = buildBestSupportedAnswer(
      "What diagnosis is best supported, is there renal involvement, when should treatment begin, and what remains uncertain?",
      facts,
    );

    expect(answer).toMatch(/systemic lupus erythematosus/i);
    expect(answer).toMatch(/renal|proteinuria|hematuria/i);
    expect(answer).toMatch(/defer|biopsy|quantification/i);
    expect(answer).toMatch(/uncertain|depends on|biopsy/i);
    expect(isIncompletePrimaryAnswer(answer)).toBe(false);
    expect(isIncompletePrimaryAnswer(
      "The uploaded documents do not establish a complete answer to the research question.",
    )).toBe(true);
  });

  it("answers only supported parts when the current evidence is sparse", () => {
    const facts: GroundedFact[] = [
      {
        id: "fact:limited:efficacy",
        text: "Hemoglobin improved from 8.7 g/dL to 10.4 g/dL after treatment.",
        contentType: "longitudinal_change",
        category: "efficacy",
        evidenceId: "evidence:limited:efficacy",
        documentId: "document:limited",
        documentName: "Limited_Source.pdf",
        page: 1,
        excerpt: "Hemoglobin improved from 8.7 g/dL to 10.4 g/dL after treatment.",
        relevance: "Directly documents the observed response.",
      },
      {
        id: "fact:limited:metadata",
        text: "Document purpose: This report summarizes treatment response for review.",
        contentType: "finding",
        category: "context",
        evidenceId: "evidence:limited:metadata",
        documentId: "document:limited",
        documentName: "Limited_Source.pdf",
        page: 1,
        excerpt: "Document purpose: This report summarizes treatment response for review.",
        relevance: "Document metadata.",
      },
    ];
    const question = "Summarize efficacy, safety, and important limitations.";
    const coverage = assessPrimaryAnswerEvidence(question, facts);
    const answer = buildBestSupportedAnswer(question, facts);

    expect(coverage.evidenceLimited).toBe(true);
    expect(coverage.supportedParts).toEqual(["efficacy"]);
    expect(coverage.unsupportedParts).toEqual(["safety", "limitations"]);
    expect(answer).toMatch(/hemoglobin improved from 8\.7 g\/dL to 10\.4 g\/dL/i);
    expect(answer).toMatch(/safety profile.*limitations.*cannot be determined/i);
    expect(answer).not.toMatch(/document purpose|summarizes treatment response|review/i);
  });

  it("does not promote metadata and table labels into a low-context answer", () => {
    const metadataFacts: GroundedFact[] = [
      {
        id: "fact:metadata:purpose",
        text: "This document summarizes the available clinical information.",
        contentType: "finding",
        category: "context",
        evidenceId: "evidence:metadata:purpose",
        documentId: "document:metadata",
        documentName: "Metadata.pdf",
        page: 1,
        excerpt: "This document summarizes the available clinical information.",
        relevance: "Document-purpose text.",
      },
      {
        id: "fact:metadata:table",
        text: "Measure Result Value Status",
        contentType: "evidence_excerpt",
        category: "context",
        evidenceId: "evidence:metadata:table",
        documentId: "document:metadata",
        documentName: "Metadata.pdf",
        page: 1,
        excerpt: "Measure Result Value Status",
        relevance: "Table header.",
      },
    ];

    const answer = buildBestSupportedAnswer(
      "What is the diagnosis and which treatment should be prioritized?",
      metadataFacts,
    );

    expect(answer).toMatch(/diagnosis or cause.*treatment priority.*cannot be determined/i);
    expect(answer).not.toMatch(/document summarizes|measure result|value status|metadata/i);
  });
});

function evidence(excerpt: string): EvidenceItem {
  return {
    id: "evidence:test",
    chunkId: "chunk:test",
    documentId: "document:test",
    documentName: "Clinical record.pdf",
    page: 1,
    excerpt,
    relevance: "Relevant to the active question.",
    contextBefore: "",
    contextAfter: "",
    matchedTerms: [],
    lexicalScore: 1,
    similarityScore: null,
    retrievalMethod: "lexical",
  };
}
