import { describe, expect, it } from "vitest";

import {
  cleanSearchChunks,
  cleanSourcePassage,
} from "@/lib/research/source-cleaning";
import type { SearchChunk } from "@/lib/types";

describe("source passage cleaning", () => {
  it("removes headers, page markers, identifiers, metadata, and synthetic notices", () => {
    const cleaned = cleanSourcePassage([
      "CLINICAL CONSULTATION",
      "Patient: Example Person",
      "MRN: 123456",
      "Document date: 2026-07-24",
      "Page 1 of 3",
      "Synthetic test document for demonstration purposes only.",
      "The assessment supports septic shock as the leading diagnosis.",
      "Broad-spectrum antibiotics should begin immediately.",
      "CONFIDENTIAL",
    ].join("\n"));

    expect(cleaned).toBe([
      "The assessment supports septic shock as the leading diagnosis.",
      "Broad-spectrum antibiotics should begin immediately.",
    ].join("\n"));
  });

  it("removes recurring page furniture before indexing while retaining source offsets", () => {
    const chunks = [
      chunk("one", 1, "Clinical Research Report\nHemoglobin was 8.7 g/dL."),
      chunk("two", 2, "Clinical Research Report\nFerritin was 6 ng/mL."),
    ];

    const cleaned = cleanSearchChunks(chunks);

    expect(cleaned.map((item) => item.text)).toEqual([
      "Hemoglobin was 8.7 g/dL.",
      "Ferritin was 6 ng/mL.",
    ]);
    expect(cleaned.map((item) => [item.startOffset, item.endOffset])).toEqual([
      [0, chunks[0].text.length],
      [0, chunks[1].text.length],
    ]);
  });
});

function chunk(id: string, page: number, text: string): SearchChunk {
  return {
    id,
    documentId: "document",
    documentName: "record.pdf",
    page,
    text,
    score: 0,
    startOffset: 0,
    endOffset: text.length,
    contextBefore: "",
    contextAfter: "",
    matchedTerms: [],
    lexicalScore: 0,
    similarityScore: null,
    rank: null,
    retrievalMethod: "lexical",
  };
}
