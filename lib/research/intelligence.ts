import type { EvidenceItem, ResearchIntelligence } from "@/lib/types";

export function sanitizeResearchIntelligence(
  intelligence: ResearchIntelligence | undefined,
  evidence: EvidenceItem[],
) {
  if (!intelligence) return undefined;
  const validEvidenceIds = new Set(evidence.flatMap((item) => [item.id, item.chunkId]));
  const keepIds = (ids: string[]) => Array.from(new Set(ids.filter((id) => validEvidenceIds.has(id))));

  const evidenceTrajectory = intelligence.evidenceTrajectory
    .map((item) => ({ ...item, evidenceIds: keepIds(item.evidenceIds) }))
    .filter((item) => item.evidenceIds.length > 0)
    .sort((left, right) => left.sequence - right.sequence)
    .slice(0, 6);
  const interactionPathways = intelligence.interactionPathways
    .map((item) => ({ ...item, evidenceIds: keepIds(item.evidenceIds) }))
    .filter((item) => item.evidenceIds.length > 0)
    .slice(0, 6);
  const contradictions = intelligence.contradictions
    .map((item) => ({ ...item, evidenceIds: keepIds(item.evidenceIds) }))
    .filter((item) => item.evidenceIds.length > 0)
    .slice(0, 5);

  return {
    ...intelligence,
    directAnswer: intelligence.directAnswer.trim(),
    strongestSupportedConclusion: intelligence.strongestSupportedConclusion.trim(),
    strongestCounterpoint: intelligence.strongestCounterpoint.trim(),
    evidenceTrajectory,
    interactionPathways,
    contradictions,
    decisionChangingUnknowns: intelligence.decisionChangingUnknowns.slice(0, 6),
  } satisfies ResearchIntelligence;
}

export function isResearchIntelligenceGrounded(
  intelligence: ResearchIntelligence | undefined,
  evidence: EvidenceItem[],
) {
  const sanitized = sanitizeResearchIntelligence(intelligence, evidence);
  if (!sanitized || sanitized.directAnswer.length < 30) return false;
  if (sanitized.answerStatus === "insufficient") {
    return sanitized.decisionChangingUnknowns.length > 0;
  }
  return sanitized.evidenceTrajectory.length > 0 || sanitized.interactionPathways.length > 0;
}
