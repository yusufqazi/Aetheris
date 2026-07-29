import { areOverlappingClinicalConclusions } from "@/lib/research/finding-deduplication";
import type { EvidenceItem, GroundedFact, SearchChunk } from "@/lib/types";

type ConfidenceEvidence = EvidenceItem | SearchChunk;

export interface EvidenceConfidenceAssessment {
  level: "low" | "medium" | "high";
  score: number;
  consistencyScore: number;
  quantityScore: number;
  strengthScore: number;
  sourceDiversityScore: number;
  supportCount: number;
  sourceCount: number;
  strongSupportCount: number;
}

export function assessEvidenceConfidence({
  facts,
  evidence = [],
  counterEvidenceCount = 0,
  missingEvidenceCount = 0,
  includeLimitationsAsSupport = false,
}: {
  facts: GroundedFact[];
  evidence?: ConfidenceEvidence[];
  counterEvidenceCount?: number;
  missingEvidenceCount?: number;
  includeLimitationsAsSupport?: boolean;
}): EvidenceConfidenceAssessment {
  const supportingFacts = uniqueSupportingFacts(
    facts.filter((fact) => isSupportingFact(fact, includeLimitationsAsSupport)),
  );
  const supportCount = supportingFacts.length;
  const sourceCount = new Set(supportingFacts.map((fact) => fact.documentId)).size;
  if (supportCount === 0) {
    return {
      level: "low",
      score: 0,
      consistencyScore: 0,
      quantityScore: 0,
      strengthScore: 0,
      sourceDiversityScore: 0,
      supportCount: 0,
      sourceCount: 0,
      strongSupportCount: 0,
    };
  }

  const factStrengths = supportingFacts.map(factStrength);
  const strongSupportCount = factStrengths.filter((score) => score >= 84).length;
  const evidenceQuality = rankedEvidenceQuality(evidence);
  const strengthScore = Math.round(
    average(factStrengths) * 0.82 + evidenceQuality * 0.18,
  );
  const quantityScore = Math.min(100, 28 + supportCount * 14);
  const sourceDiversityScore = sourceCount >= 4
    ? 100
    : sourceCount === 3
      ? 90
      : sourceCount === 2
        ? 74
        : 42;
  const discrepancyCount = facts.filter((fact) => fact.contentType === "discrepancy").length;
  const unresolvedCount = counterEvidenceCount + discrepancyCount;
  const counterRatio = unresolvedCount / Math.max(1, supportCount + unresolvedCount);
  const consistencyScore = Math.max(
    0,
    Math.round(100 - counterRatio * 88 - Math.min(24, missingEvidenceCount * 6)),
  );
  const score = Math.round(
    strengthScore * 0.4 +
      consistencyScore * 0.3 +
      quantityScore * 0.2 +
      sourceDiversityScore * 0.1,
  );
  const highEvidenceThreshold = sourceCount >= 2 || supportCount >= 3;
  const level = score >= 76 &&
    highEvidenceThreshold &&
    strengthScore >= 72 &&
    consistencyScore >= 72
    ? "high"
    : score >= 55
      ? "medium"
      : "low";

  return {
    level,
    score,
    consistencyScore,
    quantityScore,
    strengthScore,
    sourceDiversityScore,
    supportCount,
    sourceCount,
    strongSupportCount,
  };
}

function uniqueSupportingFacts(facts: GroundedFact[]) {
  const unique: GroundedFact[] = [];
  for (const fact of facts) {
    if (unique.some((candidate) =>
      candidate.documentId === fact.documentId &&
      areOverlappingClinicalConclusions(candidate.text, fact.text)
    )) {
      continue;
    }
    unique.push(fact);
  }
  return unique;
}

function isSupportingFact(fact: GroundedFact, includeLimitations: boolean) {
  return ![
    "discrepancy",
    "evidence_excerpt",
    "unresolved_question",
  ].includes(fact.contentType) && (includeLimitations || fact.contentType !== "limitation");
}

function factStrength(fact: GroundedFact) {
  const text = `${fact.text} ${fact.excerpt}`;
  if (DIRECT_MEASUREMENT.test(text)) return 94;
  if (DIRECT_CONCLUSION.test(text)) return 86;
  if ([
    "finding",
    "interaction_concern",
    "longitudinal_change",
    "recommendation",
    "safety_observation",
  ].includes(fact.contentType)) {
    return 74;
  }
  return 56;
}

function rankedEvidenceQuality(evidence: ConfidenceEvidence[]) {
  if (evidence.length === 0) return 50;
  const uniqueEvidence = Array.from(new Map(
    evidence.map((item) => [
      `${item.documentId}:${item.page ?? "unknown"}:${evidenceText(item).toLowerCase().replace(/\s+/g, " ").trim()}`,
      item,
    ]),
  ).values());
  return Math.round(average(uniqueEvidence.map((item) => {
    const semanticScore = clamp01(item.similarityScore ?? item.lexicalScore);
    const matchedTermBonus = Math.min(0.12, item.matchedTerms.length * 0.02);
    return Math.min(100, (semanticScore + matchedTermBonus) * 100);
  })));
}

function evidenceText(evidence: ConfidenceEvidence) {
  return "excerpt" in evidence ? evidence.excerpt : evidence.text;
}

function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

const DIRECT_MEASUREMENT = /\b\d+(?:\.\d+)?\s*(?:%|mg(?:\/kg)?|mcg|ug|g\/dL|mg\/dL|ng\/mL|pg\/mL|mmol\/L|mEq\/L|U\/L|IU\/L|mg\/L|mmHg|bpm|ms|mL\/min|cells?\/uL|copies\/mL|cm|mm|weeks?|months?)\b|\bp\s*[=<]\s*0?\.\d+/i;
const DIRECT_CONCLUSION = /\b(?:confirm|diagnos|demonstrat|establish|identify|recommend|contraindicat|improv|worsen|resolve|progress|respond|benefit)\w*\b/i;
