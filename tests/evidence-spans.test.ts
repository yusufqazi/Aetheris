import { describe, expect, it } from "vitest";

import {
  createClaimCitations,
  findExactEvidenceSpan,
} from "@/lib/research/evidence-spans";
import type { EvidenceItem, GroundedFact, UploadedDocument } from "@/lib/types";

describe("exact evidence spans", () => {
  it("locates a verbatim quote while tolerating PDF whitespace differences", () => {
    const pageText = "Patient metadata\n\nIbuprofen 400 mg as needed  Active\nCan worsen gastrointestinal blood loss.\n\nOther medication row";
    const span = findExactEvidenceSpan(
      pageText,
      "Ibuprofen 400 mg as needed Active Can worsen gastrointestinal blood loss.",
    );

    expect(span).not.toBeNull();
    expect(span?.quote).toBe("Ibuprofen 400 mg as needed  Active\nCan worsen gastrointestinal blood loss.");
    expect(pageText.slice(span?.startOffset, span?.endOffset)).toBe(span?.quote);
  });

  it("creates a claim citation for the narrow fact excerpt rather than the full chunk", () => {
    const pageText = "Testing notice.\nPatient metadata.\nIbuprofen may worsen gastrointestinal blood loss.\nUnrelated medication row.";
    const document: UploadedDocument = {
      id: "document:one",
      name: "Medication_Safety_Review.pdf",
      size: pageText.length,
      pageCount: 1,
      uploadedAt: "2026-07-16T00:00:00.000Z",
      preview: pageText,
      text: pageText,
      pages: [{ number: 1, text: pageText, startOffset: 0, endOffset: pageText.length }],
    };
    const evidence: EvidenceItem = {
      id: "evidence:one",
      chunkId: "chunk:one",
      documentId: document.id,
      documentName: document.name,
      page: 1,
      excerpt: pageText,
      relevance: "Supports the medication review.",
      contextBefore: "",
      contextAfter: "",
      matchedTerms: ["ibuprofen"],
      lexicalScore: 1,
      similarityScore: null,
      retrievalMethod: "lexical",
    };
    const fact: GroundedFact = {
      id: "fact:one",
      category: "interaction",
      contentType: "interaction_concern",
      text: "Ibuprofen may increase gastrointestinal bleeding risk.",
      evidenceId: evidence.id,
      documentId: document.id,
      documentName: document.name,
      page: 1,
      excerpt: "Ibuprofen may worsen gastrointestinal blood loss.",
      relevance: "Supports the medication review.",
    };

    const citation = createClaimCitations([evidence], [fact], [document])[0];
    expect(citation.exactQuote).toBe(fact.excerpt);
    expect(citation.excerpt).not.toContain("Patient metadata");
    expect(citation.startOffset).toBe(pageText.indexOf(fact.excerpt));
    expect(citation.supportedClaimIds).toEqual([fact.id]);
  });
});
