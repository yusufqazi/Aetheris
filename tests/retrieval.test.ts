import { afterEach, describe, expect, it } from "vitest";

import {
  buildEvidenceIndex,
  rankEvidenceChunks,
  retrieveFromIndex,
} from "@/lib/embeddings";
import { chunkDocument } from "@/lib/pdf.shared";
import { describePdfExtractionError, extractPdfDocument } from "@/lib/pdf";
import type { SearchChunk, UploadedDocument } from "@/lib/types";

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

describe("source anchoring and retrieval", () => {
  it("creates stable page-addressed chunks with exact source offsets", () => {
    const document = makeDocument();
    const chunks = chunkDocument(document, 92, 18);

    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      const page = document.pages.find((item) => item.number === chunk.page);
      expect(page).toBeDefined();
      expect(page?.text.slice(chunk.startOffset, chunk.endOffset).trim()).toBe(chunk.text);
      expect(chunk.id).toContain(`${document.id}:p${chunk.page}:`);
    }
  });

  it("uses deterministic lexical retrieval when embeddings are unavailable", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const document = makeDocument();
    const index = await buildEvidenceIndex([document]);
    const result = await retrieveFromIndex(index, "CYP3A4 inhibitor exposure interaction", 3);

    expect(index.method).toBe("lexical");
    expect(result.method).toBe("lexical");
    expect(result.chunks[0].text).toContain("CYP3A4");
    expect(result.chunks[0].rank).toBe(1);
    expect(result.chunks[0].matchedTerms).toEqual(
      expect.arrayContaining(["cyp3a4", "inhibitor", "exposure"]),
    );
  });

  it("ranks vector-aligned evidence ahead of orthogonal evidence", () => {
    const chunks = [
      makeChunk("aligned", "Relevant safety passage", [1, 0]),
      makeChunk("orthogonal", "Relevant safety passage", [0, 1]),
    ];
    const ranked = rankEvidenceChunks(chunks, "safety passage", [1, 0], 2);

    expect(ranked.map((chunk) => chunk.id)).toEqual(["aligned", "orthogonal"]);
    expect(ranked[0].similarityScore).toBeGreaterThan(ranked[1].similarityScore ?? 0);
    expect(ranked.every((chunk) => chunk.retrievalMethod === "embedding")).toBe(true);
  });

  it("explains common PDF failures instead of returning one generic error", async () => {
    expect(describePdfExtractionError(new Error("PasswordException: Password required"), "locked.pdf"))
      .toMatchObject({ code: "PDF_PASSWORD_REQUIRED" });
    expect(describePdfExtractionError(new Error("InvalidPDFException: Invalid PDF"), "damaged.pdf"))
      .toMatchObject({ code: "PDF_INVALID" });

    const invalidFile = new File(["not a PDF"], "not-a-pdf.pdf", { type: "application/pdf" });
    await expect(extractPdfDocument(invalidFile)).rejects.toMatchObject({
      failure: { code: "PDF_INVALID" },
    });
  });
});

function makeDocument(): UploadedDocument {
  const first =
    "A randomized trial reported nausea and fatigue. The population was narrow and follow-up was limited. Additional monitoring was recommended.";
  const second =
    "Strong CYP3A4 inhibitor use may increase systemic exposure. Interaction severity remains uncertain because the pharmacokinetic subgroup was small.";
  return {
    id: "source-document",
    name: "source.pdf",
    size: first.length + second.length,
    pageCount: 2,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    preview: first,
    text: `${first}\n\n${second}`,
    pages: [
      { number: 1, text: first, startOffset: 0, endOffset: first.length },
      {
        number: 2,
        text: second,
        startOffset: first.length + 2,
        endOffset: first.length + 2 + second.length,
      },
    ],
  };
}

function makeChunk(id: string, text: string, embedding: number[]) {
  return {
    id,
    documentId: "vector-document",
    documentName: "vector.pdf",
    page: 1,
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
    retrievalMethod: "lexical" as const,
    embedding,
  } satisfies SearchChunk & { embedding: number[] };
}
