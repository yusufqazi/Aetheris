import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import { chunksToEvidence } from "@/lib/embeddings";
import { assessEvidenceConfidence } from "@/lib/research/confidence";
import {
  normalizeEvidenceItems,
  normalizedEvidenceForModel,
} from "@/lib/research/evidence-normalization";
import { extractGroundedFactsFromNormalizedEvidence } from "@/lib/research/normalized-grounding";
import type {
  EvidenceItem,
  GroundedFact,
  NormalizedEvidenceBundle,
  SearchChunk,
} from "@/lib/types";

export type FallbackObserver = (reason: string) => void;

export function asEvidence(chunks: SearchChunk[]): EvidenceItem[] {
  return chunksToEvidence(
    chunks.slice(0, 4),
    "Ranked against the active research objective and preserved for source review.",
  );
}

export function groundedFactsFromChunks(chunks: SearchChunk[], question: string): GroundedFact[] {
  const evidence = chunksToEvidence(
    chunks,
    "Exact source passage selected for deterministic fact extraction.",
  );
  return extractGroundedFactsFromNormalizedEvidence(
    normalizeEvidenceItems(evidence),
    evidence,
    question,
  );
}

export function normalizedEvidenceFromChunks(chunks: SearchChunk[]): NormalizedEvidenceBundle {
  return normalizeEvidenceItems(
    chunksToEvidence(chunks, "Source passage retained for citation verification."),
  );
}

export function normalizedReasoningInput(chunks: SearchChunk[]) {
  return normalizedEvidenceForModel(normalizedEvidenceFromChunks(chunks));
}

export function hasConcreteContent(value: unknown) {
  const serialized = JSON.stringify(value);
  return /\d|%|\bp\s*[=<]|randomi[sz]ed|adverse|excluded|endpoint|follow-up|cyp|interaction|inhibitor|exposure/i.test(serialized);
}

export function confidenceFromEvidence(
  facts: GroundedFact[],
  evidence: SearchChunk[] | EvidenceItem[],
  counterEvidenceCount = 0,
) {
  return assessEvidenceConfidence({
    facts,
    evidence,
    counterEvidenceCount,
  }).level;
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
