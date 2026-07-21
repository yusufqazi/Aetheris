import type { EvidenceItem, ResearchIntelligence, StructuredResearchClaim } from "@/lib/types";
import {
  areSemanticallyEquivalent,
  isQuestionOnlyQuote,
  semanticTopics,
} from "@/lib/research/evidence-relationships";
import { isGenericOpenQuestion } from "@/lib/research/open-questions";

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
  const structuredClaims = (intelligence.structuredClaims ?? [])
    .map((claim) => ({
      ...claim,
      conclusion: claim.conclusion.trim(),
      theme: claim.theme?.trim(),
      clinicalImplication: claim.clinicalImplication?.trim(),
      reasoningSummary: claim.reasoningSummary.trim(),
      uncertainty: claim.uncertainty.trim(),
      evidenceIds: keepIds(claim.evidenceIds).filter((id) => evidenceSupportsClaim(id, claim, evidence)),
      counterEvidenceIds: keepIds(claim.counterEvidenceIds).filter((id) => evidenceSupportsClaim(id, claim, evidence)),
    }))
    .filter((claim) =>
      claim.conclusion.length >= 18 &&
      claim.reasoningSummary.length >= 24 &&
      claim.evidenceIds.length > 0 &&
      isCompleteStatement(claim.conclusion) &&
      numbersAreGrounded(`${claim.conclusion} ${claim.reasoningSummary}`, claim.evidenceIds, evidence),
    )
    .filter((claim, index, claims) => claims.findIndex((candidate) =>
      areSemanticallyEquivalent(candidate.conclusion, claim.conclusion),
    ) === index)
    .slice(0, 10);

  return {
    ...intelligence,
    directAnswer: intelligence.directAnswer.trim(),
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
        item.evidenceNeeded.trim().length >= 12 &&
        item.whyItMatters.trim().length >= 12,
      )
      .slice(0, 6),
    evidenceMappings,
    structuredClaims,
  } satisfies ResearchIntelligence;
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
  if (sanitized.directAnswer.length < 40) issues.push("direct-answer-too-short");
  if (!isCompleteStatement(sanitized.directAnswer) || !/[.!?]$/.test(sanitized.directAnswer)) {
    issues.push("direct-answer-incomplete");
  }
  if (/^(?:on\s+\w+|factors?\s+(?:arguing|for|against)|findings?|summary|primary answer)\s*[:,]/i.test(sanitized.directAnswer)) {
    issues.push("direct-answer-malformed");
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
  return shared.length >= 1;
}
