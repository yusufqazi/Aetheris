import { describe, expect, it } from "vitest";

import { textItemsToStructuredText } from "@/lib/pdf.shared";
import {
  areEquivalentStatements,
  classifyContentType,
  extractGroundedFacts,
} from "@/lib/research/grounding";
import type { EvidenceItem } from "@/lib/types";

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
