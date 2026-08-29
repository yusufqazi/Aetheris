import type { EvidenceItem, ResearchIntelligence, StructuredResearchClaim } from "@/lib/types";
import {
  isQuestionOnlyQuote,
  semanticTopics,
} from "@/lib/research/evidence-relationships";
import { areOverlappingClinicalConclusions } from "@/lib/research/finding-deduplication";
import { assessEvidenceConfidence } from "@/lib/research/confidence";
import {
  isGenericOpenQuestion,
  openQuestionQualityIssues,
} from "@/lib/research/open-questions";
import {
  classifyStatementRole,
  recommendationsMateriallyConflict,
  sameClinicalQuestion,
  sameOutcomeQuestion,
} from "@/lib/research/conflict-semantics";
import {
  containsPrimaryAnswerSourceLeakage,
  primaryAnswerQualityIssues,
  polishPrimaryAnswerFluency,
} from "@/lib/research/primary-answer";
import {
  claimEvidenceAlignmentIssues,
  proseQualityIssues,
} from "@/lib/research/semantic-quality";
import { createClinicalFindingTitle } from "@/lib/research/finding-titles";
import {
  generatedFindingQualityIssues,
  isGeneratedFindingReviewable,
  polishGeneratedFinding,
} from "@/lib/research/finding-wording";

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
    .filter((item) => item.evidenceIds.length >= 2 && item.sourcePositions.length >= 2)
    .filter((item) => !isUncertaintyOnlyContradiction(item))
    .filter(isGenuineContradiction)
    .slice(0, 5);
  const evidenceMappings = (intelligence.evidenceMappings ?? [])
    .filter((mapping) => {
      const source = evidence.find((item) => item.id === mapping.evidenceId || item.chunkId === mapping.evidenceId);
      if (!source || isQuestionOnlyQuote(mapping.exactQuote)) return false;
      return containsVerbatimQuote(source.excerpt, mapping.exactQuote);
    })
    .filter((mapping, index, values) => values.findIndex((candidate) =>
      candidate.evidenceId === mapping.evidenceId &&
      candidate.targetType === mapping.targetType &&
      candidate.targetText === mapping.targetText &&
      candidate.exactQuote === mapping.exactQuote,
    ) === index)
    .slice(0, 24);
  const structuredClaims = mergeOverlappingClaims((intelligence.structuredClaims ?? [])
    .map((claim) => {
      const conclusion = polishGeneratedFinding(claim.conclusion, claim.theme);
      return {
        ...claim,
        conclusion,
        theme: createClinicalFindingTitle({
          statement: conclusion,
          providedTitle: conclusion === claim.conclusion ? claim.theme : undefined,
          dimension: claim.dimension,
        }),
        clinicalImplication: claim.clinicalImplication?.trim(),
        reasoningSummary: claim.reasoningSummary.trim(),
        uncertainty: claim.uncertainty.trim(),
        evidenceIds: keepIds(claim.evidenceIds).filter((id) => evidenceSupportsClaim(id, claim, evidence)),
        counterEvidenceIds: keepIds(claim.counterEvidenceIds).filter((id) => evidenceSupportsClaim(id, claim, evidence)),
      };
    })
    .filter((claim) =>
      claim.conclusion.length >= 18 &&
      claim.reasoningSummary.length >= 24 &&
      claim.evidenceIds.length > 0 &&
      isCompleteStatement(claim.conclusion) &&
      isGeneratedFindingReviewable(claim.conclusion) &&
      numbersAreGrounded(`${claim.conclusion} ${claim.reasoningSummary}`, claim.evidenceIds, evidence),
    ))
    .map((claim) => ({
      ...claim,
      confidence: confidenceForStructuredClaim(claim, evidence),
    }))
    .slice(0, 10);

  return {
    ...intelligence,
    directAnswer: polishPrimaryAnswerFluency(intelligence.directAnswer),
    strongestSupportedConclusion: intelligence.strongestSupportedConclusion.trim(),
    strongestCounterpoint: intelligence.strongestCounterpoint.trim(),
    evidenceTrajectory,
    interactionPathways,
    contradictions,
    decisionChangingUnknowns: intelligence.decisionChangingUnknowns
      .map((item) => ({
        ...item,
        evidenceIds: keepIds(item.evidenceIds ?? []),
      }))
      .filter((item) =>
        item.unknown.trim().length >= 18 &&
        !isGenericOpenQuestion(item.unknown) &&
        openQuestionQualityIssues(item.unknown).length === 0 &&
        completeSupportingText(item.known) &&
        completeSupportingText(item.evidenceNeeded) &&
        completeSupportingText(item.whyItMatters) &&
        item.evidenceNeeded.trim().length >= 12 &&
        item.whyItMatters.trim().length >= 12,
      )
      .slice(0, 6),
    evidenceMappings,
    structuredClaims,
  } satisfies ResearchIntelligence;
}

function mergeOverlappingClaims(claims: StructuredResearchClaim[]) {
  const merged: StructuredResearchClaim[] = [];
  for (const claim of claims) {
    const duplicate = merged.find((candidate) =>
      areOverlappingClinicalConclusions(candidate.conclusion, claim.conclusion),
    );
    if (!duplicate) {
      merged.push(claim);
      continue;
    }

    duplicate.evidenceIds = Array.from(new Set([
      ...duplicate.evidenceIds,
      ...claim.evidenceIds,
    ]));
    duplicate.counterEvidenceIds = Array.from(new Set([
      ...duplicate.counterEvidenceIds,
      ...claim.counterEvidenceIds,
    ])).filter((id) => !duplicate.evidenceIds.includes(id));
  }
  return merged;
}

function confidenceForStructuredClaim(
  claim: StructuredResearchClaim,
  evidence: EvidenceItem[],
) {
  const supportingEvidence = evidence.filter((item) =>
    claim.evidenceIds.includes(item.id) || claim.evidenceIds.includes(item.chunkId)
  );
  const facts = supportingEvidence.map((item, index) => ({
    id: `confidence:${claim.id}:${index}`,
    category: claim.dimension,
    contentType: "finding" as const,
    text: claim.conclusion,
    evidenceId: item.id,
    documentId: item.documentId,
    documentName: item.documentName,
    page: item.page,
    excerpt: item.excerpt,
    relevance: item.relevance,
  }));
  return assessEvidenceConfidence({
    facts,
    evidence: supportingEvidence,
    counterEvidenceCount: claim.counterEvidenceIds.length,
  }).level;
}

function containsVerbatimQuote(source: string, quote: string) {
  if (source.includes(quote)) return true;
  return source.replace(/\s+/g, " ").includes(quote.replace(/\s+/g, " ").trim());
}

function isCompleteStatement(value: string) {
  if (/\.\.\.|…/.test(value)) return false;
  return !/\b(?:a|an|the|and|or|that|which|because|with|without|from|to|of|for|by|based on|consistent with|due to|including|following|frequent|initial|early|later|higher|lower)\s*[,:;-]*$/i.test(value);
}

function isUncertaintyOnlyContradiction(
  item: ResearchIntelligence["contradictions"][number],
) {
  const text = `${item.issue} ${item.sourcePositions.join(" ")} ${item.reconciliation}`;
  const uncertainty = /\b(?:unknown|uncertain|unclear|pending|missing|not yet available|insufficient evidence|requires? confirmation)\b/i.test(text);
  const opposingActions = /\b(?:proceed|start|continue|recommend)\w*\b[\s\S]{0,180}\b(?:delay|defer|hold|stop|avoid|contraindicat)\w*\b|\b(?:delay|defer|hold|stop|avoid|contraindicat)\w*\b[\s\S]{0,180}\b(?:proceed|start|continue|recommend)\w*\b/i.test(text);
  const benefitRisk = /\b(?:benefit|improv|support\w*|proceed|start|continue)\b[\s\S]{0,180}\b(?:risk|harm|worsen|complication|unsafe|contraindicat)\w*\b|\b(?:risk|harm|worsen|complication|unsafe|contraindicat)\w*\b[\s\S]{0,180}\b(?:benefit|improv|support\w*|proceed|start|continue)\b/i.test(text);
  const explicitDisagreement = /\b(?:in contrast|whereas|disagree|conflict|different recommendation|opposite)\b/i.test(text);
  return uncertainty && !opposingActions && !benefitRisk && !explicitDisagreement;
}

function isGenuineContradiction(
  item: ResearchIntelligence["contradictions"][number],
) {
  for (let leftIndex = 0; leftIndex < item.sourcePositions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < item.sourcePositions.length; rightIndex += 1) {
      const left = item.sourcePositions[leftIndex];
      const right = item.sourcePositions[rightIndex];
      if (
        recommendationsMateriallyConflict(left, right) ||
        (sameOutcomeQuestion(left, right) && outcomesConflict(left, right)) ||
        (sameClinicalQuestion(left, right) && uncertaintyDiffers(left, right, item.issue))
      ) {
        return true;
      }
    }
  }
  return false;
}

function outcomesConflict(left: string, right: string) {
  const positive = /\b(?:improv|benefit|positive|effective|response|resolved|decreased)\w*\b/i;
  const negative = /\b(?:did not|no benefit|negative|ineffective|failed|worsen|increased risk|persisted)\w*\b/i;
  const leftValues: string[] = left.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const rightValues: string[] = right.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const differentValues = leftValues.length > 0 &&
    rightValues.length > 0 &&
    (leftValues.length !== rightValues.length || leftValues.some((value) => !rightValues.includes(value)));
  return (positive.test(left) && negative.test(right)) ||
    (positive.test(right) && negative.test(left)) ||
    differentValues;
}

function uncertaintyDiffers(left: string, right: string, issue: string) {
  if (!/\b(?:uncertain|unclear|unknown|not established|not confirmed|insufficient)\b/i.test(issue)) {
    return false;
  }
  const certain = /\b(?:confirmed|established|demonstrated|definitive|conclusive)\b/i;
  const uncertain = /\b(?:uncertain|unclear|unknown|possible|suspected|not established|not confirmed|insufficient)\b/i;
  return (certain.test(left) && uncertain.test(right)) || (certain.test(right) && uncertain.test(left));
}

function numbersAreGrounded(text: string, evidenceIds: string[], evidence: EvidenceItem[]) {
  const sourceText = evidence
    .filter((item) => evidenceIds.includes(item.id) || evidenceIds.includes(item.chunkId))
    .map((item) => item.excerpt)
    .join(" ")
    .toLowerCase();
  const numericTokens = text.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  return numericTokens.every((token) => sourceText.includes(token.toLowerCase()));
}

export function isResearchIntelligenceGrounded(
  intelligence: ResearchIntelligence | undefined,
  evidence: EvidenceItem[],
  question = "",
) {
  return researchIntelligenceGroundingIssues(intelligence, evidence, question).length === 0;
}

export function researchIntelligenceGroundingIssues(
  intelligence: ResearchIntelligence | undefined,
  evidence: EvidenceItem[],
  question = "",
) {
  const sanitized = sanitizeResearchIntelligence(intelligence, evidence);
  if (!sanitized) return ["missing-structured-output"];

  const issues: string[] = [];
  if ((intelligence?.structuredClaims ?? []).some((claim) =>
    generatedFindingQualityIssues(claim.conclusion).length > 0
  )) {
    issues.push("finding-output-malformed");
  }
  if (sanitized.directAnswer.length < 40) issues.push("direct-answer-too-short");
  issues.push(...primaryAnswerQualityIssues(sanitized.directAnswer).map((issue) => `direct-answer-${issue}`));
  if (!isCompleteStatement(sanitized.directAnswer) || !/[.!?]$/.test(sanitized.directAnswer)) {
    issues.push("direct-answer-incomplete");
  }
  if (/^(?:on\s+\w+|factors?\s+(?:arguing|for|against)|findings?|summary|primary answer)\s*[:,]/i.test(sanitized.directAnswer)) {
    issues.push("direct-answer-malformed");
  }
  if (containsPrimaryAnswerSourceLeakage(sanitized.directAnswer)) {
    issues.push("direct-answer-source-text-leakage");
  }
  const allEvidenceIds = evidence.flatMap((item) => [item.id, item.chunkId]);
  if (!numbersAreGrounded(sanitized.directAnswer, allEvidenceIds, evidence)) {
    issues.push("direct-answer-contains-unsupported-number");
  }
  if (sanitized.answerStatus === "insufficient") {
    if (sanitized.decisionChangingUnknowns.length === 0) {
      issues.push("insufficient-answer-without-specific-unknown");
    }
    return issues;
  }
  if ((sanitized.structuredClaims?.length ?? 0) === 0) {
    issues.push("no-source-grounded-claims");
  }

  const answerTopics = semanticTopics(sanitized.directAnswer);
  const claimTopics = semanticTopics(
    (sanitized.structuredClaims ?? []).map((claim) => claim.conclusion).join(" "),
  );
  if (
    answerTopics.length > 0 &&
    claimTopics.length > 0 &&
    !answerTopics.some((topic) => claimTopics.includes(topic))
  ) {
    issues.push("direct-answer-disconnected-from-claims");
  }

  // Category labels are useful for presentation, but they are not a reliable
  // grounding test. A valid synthesis should not be discarded because a model
  // called a treatment constraint "context" instead of "safety".
  void question;
  return issues;
}

function evidenceSupportsClaim(
  evidenceId: string,
  claim: StructuredResearchClaim,
  evidence: EvidenceItem[],
) {
  const source = evidence.find((item) => item.id === evidenceId || item.chunkId === evidenceId);
  if (!source) return false;
  const target = `${claim.conclusion} ${claim.reasoningSummary} ${claim.clinicalImplication ?? ""}`;
  const targetTopics = semanticTopics(target);
  const sourceTopics = semanticTopics(source.excerpt);
  const shared = targetTopics.filter((topic) => sourceTopics.includes(topic));
  if (shared.length < 1) return false;
  if (claimEvidenceAlignmentIssues(claim.conclusion, source.excerpt).length > 0) return false;
  const targetRole = classifyStatementRole(target);
  const sourceRole = classifyStatementRole(source.excerpt);
  if (
    ["recommendation_for", "recommendation_against"].includes(targetRole) &&
    !["recommendation_for", "recommendation_against"].includes(sourceRole)
  ) {
    return false;
  }
  return true;
}

function completeSupportingText(value: string | undefined) {
  const text = value?.trim() ?? "";
  if (text.length < 12 || proseQualityIssues(text).length > 0) return false;
  return !/\b(?:and|or|that|which|because|with|from|to|of|for)\s*[,;:.-]*$/i.test(text);
}
