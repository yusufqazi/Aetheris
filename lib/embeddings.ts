import type { SearchChunk, UploadedDocument } from "@/lib/types";
import { chunkDocument } from "@/lib/pdf";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "from",
  "this",
  "into",
  "were",
  "have",
  "across",
  "these",
  "their",
  "about",
]);

function tokenize(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function keywordScore(query: string, text: string) {
  const queryTokens = tokenize(query);
  const textLower = text.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (textLower.includes(token)) {
      score += token.length > 6 ? 3 : 2;
    }
  }

  return score;
}

export function retrieveRelevantChunks(
  documents: UploadedDocument[],
  query: string,
  limit = 8,
) {
  const chunks = documents.flatMap((document) => chunkDocument(document));

  return chunks
    .map((chunk) => ({
      ...chunk,
      score: keywordScore(query, chunk.text),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function summarizeChunkCoverage(chunks: SearchChunk[]) {
  return chunks.map((chunk) => ({
    documentName: chunk.documentName,
    page: chunk.page,
    excerpt: chunk.text.slice(0, 240),
  }));
}
