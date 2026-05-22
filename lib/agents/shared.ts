import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import type { EvidenceItem, SearchChunk } from "@/lib/types";

export function asEvidence(chunks: SearchChunk[]): EvidenceItem[] {
  return chunks.slice(0, 4).map((chunk) => ({
    excerpt: chunk.text.slice(0, 220),
    documentName: chunk.documentName,
    page: chunk.page,
    section: chunk.page ? `Page ${chunk.page}` : null,
    relevance: "Matched against the active research question using chunk relevance scoring.",
  }));
}

export function pickSentences(text: string, count = 2) {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, count)
    .join(" ");
}

export function defaultWarnings() {
  return [RESEARCH_DISCLAIMER];
}
