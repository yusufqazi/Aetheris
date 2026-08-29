import {
  areSemanticallyEquivalent,
  semanticFamily,
  semanticTopics,
} from "@/lib/research/evidence-relationships";
import { areOverlappingClinicalConclusions } from "@/lib/research/finding-deduplication";
import { isClinicallyMaterialRecommendation } from "@/lib/research/grounding";
import { assessEvidenceConfidence } from "@/lib/research/confidence";
import { createClinicalFindingTitle } from "@/lib/research/finding-titles";
import {
  classifyStatementRole,
  isNeutralPositionStatement,
  recommendationsMateriallyConflict,
} from "@/lib/research/conflict-semantics";
import { claimEvidenceAlignmentIssues } from "@/lib/research/semantic-quality";
import {
  isGeneratedFindingReviewable,
  polishGeneratedFinding,
} from "@/lib/research/finding-wording";
import {
  evidenceNeededForOpenQuestion,
  openQuestionsFromMissingEvidence,
  openQuestionImpact,
} from "@/lib/research/open-questions";
import type {
  DebateConsensusOutput,
  EvidenceItem,
  GroundedFact,
  ResearchAnswerDimension,
  ResearchContradiction,
  ResearchEvidenceMapping,
  ResearchIntelligence,
  StructuredResearchClaim,
} from "@/lib/types";

const INCOMPLETE_ENDING = /\b(?:and|or|that|which|because|with|from|to|of|frequent)\s*[,:;-]*$/i;
const DIRECT_MEASUREMENT = /\b\d+(?:\.\d+)?\s*(?:%|mg(?:\/kg)?|mcg|µg|ug|g\/dL|mg\/dL|ng\/mL|pg\/mL|mmol\/L|mEq\/L|U\/L|IU\/L|mg\/L|mmHg|bpm|ms|mL\/min|cells?\/µL|copies\/mL|cm|mm|weeks?|months?|participants?|patients?)\b|\bp\s*[=<]\s*0?\.\d+/i;

export function requestedAnswerDimensions(question: string): ResearchAnswerDimension[] {
  const dimensions: ResearchAnswerDimension[] = [];
  if (/efficacy|effective|response|respond|improv|benefit|outcome|treatment/i.test(question)) {
    dimensions.push("efficacy");
  }
  if (/safety|safe|adverse|risk|harm|interaction|medication|drug/i.test(question)) {
    dimensions.push("safety");
  }
  if (/limitation|uncertain|missing|unresolved|caveat|weakness|gap|generaliz/i.test(question)) {
    dimensions.push("limitation");
  }
  return dimensions.length > 0 ? dimensions : ["context"];
}

export function buildStructuredResearchClaims({
  question,
  facts,
  evidence,
}: {
  question: string;
  facts: GroundedFact[];
  evidence: EvidenceItem[];
}): StructuredResearchClaim[] {
  const validEvidenceIds = new Set(evidence.map((item) => item.id));
  const eligible = facts.filter((fact) =>
    validEvidenceIds.has(fact.evidenceId) &&
    fact.category !== "study-design" &&
    (fact.contentType !== "recommendation" || isClinicallyMaterialRecommendation(fact.text)) &&
    fact.contentType !== "unresolved_question" &&
    fact.contentType !== "evidence_excerpt" &&
    isCompleteClaimText(fact.text),
  );
  const dimensions = requestedAnswerDimensions(question);
  const groups = groupFactsForClaims(eligible);
  const claims = groups.map((group) => claimFromFacts(group, eligible, dimensions));
  const uniqueClaims: StructuredResearchClaim[] = [];

  for (const claim of claims.sort((left, right) => claimScore(right, dimensions) - claimScore(left, dimensions))) {
    const duplicate = uniqueClaims.find((existing) =>
      areOverlappingClinicalConclusions(existing.conclusion, claim.conclusion),
    );
    if (duplicate) {
      duplicate.evidenceIds = unique([...duplicate.evidenceIds, ...claim.evidenceIds]);
      duplicate.counterEvidenceIds = unique([
        ...duplicate.counterEvidenceIds,
        ...claim.counterEvidenceIds,
      ]).filter((id) => !duplicate.evidenceIds.includes(id));
      continue;
    }
    uniqueClaims.push(claim);
  }

  return uniqueClaims.slice(0, 9).map((claim, index) => ({
    ...claim,
    priority: index === 0
      ? "primary"
      : dimensions.includes(claim.dimension) && index < 5
        ? "important"
        : "context",
  }));
}

export function buildFallbackResearchIntelligence({
  question,
  facts,
  evidence,
  directAnswer,
  uncertainties,
  followUpQuestions,
  consensus,
}: {
  question: string;
  facts: GroundedFact[];
  evidence: EvidenceItem[];
  directAnswer: string;
  uncertainties: string[];
  followUpQuestions: string[];
  consensus?: Pick<DebateConsensusOutput, "disagreements" | "missingEvidence">;
}): ResearchIntelligence {
  const structuredClaims = buildStructuredResearchClaims({ question, facts, evidence });
  const requested = requestedAnswerDimensions(question);
  const covered = new Set(structuredClaims.map((claim) => claim.dimension));
  const answerStatus = structuredClaims.length === 0
    ? "insufficient"
    : requested.every((dimension) => covered.has(dimension))
      ? "direct"
      : "partial";

  const unresolvedQuestions = deduplicateDecisionQuestions([
    ...followUpQuestions,
    ...(consensus?.missingEvidence ?? []).flatMap(openQuestionsFromMissingEvidence),
  ]).slice(0, 4);

  return {
    answerStatus,
    directAnswer,
    strongestSupportedConclusion: structuredClaims[0]?.conclusion
      ?? "The uploaded evidence does not support a reviewable conclusion.",
    strongestCounterpoint: structuredClaims.find((claim) => claim.counterEvidenceIds.length > 0)?.uncertainty
      ?? uncertainties[0]
      ?? "The conclusion is limited to the uploaded source set.",
    evidenceTrajectory: buildEvidenceTrajectory(facts),
    interactionPathways: structuredClaims
      .filter((claim) => claim.dimension === "safety" && /interaction|medication|drug|exposure|coadministration/i.test(claim.conclusion))
      .slice(0, 4)
      .map((claim) => ({
        title: claim.conclusion,
        priority: claim.priority === "primary" ? "high" : "moderate",
        finding: claim.conclusion,
        observedSignal: claim.reasoningSummary,
        whyItMatters: "This signal may change the safety interpretation of the uploaded evidence.",
        uncertainty: claim.uncertainty,
        evidenceIds: claim.evidenceIds,
      })),
    contradictions: buildFallbackContradictions(facts, evidence),
    decisionChangingUnknowns: unresolvedQuestions.map((unknown, index) => {
      const evidenceIds = evidenceIdsForQuestion(unknown, facts);
      const relatedFacts = facts.filter((fact) => evidenceIds.includes(fact.evidenceId));
      return {
        unknown,
        known: mostRelevantKnownFact(unknown, facts),
        whyItMatters: openQuestionImpact(unknown, relatedFacts),
        evidenceNeeded: evidenceNeededForOpenQuestion(unknown),
        evidenceIds,
        priority: index === 0 ? "high" : "moderate",
      };
    }),
    evidenceMappings: buildClaimEvidenceMappings(structuredClaims, facts),
    structuredClaims,
  };
}

export function buildFallbackContradictions(
  facts: GroundedFact[],
  evidence: EvidenceItem[],
): ResearchContradiction[] {
  const validEvidenceIds = new Set(evidence.flatMap((item) => [item.id, item.chunkId]));
  const candidates = facts.filter((fact) =>
    validEvidenceIds.has(fact.evidenceId) &&
    !isNeutralPositionStatement(fact.text) &&
    !["unresolved_question", "evidence_excerpt", "longitudinal_change"].includes(fact.contentType),
  );
  const contradictions: ResearchContradiction[] = [];

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (left.documentId === right.documentId || !factsShareConflictSubject(left, right)) continue;

      const leftText = left.text;
      const rightText = right.text;
      const leftPolarity = localEvidencePolarity(leftText);
      const rightPolarity = localEvidencePolarity(rightText);

      const recommendationConflict = recommendationsMateriallyConflict(leftText, rightText);
      const outcomeConflict = Boolean(
        left.category === right.category &&
        leftPolarity && rightPolarity && leftPolarity !== rightPolarity,
      );
      if (!recommendationConflict && !outcomeConflict) continue;

      const issue = recommendationConflict
        ? `${left.documentName} and ${right.documentName} recommend materially different actions for the same decision.`
        : `${left.documentName} and ${right.documentName} report different outcome directions for the same subject.`;
      const evidenceIds = [left.evidenceId, right.evidenceId];
      if (contradictions.some((item) =>
        evidenceIds.every((id) => item.evidenceIds.includes(id)) ||
        areSemanticallyEquivalent(item.issue, issue),
      )) continue;

      contradictions.push({
        issue,
        sourcePositions: [left.text, right.text],
        reconciliation: "The source context, timing, and decision threshold must be compared before either position is treated as controlling.",
        impact: recommendationConflict
          ? "The disagreement changes the next action and should be resolved before presenting one recommendation as settled."
          : "The conclusion depends on which source and context best represent the decision under review.",
        evidenceIds,
      });
      if (contradictions.length >= 5) return contradictions;
    }
  }

  return contradictions;
}

function localEvidencePolarity(text: string) {
  if (/\b(?:did not|no meaningful|no significant|failed|negative|inferior|worsen\w*|deteriorat\w*|increased risk|higher risk|serious adverse)\b/i.test(text)) {
    return "negative" as const;
  }
  if (/\b(?:improv\w*|benefit\w*|positive|superior|response|stabili[sz]\w*|reduced|supports? proceeding|favors?)\b/i.test(text)) {
    return "positive" as const;
  }
  return null;
}

function factsShareConflictSubject(left: GroundedFact, right: GroundedFact) {
  const ignored = new Set([
    "action", "assessment", "care", "decision", "diagnosis", "management", "recommendation",
    "risk", "safety", "therapy", "treatment",
  ]);
  const leftTopics = semanticTopics(left.text).filter((topic) => !ignored.has(topic));
  const rightTopics = semanticTopics(right.text).filter((topic) => !ignored.has(topic));
  return leftTopics.some((topic) => rightTopics.includes(topic));
}

function deduplicateDecisionQuestions(questions: string[]) {
  const accepted: string[] = [];
  for (const question of unique(questions)) {
    const topics = normalizedQuestionTopics(question);
    if (accepted.some((candidate) => {
      const candidateTopics = normalizedQuestionTopics(candidate);
      const shared = topics.filter((topic) => candidateTopics.includes(topic));
      return shared.length >= 2 && shared.length >= Math.min(topics.length, candidateTopics.length) * 0.4;
    })) continue;
    accepted.push(question);
  }
  return accepted;
}

function normalizedQuestionTopics(question: string) {
  return semanticTopics(question).map((topic) =>
    topic.length > 5 && topic.endsWith("s") ? topic.slice(0, -1) : topic
  );
}

function groupFactsForClaims(facts: GroundedFact[]) {
  const groups: GroundedFact[][] = [];
  for (const fact of facts) {
    const existing = groups.find((group) =>
      areOverlappingClinicalConclusions(
        group[0].text,
        fact.text,
      ),
    );
    if (existing) existing.push(fact);
    else groups.push([fact]);
  }
  return groups;
}

function claimFromFacts(
  facts: GroundedFact[],
  allFacts: GroundedFact[],
  requested: ResearchAnswerDimension[],
): StructuredResearchClaim {
  const dimension = dimensionForFact(facts[0]);
  const rankedFacts = [...facts].sort((left, right) => factSpecificity(right) - factSpecificity(left));
  const representative = rankedFacts[0];
  const conclusion = normalizeClaimConclusion(representative.text);
  const counterFacts = findCounterFacts(facts, allFacts, dimension);
  const evidenceIds = unique(facts.map((fact) => fact.evidenceId));
  const counterEvidenceIds = unique(counterFacts.map((fact) => fact.evidenceId))
    .filter((evidenceId) => !evidenceIds.includes(evidenceId));
  const sourceCount = new Set(facts.map((fact) => fact.documentId)).size;
  const kind = facts.length > 1 ? "inference" : "direct_observation";
  const family = semanticFamily(facts.map((fact) => fact.text).join(" "));

  return {
    id: `claim:${dimension}:${family}`,
    conclusion,
    kind,
    dimension,
    theme: themeForFacts(facts, dimension),
    clinicalImplication: implicationForFacts(facts, dimension),
    reasoningSummary: reasoningSummaryFor(facts, dimension, sourceCount),
    evidenceIds,
    counterEvidenceIds,
    uncertainty: uncertaintyFor(dimension, counterFacts),
    confidence: confidenceFor(facts, counterEvidenceIds.length),
    priority: requested.includes(dimension) ? "important" : "context",
  };
}

function dimensionForFact(fact: GroundedFact): ResearchAnswerDimension {
  if (fact.contentType === "limitation" || fact.contentType === "discrepancy" || fact.category === "limitation" || fact.category === "exclusion") {
    return "limitation";
  }
  if (fact.contentType === "interaction_concern" || fact.contentType === "safety_observation" || fact.category === "interaction" || fact.category === "safety") {
    return "safety";
  }
  if (fact.contentType === "recommendation") {
    return /safety|adverse|toxicity|risk|harm|warning|monitor|avoid|hold|withhold/i.test(`${fact.text} ${fact.excerpt}`)
      ? "safety"
      : "context";
  }
  if (fact.contentType === "longitudinal_change") {
    if (/adverse|toxicity|safety|harm|complication|worsen|deteriorat/i.test(`${fact.text} ${fact.excerpt}`)) return "safety";
    if (/symptom|score|endpoint|response|improv|decreas|increas|normaliz|laborator|biomarker|imaging|progress|resolve|recur/i.test(`${fact.text} ${fact.excerpt}`)) return "efficacy";
    return "context";
  }
  if (fact.category === "efficacy" || fact.category === "statistical") {
    return "efficacy";
  }
  return "context";
}

function findCounterFacts(
  claimFacts: GroundedFact[],
  allFacts: GroundedFact[],
  dimension: ResearchAnswerDimension,
) {
  const claimText = claimFacts.map((fact) => `${fact.text} ${fact.excerpt}`).join(" ");
  const claimTopics = semanticTopics(claimText);
  return allFacts.filter((fact) => {
    if (claimFacts.includes(fact)) return false;
    const candidateDimension = dimensionForFact(fact);
    if (candidateDimension !== "limitation" && fact.contentType !== "discrepancy") return false;
    const candidateTopics = semanticTopics(`${fact.text} ${fact.excerpt}`);
    const sharesTopic = claimTopics.some((topic) => candidateTopics.includes(topic));
    return sharesTopic || (dimension === "efficacy" && /duration|follow-up|excluded|generaliz|sample|population/i.test(fact.text));
  }).slice(0, 3);
}

function reasoningSummaryFor(
  facts: GroundedFact[],
  dimension: ResearchAnswerDimension,
  sourceCount: number,
) {
  const basis = facts.length === 1
    ? "one directly stated source observation"
    : `multiple source observations${sourceCount > 1 ? " across more than one document" : ""}`;
  if (facts.some((fact) => fact.contentType === "longitudinal_change")) {
    return `This conclusion follows from ${basis} that establish the direction and timing of change rather than treating each time point as an unrelated result.`;
  }
  if (facts.some((fact) => fact.contentType === "recommendation")) {
    return `This treatment or monitoring decision is directly documented in ${basis}; it is kept separate from observed clinical outcomes.`;
  }
  if (dimension === "efficacy") {
    return `This conclusion follows from ${basis} describing treatment response, outcome direction, or follow-up change.`;
  }
  if (dimension === "safety") {
    return `This conclusion follows from ${basis} describing an observed safety signal or documented interaction concern; it does not convert concern into proven harm.`;
  }
  if (dimension === "limitation") {
    return `This boundary is retained because ${basis} identifies evidence that is absent, unresolved, or not represented.`;
  }
  return `This context is retained from ${basis} because it changes how the answer should be interpreted.`;
}

function uncertaintyFor(dimension: ResearchAnswerDimension, counterFacts: GroundedFact[]) {
  if (counterFacts.length > 0) {
    return `The conclusion is qualified by: ${normalizeClaimConclusion(counterFacts[0].text)}`;
  }
  if (dimension === "safety") {
    return "The uploaded evidence may identify association or concern without establishing that the exposure caused harm.";
  }
  if (dimension === "efficacy") {
    return "The strength of this conclusion is limited by the design, duration, and populations represented in the uploaded records.";
  }
  if (dimension === "limitation") {
    return "The uploaded sources do not contain the additional evidence needed to resolve this boundary.";
  }
  return "This conclusion is limited to the uploaded source set.";
}

function confidenceFor(facts: GroundedFact[], counterEvidenceCount: number) {
  return assessEvidenceConfidence({
    facts,
    counterEvidenceCount,
    includeLimitationsAsSupport: true,
  }).level;
}

export function buildClaimEvidenceMappings(
  claims: StructuredResearchClaim[],
  facts: GroundedFact[],
): ResearchEvidenceMapping[] {
  const mappings: ResearchEvidenceMapping[] = [];
  for (const claim of claims) {
    for (const evidenceId of claim.evidenceIds) {
      const fact = facts.find((item) => item.evidenceId === evidenceId);
      if (!fact || !claimMatchesFact(claim, fact)) continue;
      mappings.push({
        evidenceId,
        targetType: "finding",
        targetText: claim.conclusion,
        relationshipType: "supports",
        exactQuote: fact.excerpt,
        relevanceExplanation: claim.clinicalImplication || claim.reasoningSummary,
        confidence: claim.confidence,
      });
    }
    for (const evidenceId of claim.counterEvidenceIds) {
      const fact = facts.find((item) => item.evidenceId === evidenceId);
      if (!fact || !claimMatchesFact(claim, fact)) continue;
      mappings.push({
        evidenceId,
        targetType: "finding",
        targetText: claim.conclusion,
        relationshipType: fact.contentType === "discrepancy" ? "contradicts" : "weakens",
        exactQuote: fact.excerpt,
        relevanceExplanation: "This source observation narrows or weakens the conclusion.",
        confidence: "high",
      });
    }
  }
  return mappings.slice(0, 24);
}

function claimMatchesFact(claim: StructuredResearchClaim, fact: GroundedFact) {
  const targetTokens = semanticTopics(`${claim.conclusion} ${claim.reasoningSummary}`);
  const sourceText = `${fact.text} ${fact.excerpt}`;
  const sourceTokens = semanticTopics(sourceText);
  const shared = targetTokens.filter((token) => sourceTokens.includes(token));
  const targetNumbers: string[] = `${claim.conclusion} ${claim.reasoningSummary}`.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const sourceNumbers: string[] = sourceText.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  if (
    shared.length < 2 ||
    (targetNumbers.length > 0 && !targetNumbers.every((value) => sourceNumbers.includes(value))) ||
    claimEvidenceAlignmentIssues(claim.conclusion, sourceText).length > 0
  ) return false;
  const claimRole = classifyStatementRole(claim.conclusion);
  const sourceRole = classifyStatementRole(sourceText);
  if (
    ["recommendation_for", "recommendation_against"].includes(claimRole) &&
    claimRole !== sourceRole
  ) return false;
  return true;
}

function normalizeClaimConclusion(text: string) {
  const value = polishGeneratedFinding(text
    .replace(/^(?:(?:key\s+)?finding|observation|limitation|safety observation|potential concern|evidence)\s*[:\-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim());
  if (!value) return "The uploaded evidence does not support a specific conclusion.";
  return value;
}

function isCompleteClaimText(text: string) {
  const value = polishGeneratedFinding(text);
  return value.length >= 18 &&
    !/\.\.\.|…/.test(value) &&
    !INCOMPLETE_ENDING.test(value) &&
    isGeneratedFindingReviewable(value);
}

function factSpecificity(fact: GroundedFact) {
  const text = `${fact.text} ${fact.excerpt}`;
  return Number(DIRECT_MEASUREMENT.test(text)) * 4
    + Number(fact.contentType === "longitudinal_change") * 2
    + Number(fact.contentType === "recommendation" && isClinicallyMaterialRecommendation(text)) * 3
    + Math.min(fact.text.length / 180, 2);
}

function buildEvidenceTrajectory(facts: GroundedFact[]) {
  return facts
    .filter((fact) => fact.contentType === "longitudinal_change")
    .sort((left, right) => chronologyScore(left) - chronologyScore(right))
    .slice(0, 6)
    .map((fact, index) => ({
      sequence: index + 1,
      label: fact.page ? `${fact.documentName}, page ${fact.page}` : fact.documentName,
      finding: fact.text,
      interpretation: longitudinalInterpretation(fact.text),
      evidenceIds: [fact.evidenceId],
    }));
}

function chronologyScore(fact: GroundedFact) {
  const text = `${fact.documentName} ${fact.text}`;
  const date = text.match(/\b(20\d{2})[-/]?(\d{2})?[-/]?(\d{2})?\b/);
  if (date) return Number(`${date[1]}${date[2] ?? "00"}${date[3] ?? "00"}`);
  const week = text.match(/\bweek\s*(\d+)\b/i);
  if (week) return Number(week[1]) * 7;
  const month = text.match(/\bmonth\s*(\d+)\b/i);
  if (month) return Number(month[1]) * 30;
  if (/baseline|initial|before treatment/i.test(text)) return -1;
  if (/follow-up|subsequent|later|after treatment/i.test(text)) return 1_000_000 + (fact.page ?? 0);
  return 500_000 + (fact.page ?? 0);
}

function longitudinalInterpretation(text: string) {
  if (/improv|normaliz|resolved|decreas|fell|reduced/i.test(text)) {
    return /persist|remain|still|incomplete/i.test(text)
      ? "The later evidence shows improvement without complete resolution."
      : "The later evidence shows improvement relative to the earlier observation.";
  }
  if (/worsen|progress|increas|rose|new lesion|enlarged|recurred/i.test(text)) {
    return "The later evidence indicates progression or worsening relative to the earlier state.";
  }
  if (/started|stopped|held|withheld|switched|titrated|dose/i.test(text)) {
    return "The treatment plan changed at this point in the record and should be considered when interpreting subsequent outcomes.";
  }
  return "This observation establishes a later evidence state that qualifies the earlier record.";
}

function claimScore(claim: StructuredResearchClaim, requested: ResearchAnswerDimension[]) {
  return Number(requested.includes(claim.dimension)) * 8
    + Number(claim.confidence === "high") * 3
    + claim.evidenceIds.length
    + Number(claim.kind === "inference");
}

function themeForFacts(facts: GroundedFact[], dimension: ResearchAnswerDimension) {
  return createClinicalFindingTitle({
    statement: facts.map((fact) => fact.text).join(" "),
    dimension,
    contentTypes: facts.map((fact) => fact.contentType),
  });
}

function implicationForFacts(facts: GroundedFact[], dimension: ResearchAnswerDimension) {
  const basis = facts[0]?.text.replace(/[.]+$/, "") ?? "The documented observation";
  if (facts.some((fact) => fact.contentType === "recommendation")) {
    return `${basis}; this directly affects the action under review.`;
  }
  if (dimension === "limitation") {
    return `${basis}; this limits how confidently the current documents can resolve the research question.`;
  }
  if (dimension === "safety") {
    return `${basis}; this must be weighed against any documented benefit before reaching a conclusion.`;
  }
  if (dimension === "efficacy") {
    return `${basis}; this changes the strength of the documented benefit assessment.`;
  }
  return `${basis}; this changes how the remaining evidence should be interpreted.`;
}

function evidenceIdsForQuestion(question: string, facts: GroundedFact[]) {
  const tokens = salientTerms(question);
  return Array.from(new Set(facts
    .filter((fact) => tokens.some((token) => `${fact.text} ${fact.excerpt}`.toLowerCase().includes(token)))
    .slice(0, 3)
    .map((fact) => fact.evidenceId)));
}

function mostRelevantKnownFact(question: string, facts: GroundedFact[]) {
  const ids = new Set(evidenceIdsForQuestion(question, facts));
  return facts.find((fact) => ids.has(fact.evidenceId))?.text
    ?? "The uploaded documents establish related context but do not resolve this question.";
}

function salientTerms(text: string) {
  const stop = new Set([
    "additional", "answer", "arguing", "assessment", "available", "clinical", "current", "direct",
    "document", "documents", "evidence", "finding", "findings", "information", "patient", "patients",
    "question", "record", "records", "report", "reported", "review", "source", "study", "that",
    "the", "their", "this", "treatment", "whether", "with", "without", "while", "against", "before",
    "after", "older", "younger", "than", "years", "months", "weeks", "during", "into", "onto",
  ]);
  return Array.from(new Set(
    text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)?.filter((token) => !stop.has(token)) ?? [],
  ));
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
