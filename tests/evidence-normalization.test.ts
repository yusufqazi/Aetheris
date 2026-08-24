import { describe, expect, it } from "vitest";

import {
  containsNonEvidenceText,
  normalizeEvidenceItems,
  normalizedEvidenceForModel,
} from "@/lib/research/evidence-normalization";
import { extractGroundedFactsFromNormalizedEvidence } from "@/lib/research/normalized-grounding";
import type { EvidenceItem } from "@/lib/types";

describe("evidence normalization", () => {
  it("separates headings and removes identifiers, notices, titles, and workflow language", () => {
    const source = evidence([
      "Independent Safety Monitoring Committee Memorandum",
      "Patient: Elena Marisol Vega MRN SYN-774219",
      "Study Date: 2026-07-29",
      "Synthetic test document for demonstration purposes.",
      "Supports Aetheris testing: extraction, contradiction detection, longitudinal reasoning, and source citation.",
      "PROGRAM CONCLUSION",
      "The report supports real-world symptom improvement in some participants.",
      "LIMITATIONS",
      "There was no randomized comparator, and outcome collection was incomplete.",
      "RECOMMENDATIONS",
      "The protocol should use stronger fall-risk precautions in older adults.",
    ].join("\n"));

    const normalized = normalizeEvidenceItems([source]);
    const serialized = JSON.stringify(normalizedEvidenceForModel(normalized));

    expect(normalized.sections.map((section) => section.heading)).toEqual([
      "Program Conclusion",
      "Limitations",
      "Recommendations",
    ]);
    expect(normalized.objects.map((item) => item.kind)).toEqual([
      "observation",
      "limitation",
      "recommendation",
    ]);
    expect(serialized).not.toMatch(
      /Elena|MRN|2026-07-29|Synthetic|Memorandum|extraction|contradiction detection|longitudinal reasoning|source citation/i,
    );
    expect(normalized.objects.every((item) => !containsNonEvidenceText(item.statement))).toBe(true);
  });

  it("converts delimited table rows into separate structured facts while preserving values", () => {
    const normalized = normalizeEvidenceItems([evidence([
      "Observed Outcomes",
      "Outcome | Observed Result",
      "Average pain-score change | -1.9 points",
      "At least 30% pain reduction | 44% of participants with follow-up data",
      "Falls requiring medical evaluation | 5.1% overall; 9.4% in adults >=70 years",
    ].join("\n"))]);

    expect(normalized.objects).toHaveLength(3);
    expect(normalized.objects.every((item) => item.kind === "table_fact")).toBe(true);
    expect(normalized.objects.map((item) => item.numericValues)).toEqual([
      ["-1.9 points"],
      ["30%", "44%"],
      ["5.1%", "9.4%", ">=70 years"],
    ]);
    expect(normalized.objects[2].table).toEqual({
      label: "Falls requiring medical evaluation",
      values: ["5.1% overall; 9.4% in adults >=70 years"],
    });
  });

  it("splits flattened table extraction into concise facts instead of one concatenated passage", () => {
    const normalized = normalizeEvidenceItems([evidence(
      "Observed Outcomes Outcome Observed Result Average pain-score change -1.9 points " +
      "At least 30% pain reduction 44% of patients with follow-up data " +
      "Treatment discontinuation 18% Discontinuation due to dizziness or somnolence 7% " +
      "Falls requiring medical evaluation 5.1% overall; 9.4% in adults >=70 years " +
      "Emergency visits for confusion 2.3%.",
    )]);

    expect(normalized.objects.length).toBeGreaterThanOrEqual(5);
    expect(normalized.objects.every((item) => item.kind === "table_fact")).toBe(true);
    expect(normalized.objects.every((item) => item.statement.length < 180)).toBe(true);
    expect(normalized.objects.some((item) => item.numericValues.includes("-1.9 points"))).toBe(true);
    expect(normalized.objects.some((item) => item.numericValues.includes("44%"))).toBe(true);
    expect(normalized.objects.some((item) => item.numericValues.includes("9.4%"))).toBe(true);
  });

  it("keeps the original source separately while citations anchor to the exact supporting row", () => {
    const source = evidence([
      "Safety Results",
      "Patient: Elena Vega MRN SYN-774219",
      "Falls requiring medical evaluation | 5.1% overall",
    ].join("\n"));
    const normalized = normalizeEvidenceItems([source]);
    const facts = extractGroundedFactsFromNormalizedEvidence(
      normalized,
      [source],
      "What safety findings were reported?",
    );

    expect(facts).toHaveLength(1);
    expect(facts[0].text).toBe("The reported value for falls requiring medical evaluation was 5.1% overall.");
    expect(facts[0].evidenceId).toBe(source.id);
    expect(source.excerpt).toContain("MRN SYN-774219");
    expect(facts[0].excerpt).toBe("Falls requiring medical evaluation | 5.1% overall");
    expect(facts[0].text).not.toMatch(/MRN|Elena/);
  });

  it("removes repeated page furniture without removing page-specific evidence", () => {
    const normalized = normalizeEvidenceItems([
      evidence([
        "CONFIDENTIAL CLINICAL RESEARCH PROGRAM",
        "Hemoglobin decreased to 8.7 g/dL.",
        "Internal review copy",
      ].join("\n"), { id: "evidence:page-1", page: 1 }),
      evidence([
        "CONFIDENTIAL CLINICAL RESEARCH PROGRAM",
        "Hemoglobin improved to 10.4 g/dL after treatment.",
        "Internal review copy",
      ].join("\n"), { id: "evidence:page-2", page: 2 }),
    ]);

    expect(normalized.objects.map((item) => item.statement)).toEqual([
      "Hemoglobin decreased to 8.7 g/dL.",
      "Hemoglobin improved to 10.4 g/dL after treatment.",
    ]);
    expect(normalized.sections).toEqual([]);
  });

  it("drops a testing sentence without discarding neighboring clinical evidence", () => {
    const normalized = normalizeEvidenceItems([evidence(
      "Synthetic test document used to validate contradiction detection. " +
      "Falls occurred in 9.4% of adults aged 70 years or older.",
    )]);

    expect(normalized.objects.map((item) => item.statement)).toEqual([
      "Falls occurred in 9.4% of adults aged 70 years or older.",
    ]);
  });
});

function evidence(
  excerpt: string,
  overrides: Partial<Pick<EvidenceItem, "id" | "chunkId" | "documentId" | "documentName" | "page">> = {},
): EvidenceItem {
  return {
    id: overrides.id ?? "evidence:normalization",
    chunkId: overrides.chunkId ?? `chunk:${overrides.id ?? "normalization"}`,
    documentId: overrides.documentId ?? "document:normalization",
    documentName: overrides.documentName ?? "Independent Safety Monitoring Committee Memorandum.pdf",
    page: overrides.page ?? 1,
    excerpt,
    relevance: "Relevant to the active question.",
    contextBefore: "",
    contextAfter: "",
    matchedTerms: [],
    lexicalScore: 1,
    similarityScore: null,
    retrievalMethod: "lexical",
    startOffset: 0,
    endOffset: excerpt.length,
  };
}
