import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import { chunksToEvidence } from "@/lib/embeddings";
import { extractGroundedFacts } from "@/lib/research/grounding";
import type { EvidenceItem, GroundedFact, SearchChunk } from "@/lib/types";

export type FallbackObserver = (reason: string) => void;

export function asEvidence(chunks: SearchChunk[]): EvidenceItem[] {
  return chunksToEvidence(
    chunks.slice(0, 4),
    "Ranked against the active research objective and preserved for source review.",
  );
}

export function groundedFactsFromChunks(chunks: SearchChunk[], question: string): GroundedFact[] {
  return extractGroundedFacts(
    chunksToEvidence(chunks, "Exact source passage selected for deterministic fact extraction."),
    question,
  );
}

export function hasConcreteContent(value: unknown) {
  const serialized = JSON.stringify(value);
  return /\d|%|\bp\s*[=<]|randomi[sz]ed|adverse|excluded|endpoint|follow-up|cyp|interaction|inhibitor|exposure/i.test(serialized);
}

export function confidenceFromEvidence(factCount: number, evidenceCount: number) {
  if (factCount >= 4 && evidenceCount >= 2) return "high" as const;
  if (factCount >= 1 && evidenceCount >= 1) return "medium" as const;
  return "low" as const;
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
