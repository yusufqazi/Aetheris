import { describe, expect, it } from "vitest";

import { rankEvidenceChunks } from "@/lib/embeddings";
import type { SearchChunk } from "@/lib/types";

describe("evidence ranking", () => {
  it("covers a multi-part question before admitting near-duplicate passages", () => {
    const chunks = [
      makeChunk("qt-1", "Hydroxychloroquine and azithromycin create cumulative QT-prolongation risk."),
      makeChunk("qt-2", "QTc 477 ms increased the documented QT-prolongation concern."),
      makeChunk("qt-3", "Follow-up QTc remained relevant to arrhythmia safety review."),
      makeChunk("efficacy", "Treatment efficacy was supported by a 34% outcome improvement."),
      makeChunk("limitation", "The study limitation was short follow-up and excluded populations."),
      makeChunk("response", "Quality-of-life outcomes improved by 22% during treatment."),
    ];

    const ranked = rankEvidenceChunks(
      chunks,
      "Assess efficacy, safety, and limitations.",
      null,
      4,
    );
    const firstThree = ranked.slice(0, 3).map((chunk) => chunk.text).join(" ");

    expect(firstThree).toMatch(/efficacy|outcome improvement/i);
    expect(firstThree).toMatch(/QT|arrhythmia/i);
    expect(firstThree).toMatch(/limitation|excluded/i);
    expect(new Set(ranked.map((chunk) => chunk.id)).size).toBe(ranked.length);
    expect(ranked.filter((chunk) => /QT|arrhythmia/i.test(chunk.text)).length).toBeLessThan(ranked.length);
  });

  it("prioritizes direct diagnostic, objective, treatment, and pending-result evidence", () => {
    const chunks = [
      makeChunk("summary", "The consultation reviewed the history and discussed several general considerations."),
      makeChunk("diagnosis", "The diagnostic assessment strongly supports the leading autoimmune diagnosis."),
      makeChunk("objective", "Antibody testing was positive and complement measurements were low."),
      makeChunk("treatment", "Long-term therapy should be deferred until tissue classification is available."),
      makeChunk("gap", "Tissue classification and quantitative organ assessment remain pending."),
    ];

    const ranked = rankEvidenceChunks(
      chunks,
      "Determine the diagnosis, objective support, treatment decision, and remaining uncertainty.",
      null,
      4,
    );
    const selected = ranked.map((chunk) => chunk.id);

    expect(selected).toEqual(expect.arrayContaining(["diagnosis", "objective", "treatment", "gap"]));
    expect(selected).not.toContain("summary");
  });
});

function makeChunk(id: string, text: string): SearchChunk {
  return {
    id,
    documentId: `document:${id}`,
    documentName: `${id}.pdf`,
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
    retrievalMethod: "lexical",
  };
}
