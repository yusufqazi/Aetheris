import type {
  Citation,
  EvidenceRelationship,
  GroundedFact,
  ResearchContradiction,
  ResearchSession,
  StructuredResearchClaim,
} from "@/lib/types";
import { getSessionCitations } from "@/lib/research/evidence-spans";
import {
  areSemanticallyEquivalent,
  buildEvidenceRelationships,
  rankEvidenceRelationships,
  semanticFamily,
  semanticTopics,
} from "@/lib/research/evidence-relationships";
import {
  areDuplicateSupportingPassages,
  areOverlappingClinicalConclusions,
} from "@/lib/research/finding-deduplication";
import { assessEvidenceConfidence } from "@/lib/research/confidence";
import { polishPrimaryAnswerFluency } from "@/lib/research/primary-answer";
import { createClinicalFindingTitle } from "@/lib/research/finding-titles";
import { polishGeneratedFinding } from "@/lib/research/finding-wording";
import {
  assessPrimaryAnswerEvidence,
  buildBestSupportedAnswer,
  isClinicallyMaterialRecommendation,
  isIncompletePrimaryAnswer,
} from "@/lib/research/grounding";
import {
  sameClinicalQuestion,
  sameManagementTarget,
  sameOutcomeQuestion,
} from "@/lib/research/conflict-semantics";
import {
  evidenceNeededForOpenQuestion,
  isClinicallyImportantUncertainty,
  isGenericOpenQuestion,
  isOpenQuestionAnswered,
  openQuestionFromGap,
  openQuestionImpact,
} from "@/lib/research/open-questions";

export type SupportLabel =
  | "Strongly supported"
  | "Moderately supported"
  | "Limited support"
  | "Conflicting evidence"
  | "Insufficient evidence";

export type FindingPriority = "Primary finding" | "Important finding" | "Supporting context";
export type FindingDimension = "efficacy" | "safety" | "limitation" | "context";
export type FindingTheme = string;

export interface InvestigationFinding {
  id: string;
  statement: string;
  evidenceQuery?: string;
  support: SupportLabel;
  sourceCount: number;
  citationIds: string[];
  reasoningType: string;
  priority: FindingPriority;
  priorityScore: number;
  uncertainty: string;
  dimension: FindingDimension;
  theme: FindingTheme;
  relationships: EvidenceRelationship[];
}

export interface InvestigationConflictPosition {
  documentName: string;
  statement: string;
  citationIds: string[];
}

export interface InvestigationConflict {
  id: string;
  statement: string;
  type:
    | "Direct contradiction"
    | "Documentation discrepancy"
    | "Outcome disagreement"
    | "Recommendation disagreement"
    | "Source disagreement"
    | "Benefit-risk tension";
  explanation: string;
  documentNames: string[];
  positions: InvestigationConflictPosition[];
  citationIds: string[];
  relationships: EvidenceRelationship[];
}

export interface InvestigationChange {
  id: string;
  measure: string;
  earlierValue: string;
  laterValue: string;
  interpretation: string;
  citationIds: string[];
  relationships: EvidenceRelationship[];
}

export interface InvestigationQuestion {
  id: string;
  question: string;
  whyUnresolved: string;
  whyItMatters: string;
  known: string;
  missingEvidence: string;
  citationIds: string[];
  relationships: EvidenceRelationship[];
}

export interface InvestigationData {
  directAnswer: string;
  support: SupportLabel;
  supportDescription: string;
  primaryUncertainty: string;
  strongestCitationId: string | null;
  strongestCitationIds: string[];
  citedDocumentCount: number;
  findings: InvestigationFinding[];
  conflicts: InvestigationConflict[];
  changes: InvestigationChange[];
  openQuestions: InvestigationQuestion[];
}

export function buildInvestigationData(session: ResearchSession): InvestigationData {
  const report = session.results?.reportGeneration;
  const intelligence = report?.researchIntelligence;
  const citations = getSessionCitations(session);
  const facts = session.results?.groundedFacts ?? [];
  const focus = questionFocus(session.question);
  const generatedThemes = intelligence?.structuredClaims
    ?.map((claim) => createClinicalFindingTitle({
      statement: claim.conclusion,
      providedTitle: claim.theme,
      dimension: claim.dimension,
    }))
    .filter((theme): theme is string => Boolean(theme)) ?? [];
  const requestedThemes = generatedThemes.length > 0
    ? Array.from(new Set(generatedThemes))
    : requestedFindingThemes(session.question);
  const findingFacts = facts.filter((fact) => {
    const contentType = normalizedContentType(fact);
    if (contentType === "recommendation") {
      return isClinicallyMaterialRecommendation(fact.text);
    }
    if (fact.category === "study-design") {
      return focus.context;
    }
    return (
      contentType === "finding" ||
      contentType === "interaction_concern" ||
      contentType === "safety_observation" ||
      contentType === "longitudinal_change" ||
      contentType === "limitation"
    );
  });
  const conflictFacts = facts.filter((fact) => normalizedContentType(fact) === "discrepancy");
  const changeFacts = facts.filter((fact) => normalizedContentType(fact) === "longitudinal_change");
  const questionFacts = facts.filter((fact) => normalizedContentType(fact) === "unresolved_question");

  const claimFindings = intelligence?.structuredClaims?.length
    ? createInvestigationFindingsFromClaims(intelligence.structuredClaims, citations, facts, session, focus)
    : [];
  const factFindings = createInvestigationFindings(findingFacts, citations, session, focus);
  const selectedFindings = selectQuestionScopedFindings(
    mergeInvestigationFindings([...claimFindings, ...factFindings]),
    requestedThemes,
  );
  const findings = selectedFindings.map((finding) => ({
    ...finding,
    evidenceQuery: finding.statement,
    statement: polishGeneratedFinding(finding.statement, finding.theme),
  }));
  const conflicts = uniqueConflicts([
    ...buildCrossDocumentConflicts(facts, citations),
    ...conflictFacts.map((fact) => conflictFromFact(fact, citations, facts)),
    ...(intelligence?.contradictions ?? [])
      .filter((item) => !looksLongitudinal(`${item.issue} ${item.reconciliation}`))
      .map((item, index) => conflictFromIntelligence(item, index, citations)),
  ])
    .filter(isReviewableConflict)
    .slice(0, 6)
    .map((item) => attachRelationships(item, "conflict", citations, facts, session));
  const changes = uniqueChanges([
    ...changeFacts.flatMap((fact) => changeFromFact(fact, citations)),
    ...(intelligence?.evidenceTrajectory ?? []).flatMap((item, index) => {
      const parsed = parseLongitudinalChange(`${item.label}: ${item.finding}`, item.interpretation);
      return parsed ? [{
        id: `trajectory-change:${index}`,
        ...parsed,
        citationIds: citationIdsForEvidence(item.evidenceIds, citations),
        relationships: [],
      }] : [];
    }),
  ]).slice(0, 8).map((item) => attachRelationships(item, "change", citations, facts, session));
  const openQuestions = createOpenQuestions({
    questionFacts,
    intelligenceQuestions: intelligence?.decisionChangingUnknowns ?? [],
    reportQuestions: report?.recommendedFollowUpQuestions ?? [],
    citations,
    facts,
    session,
  }).slice(0, requestedThemes.length >= 4 ? 8 : 6);
  const citedDocumentCount = new Set(
    findings.flatMap((finding) => finding.citationIds)
      .map((id) => citations.find((citation) => citation.id === id)?.documentId)
      .filter(Boolean),
  ).size;
  const support = primarySupport(findings, conflicts, citedDocumentCount);
  const strongestCitationIds = strongestCrossDocumentCitationIds(findings, citations, requestedThemes);
  const directAnswer = normalizeDirectAnswer(
    intelligence?.directAnswer.trim() || report?.executiveSummary || "The uploaded evidence did not produce a direct answer.",
    facts,
    session.question,
  );

  return {
    directAnswer,
    support,
    supportDescription: supportDescription(support, findings, citedDocumentCount),
    primaryUncertainty: primaryUncertainty(session, facts),
    strongestCitationId: strongestCitationIds[0] ?? null,
    strongestCitationIds,
    citedDocumentCount,
    findings,
    conflicts,
    changes,
    openQuestions,
  };
}

function createInvestigationFindingsFromClaims(
  claims: StructuredResearchClaim[],
  citations: Citation[],
  facts: GroundedFact[],
  session: ResearchSession,
  focus: ReturnType<typeof questionFocus>,
) {
  return claims
    .map((claim) => findingFromStructuredClaim(claim, citations, facts, session, focus))
    .filter((finding) => finding.citationIds.length > 0 && isReviewableFindingStatement(finding.statement))
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .map((finding, index) => ({
      ...finding,
      priority: index === 0
        ? "Primary finding" as const
        : finding.priorityScore >= 5
          ? "Important finding" as const
          : "Supporting context" as const,
    }));
}

function findingFromStructuredClaim(
  claim: StructuredResearchClaim,
  citations: Citation[],
  facts: GroundedFact[],
  session: ResearchSession,
  focus: ReturnType<typeof questionFocus>,
): InvestigationFinding {
  const evidenceIds = Array.from(new Set([...claim.evidenceIds, ...claim.counterEvidenceIds]));
  const claimFacts = facts.filter((fact) => evidenceIds.includes(fact.evidenceId));
  const relationships = buildEvidenceRelationships({
    targetItemId: claim.id,
    targetText: claim.conclusion,
    targetKind: "finding",
    citations,
    facts,
    documents: session.documents,
    aiMappings: session.results?.reportGeneration.researchIntelligence?.evidenceMappings,
  });
  const sourceCount = new Set(relationships.map((relationship) => relationship.documentId)).size;
  const confidence = assessEvidenceConfidence({
    facts: claimFacts,
    evidence: session.evidence.filter((item) => evidenceIds.includes(item.id)),
    counterEvidenceCount: claim.counterEvidenceIds.length,
    includeLimitationsAsSupport: true,
  });
  const combined = claimFacts.map((fact) => `${fact.text} ${fact.excerpt}`).join(" ");
  const priorityScore = findingPriorityScore(
    `${claim.conclusion} ${combined}`,
    sourceCount,
    relationships.length,
    claim.dimension,
    focus,
    claim.priority === "primary",
  );

  return {
    id: claim.id,
    statement: claim.conclusion,
    support: supportFromConfidence(confidence.level, relationships.length),
    sourceCount,
    citationIds: relationships.map((relationship) => relationship.citationId),
    reasoningType: claim.clinicalImplication
      ? `${claim.reasoningSummary} ${claim.clinicalImplication}`
      : claim.reasoningSummary,
    priority: claim.priority === "primary" ? "Primary finding" : "Important finding",
    priorityScore,
    uncertainty: claim.uncertainty,
    dimension: claim.dimension,
    theme: createClinicalFindingTitle({
      statement: claim.conclusion,
      providedTitle: claim.theme,
      dimension: claim.dimension,
      contentTypes: claimFacts.map((fact) => fact.contentType),
    }),
    relationships,
  };
}

function createInvestigationFindings(
  facts: GroundedFact[],
  citations: Citation[],
  session: ResearchSession,
  focus: ReturnType<typeof questionFocus>,
) {
  const eligibleFacts = facts.filter((fact) =>
    !appearsIncompleteSourceText(fact.text, fact.excerpt) &&
    isReviewableFindingStatement(polishFindingStatement(fact.text, fact.excerpt)),
  );
  const groups = groupFactsByMeaning(eligibleFacts);
  const findings = uniqueFindingsByConclusion(groups.map((group) => findingFromFacts(group, citations, session, focus)))
    .sort((left, right) => right.priorityScore - left.priorityScore);
  return findings.map((finding, index) => ({
    ...finding,
    priority: index === 0
      ? "Primary finding" as const
      : finding.priorityScore >= 5
        ? "Important finding" as const
        : "Supporting context" as const,
  }));
}

function mergeInvestigationFindings(findings: InvestigationFinding[]) {
  const merged: InvestigationFinding[] = [];
  for (const finding of findings.sort((left, right) => right.priorityScore - left.priorityScore)) {
    const duplicate = merged.find((candidate) =>
      (
        !statementsOppose(candidate.statement, finding.statement) &&
        areOverlappingClinicalConclusions(candidate.statement, finding.statement)
      ) ||
      (
        candidate.dimension === finding.dimension &&
        !statementsOppose(candidate.statement, finding.statement) &&
        candidate.citationIds.some((citationId) => finding.citationIds.includes(citationId)) &&
        semanticTopics(candidate.statement)
          .filter((topic) => semanticTopics(finding.statement).includes(topic)).length >= 2
      ),
    );
    if (!duplicate) {
      merged.push(finding);
      continue;
    }
    duplicate.relationships = rankEvidenceRelationships(duplicate.statement, Array.from(new Map(
      [...duplicate.relationships, ...finding.relationships].map((relationship) => [relationship.id, relationship]),
    ).values()));
    duplicate.citationIds = duplicate.relationships.map((relationship) => relationship.citationId);
    duplicate.sourceCount = new Set(duplicate.relationships.map((relationship) => relationship.documentId)).size;
    duplicate.priorityScore = Math.max(duplicate.priorityScore, finding.priorityScore);
  }
  return merged;
}

function selectQuestionScopedFindings(
  findings: InvestigationFinding[],
  requestedThemes: FindingTheme[],
) {
  const reviewableFindings = findings
    .filter((finding) => isReviewableFindingStatement(finding.statement))
    .sort(compareFindingPriority);
  const selected: InvestigationFinding[] = [];
  const add = (finding?: InvestigationFinding) => {
    if (!finding || selected.some((item) => item.id === finding.id)) return;
    selected.push(finding);
  };

  const availableThemes = Array.from(new Set(reviewableFindings.map((finding) => finding.theme)));
  const limit = Math.min(10, Math.max(6, availableThemes.length + 1));
  for (const finding of reviewableFindings) {
    if (selected.length >= limit) break;
    const themeCount = selected.filter((item) => item.theme === finding.theme).length;
    if (availableThemes.length > 1 && themeCount >= 2) continue;
    add(finding);
  }

  for (const finding of reviewableFindings) {
    if (selected.length >= limit) break;
    add(finding);
  }

  return selected.map((finding, index) => ({
    ...finding,
    priority: index === 0
      ? "Primary finding" as const
      : requestedThemes.includes(finding.theme) || finding.priorityScore >= 5
        ? "Important finding" as const
        : "Supporting context" as const,
  }));
}

function findingFromFacts(
  facts: GroundedFact[],
  citations: Citation[],
  session: ResearchSession,
  focus: ReturnType<typeof questionFocus>,
  statementOverride?: string,
  primarySummary = false,
): InvestigationFinding {
  const candidateCitationIds = Array.from(new Set(facts.flatMap((fact) => supportingCitationIds(fact, citations))));
  const statement = statementOverride ?? polishFindingStatement(facts[0].text, facts[0].excerpt);
  const id = `finding:${semanticFamily(statement)}:${facts[0].id}`;
  const relationships = buildEvidenceRelationships({
    targetItemId: id,
    targetText: statement,
    targetKind: "finding",
    citations: citations.filter((citation) => candidateCitationIds.includes(citation.id)),
    facts,
    documents: session.documents,
    aiMappings: session.results?.reportGeneration.researchIntelligence?.evidenceMappings,
  });
  const linked = relationships.map((relationship) => relationship.citationId);
  const sourceCount = new Set(relationships.map((relationship) => relationship.documentId)).size;
  const evidenceIds = new Set(relationships.map((relationship) => relationship.evidenceId));
  const confidence = assessEvidenceConfidence({
    facts,
    evidence: session.evidence.filter((item) => evidenceIds.has(item.id)),
    includeLimitationsAsSupport: true,
  });
  const combined = facts.map((fact) => `${fact.text} ${fact.excerpt}`).join(" ");
  const dimension = findingDimension(combined, facts);
  const priorityScore = findingPriorityScore(combined, sourceCount, linked.length, dimension, focus, primarySummary);
  return {
    id,
    statement,
    support: supportFromConfidence(confidence.level, relationships.length),
    sourceCount,
    citationIds: linked,
    reasoningType: facts.every((fact) => normalizedContentType(fact) === "interaction_concern")
      ? "Interaction concern extracted from source evidence"
      : facts.some((fact) => normalizedContentType(fact) === "safety_observation")
        ? "Directly stated safety observation"
        : "Directly stated finding",
    priority: "Important finding",
    priorityScore,
    dimension,
    theme: findingTheme(statement, facts, dimension),
    relationships,
    uncertainty: /may|possible|concern|risk|not prove|uncertain/i.test(combined)
      ? "This is a source-grounded concern, not proof that medication-related harm occurred."
      : "The conclusion remains limited to the uploaded records.",
  };
}

function findingTheme(
  text: string,
  facts: GroundedFact[],
  dimension: FindingDimension,
): FindingTheme {
  const contentTypes = new Set(facts.map(normalizedContentType));
  return createClinicalFindingTitle({
    statement: text,
    dimension,
    contentTypes: Array.from(contentTypes),
  });
}

export function polishFindingStatement(text: string, rawExcerpt = text) {
  let value = text.replace(/\s+/g, " ").trim();
  const tableRow = value.match(/^([A-Z][A-Za-z-]+)(?:\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|mL))?(?:\s+(?:once|twice|daily|weekly|as needed|prn))*\s+(?:active|inactive|current|historical)\s+(.+)$/i);
  if (tableRow) value = `${tableRow[1]} ${tableRow[2]}`;
  const severityChange = value.match(/^([A-Z][A-Za-z /_-]{2,70}?)\s+(?:none|mild|moderate|severe|low|medium|high)(?:,\s*|\s+)[A-Za-z ,/-]*?\s+(?:none|mild|moderate|severe|low|medium|high)\s+(?:about|approximately|roughly)?\s*(\d+(?:\.\d+)?)%\s+(improved|reduced|decreased|worsened|increased)\b/i);
  if (severityChange) {
    const direction = /worsened|increased/i.test(severityChange[3]) ? "worsened" : "improved";
    value = `${severityChange[1].trim()} ${direction} by approximately ${severityChange[2]}% during follow-up`;
  }
  value = value
    .replace(/\b(\w+)\s+\1\b/gi, "$1")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
  if (!value && rawExcerpt.trim()) value = rawExcerpt.replace(/\s+/g, " ").trim();
  return `${value.replace(/[.]+$/, "")}.`;
}

function findingPriorityScore(
  text: string,
  sourceCount: number,
  evidenceCount: number,
  dimension: FindingDimension,
  focus: ReturnType<typeof questionFocus>,
  primarySummary: boolean,
) {
  const diagnosis = /\b(?:leading|primary|most likely|best[- ]supported)\s+diagnos|\bdiagnos(?:is|tic)\b.{0,80}\b(?:support|confirm|indicat|consistent)|\b(?:support|confirm|indicat)\w*\b.{0,80}\bdiagnos/i.test(text);
  const treatmentDecision = /\b(?:recommend|prioriti[sz]|proceed|initiat|administer|defer|delay|withhold|hold|stop|discontinu|start|begin|avoid|source control|urgent intervention)\w*\b/i.test(text);
  const objectiveEvidence = /\b(?:laborator|biomarker|imaging|patholog|biopsy|culture|antibod|serolog|creatinine|proteinuria|hematuria|complement|ejection fraction|blood pressure|lactate|oxygen|ct|mri)\w*\b/i.test(text) ||
    /\b\d+(?:\.\d+)?\s*(?:%|mg\/dL|g\/dL|ng\/mL|mmol\/L|mEq\/L|U\/L|mmHg|bpm|ms|mL\/min)\b/i.test(text);
  const clinicalOutcome = /\b(?:mortality|survival|response|remission|progress|worsen|improv|stabili[sz]|resolved|recur|adverse event|complication)\w*\b/i.test(text);
  const patientPreference = /\b(?:patient|family|caregiver)\b.{0,80}\b(?:prefer|preference|wish|wants?|request|declin|hesitan|comfortable|agreeable)\w*\b|\b(?:prefer|preference|wish|wants?|request)\w*\b.{0,80}\b(?:patient|family|caregiver)\b/i.test(text);
  const backgroundContext = /\b(?:background|history of|family history|social history|demographic|living situation|employment|marital status)\b/i.test(text);
  const sharedQuestionTopics = semanticTopics(text)
    .filter((topic) => focus.questionTopics.includes(topic)).length;

  let score = 0;
  if (diagnosis) score += focus.diagnosis ? 14 : 8;
  if (treatmentDecision) score += focus.treatment ? 12 : 7;
  if (objectiveEvidence) score += 6;
  if (clinicalOutcome) score += 5;
  if (dimension === "efficacy" && focus.efficacy) score += 4;
  if (dimension === "safety" && focus.safety) score += 4;
  if (dimension === "limitation" && focus.limitations) score += 3;
  if (/\b(?:critical|severe|contraindicat|urgent|immediate|high risk|major concern)\b/i.test(text)) score += 4;
  score += Math.min(6, sharedQuestionTopics * 2);
  score += Math.min(2, sourceCount);
  score += evidenceCount > 1 ? 1 : 0;
  if (primarySummary) score += 1;
  if (dimension === "limitation" && !focus.limitations) score -= 2;
  if (backgroundContext) score -= 5;
  if (patientPreference) score -= 8;
  return score;
}

function compareFindingPriority(left: InvestigationFinding, right: InvestigationFinding) {
  return right.priorityScore - left.priorityScore ||
    right.sourceCount - left.sourceCount ||
    left.statement.localeCompare(right.statement);
}

function findingDimension(text: string, facts: GroundedFact[]): FindingDimension {
  if (facts.some((fact) => normalizedContentType(fact) === "limitation") || /\b(?:unresolved|not excluded|missing evidence|not established|cannot determine|insufficient evidence)\b/i.test(text)) {
    return "limitation";
  }
  if (facts.some((fact) => normalizedContentType(fact) === "interaction_concern" || normalizedContentType(fact) === "safety_observation")) {
    return "safety";
  }
  if (facts.some((fact) => fact.category === "efficacy" || fact.category === "statistical")) {
    return "efficacy";
  }
  if (/\b(?:improv|increase|decrease|response|benefit|outcome|progress|resolve|recur|stabil)\w*\b/i.test(text)) return "efficacy";
  return "context";
}

function lowercaseLeading(value: string) {
  if (!value || /^[A-Z]{2}/.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function normalizedContentType(fact: GroundedFact) {
  if (fact.contentType) return fact.contentType;
  if (fact.category === "interaction") return "interaction_concern" as const;
  if (fact.category === "safety") return "safety_observation" as const;
  if (fact.category === "limitation" || fact.category === "exclusion") return "limitation" as const;
  return "finding" as const;
}

function conflictFromFact(
  fact: GroundedFact,
  citations: Citation[],
  facts: GroundedFact[],
): InvestigationConflict {
  const related = facts.filter((candidate) =>
    candidate.id !== fact.id &&
    candidate.documentId !== fact.documentId &&
    factsComparable(fact, candidate),
  ).slice(0, 1);
  const positions = [fact, ...related].map((candidate) => ({
    documentName: candidate.documentName,
    statement: candidate.text,
    citationIds: supportingCitationIds(candidate, citations),
  }));
  return {
    id: fact.id,
    statement: concreteConflictStatement(fact.text, positions),
    type: conflictType(fact.text),
    explanation: conflictImpact(fact.text),
    documentNames: Array.from(new Set(positions.map((position) => position.documentName))),
    positions,
    citationIds: Array.from(new Set(positions.flatMap((position) => position.citationIds))),
    relationships: [],
  };
}

function conflictFromIntelligence(
  item: ResearchContradiction,
  index: number,
  citations: Citation[],
): InvestigationConflict {
  const citationIds = citationIdsForEvidence(item.evidenceIds, citations);
  const sourceCitations = citationIds
    .map((id) => citations.find((citation) => citation.id === id))
    .filter((citation): citation is Citation => Boolean(citation));
  const documentNames = Array.from(new Set(sourceCitations.map((citation) => citation.documentName)));
  const positions = item.sourcePositions.slice(0, 4).map((statement, positionIndex) => {
    const matchedCitation = sourceCitations.find((citation) =>
      areSemanticallyEquivalent(citation.exactQuote ?? citation.excerpt, statement),
    );
    const documentName = matchedCitation?.documentName
      ?? documentNames[positionIndex]
      ?? documentNames[0]
      ?? "Uploaded source";
    return {
      documentName,
      statement,
      citationIds: sourceCitations
        .filter((citation) => citation.documentName === documentName)
        .map((citation) => citation.id),
    };
  });
  return {
    id: `intelligence-conflict:${index}`,
    statement: concreteConflictStatement(item.issue, positions),
    type: conflictType(`${item.issue} ${item.sourcePositions.join(" ")}`),
    explanation: item.impact || item.reconciliation,
    documentNames,
    positions,
    citationIds,
    relationships: [],
  };
}

function buildCrossDocumentConflicts(facts: GroundedFact[], citations: Citation[]) {
  const candidates = facts.filter((fact) =>
    !["unresolved_question", "evidence_excerpt", "discrepancy", "longitudinal_change"].includes(normalizedContentType(fact)),
  );
  const conflicts: InvestigationConflict[] = [];

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (left.documentId === right.documentId) continue;
      const comparison = compareConflictPair(left, right) ?? compareDecisionRiskTradeoff(left, right);
      if (!comparison) continue;
      const positions = [left, right].map((fact) => ({
        documentName: fact.documentName,
        statement: fact.text,
        citationIds: supportingCitationIds(fact, citations),
      }));
      const citationIds = Array.from(new Set(positions.flatMap((position) => position.citationIds)));
      if (citationIds.length < 2) continue;
      conflicts.push({
        id: `cross-document-conflict:${left.id}:${right.id}`,
        statement: comparison.statement,
        type: comparison.type,
        explanation: comparison.explanation,
        documentNames: positions.map((position) => position.documentName),
        positions,
        citationIds,
        relationships: [],
      });
    }
  }

  return conflicts;
}

function compareDecisionRiskTradeoff(left: GroundedFact, right: GroundedFact) {
  const leftText = `${left.text} ${left.excerpt}`;
  const rightText = `${right.text} ${right.excerpt}`;
  const leftRecommends = normalizedContentType(left) === "recommendation" || Boolean(recommendationAction(leftText));
  const rightRecommends = normalizedContentType(right) === "recommendation" || Boolean(recommendationAction(rightText));
  const leftConcern = isMaterialConcern(leftText);
  const rightConcern = isMaterialConcern(rightText);

  const action = leftRecommends && recommendationAction(leftText) === "proceed" && rightConcern
    ? left
    : rightRecommends && recommendationAction(rightText) === "proceed" && leftConcern
      ? right
      : null;
  const concern = action === left ? right : action === right ? left : null;
  if (!action || !concern || !sameManagementTarget(leftText, rightText)) return null;

  return {
    type: "Benefit-risk tension" as const,
    statement: `${action.documentName} supports ${lowercaseLeading(polishFindingStatement(action.text))} By comparison, ${concern.documentName} documents ${lowercaseLeading(polishFindingStatement(concern.text))}`,
    explanation: "The sources emphasize competing decision priorities: the proposed action may provide benefit or stabilization, while the documented risk may require a more cautious implementation or an alternative approach.",
  };
}

function compareConflictPair(left: GroundedFact, right: GroundedFact) {
  const leftText = `${left.text} ${left.excerpt}`;
  const rightText = `${right.text} ${right.excerpt}`;
  const leftPolarity = evidencePolarity(leftText);
  const rightPolarity = evidencePolarity(rightText);
  const sourceRolesDiffer = sourceRole(left) !== sourceRole(right) && sourceRole(left) !== "other" && sourceRole(right) !== "other";
  const leftAction = recommendationAction(leftText);
  const rightAction = recommendationAction(rightText);

  if (
    sameManagementTarget(leftText, rightText) &&
    ((leftAction && rightAction && recommendationActionsConflict(leftAction, rightAction)) ||
      (recommendationStance(leftText) && recommendationStance(rightText) && recommendationStance(leftText) !== recommendationStance(rightText)))
  ) {
    return {
      type: "Recommendation disagreement" as const,
      statement: `${left.documentName} states ${lowercaseLeading(polishFindingStatement(left.text))} In contrast, ${right.documentName} states ${lowercaseLeading(polishFindingStatement(right.text))}`,
      explanation: "The recommended next step depends on which source context applies, so the two recommendations should not be combined into one instruction.",
    };
  }
  if (
    sameOutcomeQuestion(leftText, rightText) &&
    isEfficacyFact(left) &&
    isEfficacyFact(right) &&
    leftPolarity &&
    rightPolarity &&
    leftPolarity !== rightPolarity
  ) {
    return {
      type: sourceRolesDiffer ? "Source disagreement" as const : "Outcome disagreement" as const,
      statement: `${left.documentName} reports ${lowercaseLeading(polishFindingStatement(left.text))} In contrast, ${right.documentName} reports ${lowercaseLeading(polishFindingStatement(right.text))}`,
      explanation: sourceRolesDiffer
        ? "The conclusion changes depending on whether the sponsor, protocol, follow-up, or independent assessment is given greater weight."
        : "The treatment effect is not consistent across the compared sources, so one result should not be presented as universally representative.",
    };
  }
  if (sameManagementTarget(leftText, rightText)) {
    const efficacy = isEfficacyFact(left) && leftPolarity === "positive" ? left
      : isEfficacyFact(right) && rightPolarity === "positive" ? right
        : null;
    const safety = isSafetyFact(left) && leftPolarity === "negative" ? left
      : isSafetyFact(right) && rightPolarity === "negative" ? right
        : null;
    if (efficacy && safety) {
      return {
        type: "Benefit-risk tension" as const,
        statement: `${efficacy.documentName} reports efficacy improvement, while ${safety.documentName} documents a worsening or clinically relevant safety burden.`,
        explanation: "The efficacy signal and safety burden must be interpreted together; improvement on an outcome does not establish that the overall benefit-risk profile is favorable.",
      };
    }

    const proceeding = leftAction === "proceed" ? left : rightAction === "proceed" ? right : null;
    const concern = proceeding === left && isMaterialConcern(rightText) ? right
      : proceeding === right && isMaterialConcern(leftText) ? left
        : null;
    if (proceeding && concern) {
      return {
        type: "Benefit-risk tension" as const,
        statement: `${proceeding.documentName} supports proceeding, while ${concern.documentName} documents ${lowercaseLeading(polishFindingStatement(concern.text))}`,
        explanation: "The sources emphasize competing decision priorities: the expected benefit or urgency supports action, while the documented constraint may change how, when, or whether that action is undertaken.",
      };
    }

  }
  return null;
}

function isMaterialConcern(text: string) {
  return /\b(?:risk|hazard|contraindicat\w*|unsafe|complications?|worsen\w*|deteriorat\w*|overload|edema|toxicity|bleed(?:ing)?|arrhythmia|adverse event|infeasible|technically difficult|high technical risk|safety concern)\b/i.test(text);
}

function concreteConflictStatement(
  issue: string,
  positions: InvestigationConflictPosition[],
) {
  const value = issue.trim();
  const generic = /^(?:documentation discrepancy|potential contradiction|conflict|inconsistency|source disagreement|outcome disagreement)[.!]?$/i.test(value);
  if (!generic || positions.length < 2) return value;
  const [left, right] = positions;
  return `${left.documentName} states ${lowercaseLeading(polishFindingStatement(left.statement))} In contrast, ${right.documentName} states ${lowercaseLeading(polishFindingStatement(right.statement))}`;
}

function changeFromFact(fact: GroundedFact, citations: Citation[]): InvestigationChange[] {
  const parsed = parseLongitudinalChange(fact.text);
  return parsed ? [{ id: fact.id, ...parsed, citationIds: supportingCitationIds(fact, citations), relationships: [] }] : [];
}

function parseLongitudinalChange(text: string, suppliedInterpretation?: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const paired = normalized.match(/^(.{2,55}?)\s+(?:improved|decreased|declined|increased|rose|fell|changed|normalized)?\s*from\s+([-+]?\d+(?:\.\d+)?(?:\s*[A-Za-z/%]+)?)\s+to\s+([-+]?\d+(?:\.\d+)?(?:\s*[A-Za-z/%]+)?)/i)
    ?? normalized.match(/^([A-Za-z][A-Za-z0-9 /_-]{1,35}?)\s+([-+]?\d+(?:\.\d+)?)\s+(?:to|→|->)\s+([-+]?\d+(?:\.\d+)?)/i)
    ?? normalized.match(/^([A-Za-z][A-Za-z /_-]{1,30}?)\s+([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)$/i);
  if (paired) {
    const measure = paired[1].replace(/^(?:follow-up|baseline|initial)\s+/i, "").replace(/[:\-]+$/, "").trim();
    return {
      measure,
      earlierValue: paired[2].trim(),
      laterValue: paired[3].trim(),
      interpretation: suppliedInterpretation || directionalInterpretation(paired[2], paired[3]),
    };
  }

  const persisted = normalized.match(/^(.{2,45}?)\s+(?:were?\s+)?(reduced|improved|decreased)\b.{0,55}\b(?:but|while)\b.{0,20}\b(persisted|remained)\b/i);
  if (persisted) {
    return {
      measure: persisted[1].replace(/^(?:follow-up|later)\s+/i, "").trim(),
      earlierValue: "Present",
      laterValue: `${capitalize(persisted[2])} but ${persisted[3]}`,
      interpretation: suppliedInterpretation || "The signal improved over time but did not fully resolve.",
    };
  }
  return null;
}

function supportingCitationIds(fact: GroundedFact, citations: Citation[]) {
  const claimSpecific = citations
    .filter((citation) => citation.supportedClaimIds?.includes(fact.id))
    .map((citation) => citation.id);
  const direct = claimSpecific.length > 0
    ? claimSpecific
    : citationIdsForEvidence([fact.evidenceId], citations);
  return Array.from(new Set(direct));
}

function citationIdsForEvidence(evidenceIds: string[], citations: Citation[]) {
  return citations
    .filter((citation) => evidenceIds.includes(citation.evidenceId) || evidenceIds.includes(citation.chunkId))
    .map((citation) => citation.id);
}

function conflictType(text: string): InvestigationConflict["type"] {
  if (/direct contradiction|cannot both|mutually exclusive/i.test(text)) return "Direct contradiction";
  if (/recommend|should|avoid|contraindicat/i.test(text)) return "Recommendation disagreement";
  if (/benefit|risk|concern|tradeoff|trade-off|worsen|complication|constraint/i.test(text)) return "Benefit-risk tension";
  if (/sponsor|independent|protocol|follow-up report/i.test(text)) return "Source disagreement";
  if (/efficacy|endpoint|outcome|improv|benefit|response/i.test(text)) return "Outcome disagreement";
  if (/document|record|note|history|reported|described|frequency/i.test(text)) return "Documentation discrepancy";
  return "Documentation discrepancy";
}

function conflictImpact(text: string) {
  if (/frequency|timing|how often|adherence/i.test(text)) {
    return "The actual exposure frequency changes how strongly the medication-related risk or absorption concern should influence the conclusion.";
  }
  if (/recommend|should|avoid|contraindicat/i.test(text)) {
    return "The sources imply different actions, so their populations, timing, and evidentiary roles must be reconciled before either recommendation is applied.";
  }
  if (/efficacy|endpoint|outcome|improv|benefit|response/i.test(text)) {
    return "The estimated treatment effect depends on which source is used, preventing a single unqualified efficacy conclusion.";
  }
  return "The sources describe the same subject differently, which limits how confidently that detail can be used in the final interpretation.";
}

function factsComparable(left: GroundedFact, right: GroundedFact) {
  const leftText = `${left.text} ${left.excerpt}`;
  const rightText = `${right.text} ${right.excerpt}`;
  return sameClinicalQuestion(leftText, rightText);
}

function comparisonTokens(text: string) {
  const stopWords = new Set([
    "study", "trial", "report", "document", "patient", "patients", "treatment", "group", "source",
    "finding", "findings", "showed", "reported", "observed", "significant", "effect", "outcome",
    "recommend", "recommended", "should", "proceed", "continue", "start", "begin", "delay",
    "defer", "hold", "stop", "avoid", "monitor", "management", "clinical", "evidence",
  ]);
  return Array.from(new Set(
    text.toLowerCase().match(/[a-z]+-?\d+|[a-z]{4,}/g)
      ?.filter((token) => !stopWords.has(token)) ?? [],
  ));
}

function evidencePolarity(text: string) {
  if (/did not|no (?:meaningful|significant|clear)|failed|negative|inferior|worsen|increased (?:risk|adverse|toxicity)|higher (?:risk|adverse|toxicity)|serious adverse/i.test(text)) {
    return "negative" as const;
  }
  if (/improv|benefit|positive|met (?:the )?endpoint|superior|response|decreased .{0,24}(?:disease|symptom|score|pain)|reduced .{0,24}(?:disease|symptom|score|pain)/i.test(text)) {
    return "positive" as const;
  }
  return null;
}

function recommendationStance(text: string) {
  if (/not recommend|should not|avoid|contraindicat|do not use/i.test(text)) return "against" as const;
  if (/recommend|should|support(?:s|ed)? use|consider/i.test(text)) return "for" as const;
  return null;
}

type RecommendationAction = "proceed" | "delay" | "stop" | "restrict" | "monitor";

function recommendationAction(text: string): RecommendationAction | null {
  if (/\b(?:delay(?:ed|ing)?|defer(?:red|ring)?|postpone(?:d|ment)?|hold(?:ing)?|held|withhold(?:ing)?|withheld|wait before|not yet)\b/i.test(text)) return "delay";
  if (/\b(?:stop(?:ped|ping)?|discontinu(?:e|ed|ing|ation)|cease(?:d)?|do not use|avoid(?:ed|ing)?|contraindicat|not recommend)\b/i.test(text)) return "stop";
  if (/\b(?:restrict|lower starting dose|dose reduction|limited indication|conditional)\b/i.test(text)) return "restrict";
  if (/\b(?:monitor|surveillance|repeat|recheck|follow-up testing)\b/i.test(text)) return "monitor";
  if (/\b(?:start(?:ed|ing)?|initiat(?:e|ed|ing|ion)|begin|began|continue(?:d|ing)?|proceed(?:ed|ing)?|approve(?:d|s)?|recommend(?:s|ed)?|support(?:s|ed)? use)\b/i.test(text)) return "proceed";
  return null;
}

function recommendationActionsConflict(left: RecommendationAction, right: RecommendationAction) {
  if (left === right) return false;
  return (
    (left === "proceed" && ["delay", "stop", "restrict"].includes(right)) ||
    (right === "proceed" && ["delay", "stop", "restrict"].includes(left)) ||
    (left === "stop" && ["delay", "restrict"].includes(right)) ||
    (right === "stop" && ["delay", "restrict"].includes(left))
  );
}

function statementsOppose(left: string, right: string) {
  const leftAction = recommendationAction(left);
  const rightAction = recommendationAction(right);
  if (leftAction && rightAction && recommendationActionsConflict(leftAction, rightAction)) return true;
  const leftPolarity = evidencePolarity(left);
  const rightPolarity = evidencePolarity(right);
  return Boolean(leftPolarity && rightPolarity && leftPolarity !== rightPolarity);
}

function sourceRole(fact: GroundedFact) {
  const value = `${fact.documentName} ${fact.text}`;
  if (/sponsor|manufacturer/i.test(value)) return "sponsor";
  if (/independent|external review/i.test(value)) return "independent";
  if (/protocol/i.test(value)) return "protocol";
  if (/follow-up|final report/i.test(value)) return "follow-up";
  return "other";
}

function isEfficacyFact(fact: GroundedFact) {
  return fact.category === "efficacy" || fact.category === "statistical";
}

function isSafetyFact(fact: GroundedFact) {
  return fact.category === "safety" || fact.category === "interaction" || normalizedContentType(fact) === "safety_observation";
}

function primarySupport(findings: InvestigationFinding[], conflicts: InvestigationConflict[], documentCount: number): SupportLabel {
  if (findings.length === 0) return "Insufficient evidence";
  if (conflicts.some((item) => [
    "Direct contradiction",
    "Outcome disagreement",
    "Recommendation disagreement",
    "Source disagreement",
  ].includes(item.type))) return "Conflicting evidence";
  if (findings.some((item) => item.support === "Strongly supported") && documentCount >= 2) {
    return "Strongly supported";
  }
  if (findings.some((item) => item.support === "Moderately supported")) return "Moderately supported";
  if (findings.some((item) => item.support === "Limited support")) return "Limited support";
  return "Insufficient evidence";
}

function supportFromConfidence(
  confidence: "low" | "medium" | "high",
  relationshipCount: number,
): SupportLabel {
  if (relationshipCount === 0) return "Insufficient evidence";
  if (confidence === "high") return "Strongly supported";
  if (confidence === "medium") return "Moderately supported";
  return "Limited support";
}

function supportDescription(label: SupportLabel, findings: InvestigationFinding[], documentCount: number) {
  const basis = `${findings.length} distinct, directly sourced finding${findings.length === 1 ? "" : "s"}`;
  return {
    "Strongly supported": `Supported by consistent ${basis} across multiple documents.`,
    "Moderately supported": `Supported by ${basis}${documentCount > 1 ? " across more than one document" : ""}, with important evidence still unresolved.`,
    "Limited support": `Only a narrow portion of the uploaded evidence directly supports this conclusion.`,
    "Conflicting evidence": `Directly relevant records support different interpretations of the conclusion.`,
    "Insufficient evidence": "The uploaded evidence does not support a reviewable conclusion.",
  }[label];
}

function questionFocus(question: string) {
  return {
    diagnosis: /diagnos|etiology|cause|leading interpretation|best supported|most likely/i.test(question),
    treatment: /treat|management|therapy|medication|priority|recommend|proceed|begin|start|defer|delay|hold|stop|decision/i.test(question),
    efficacy: /efficacy|effective|response|respond|improv|benefit|outcome|treatment/i.test(question),
    safety: /safety|safe|adverse|risk|harm|interaction|medication/i.test(question),
    limitations: /limitation|uncertain|missing|unresolved|caveat|weakness|gap|generaliz|durab|long[- ]term|regulatory readiness|approval decision/i.test(question),
    interactions: /interaction|contraindication|coadmin|medication|drug/i.test(question),
    context: /population|design|protocol|method|eligib|generaliz|context|background|compare|difference/i.test(question),
    questionTopics: semanticTopics(question),
  };
}

export function requestedFindingThemes(question: string): FindingTheme[] {
  const themes: FindingTheme[] = [];
  const add = (theme: FindingTheme) => {
    if (!themes.includes(theme)) themes.push(theme);
  };
  if (/efficacy|effective|response|respond|improv|benefit|outcome|treatment effect/i.test(question)) add("Efficacy");
  if (/safety|safe|adverse|risk|harm|tolerab|fall|toxicity/i.test(question)) add("Safety");
  if (/durab|sustain|long[- ]term|persist(?:ence|ent)|maintain(?:ed)? benefit/i.test(question)) add("Durability");
  if (/generaliz|external validity|broader population|real[- ]world|representative|excluded population/i.test(question)) add("Generalizability");
  if (/interaction|contraindication|coadmin|concomitant|medication combination|drug combination/i.test(question)) add("Drug interactions");
  if (/monitor|surveillance|follow-up testing|ecg|laboratory follow-up/i.test(question)) add("Monitoring");
  if (/regulator|approval|indication|label(?:ing)?|readiness|starting dose|dosing strategy/i.test(question)) add("Regulatory considerations");
  if (/limitation|uncertain|missing|unresolved|caveat|weakness|gap|evidence still needed|before .*decision/i.test(question)) add("Study limitations");
  return themes;
}

function groupFactsByMeaning(facts: GroundedFact[]) {
  const groups: GroundedFact[][] = [];
  for (const fact of facts) {
    const existing = groups.find((group) =>
      !statementsOppose(group[0].text, fact.text) &&
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

function appearsIncompleteSourceText(text: string, excerpt: string) {
  const value = text.replace(/\s+/g, " ").trim();
  if (/\.\.\.|…/.test(value)) return true;
  if (/\b(?:and|or|that|which|because|with|from|to|of|frequent|initial|early|later|higher|lower|provided|including|following)\s*[,:;.-]*$/i.test(value)) return true;
  if (/\bstudy\b.*\benrolling\b.*\b(?:chronic|acute|neuropathic|clinical|moderate|severe)\s*[.]*$/i.test(value)) return true;
  return /^(?:the\s+)?(?:first|second|third)\s+concern\s+is\s+that\b/i.test(value) && !/[.!?]$/.test(excerpt.trim());
}

function isReviewableFindingStatement(statement: string) {
  const value = statement.replace(/\s+/g, " ").trim();
  const words = value.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? [];
  if (words.length < 5 || appearsIncompleteSourceText(value, value)) return false;
  const hasPredicate = /\b(?:is|are|was|were|has|have|had|show(?:s|ed)?|report(?:s|ed)?|demonstrat(?:e|es|ed)|improv(?:e|es|ed|ement)|reduc(?:e|es|ed|tion)|increas(?:e|es|ed)|decreas(?:e|es|ed)|remain(?:s|ed)?|persist(?:s|ed)?|extend(?:s|ed)?|fail(?:s|ed)?|meet(?:s)?|support(?:s|ed)?|suggest(?:s|ed)?|indicat(?:e|es|ed)|limit(?:s|ed)?|exclud(?:e|es|ed)|recommend(?:s|ed)?|may|might|can|could|should|would)\b/i.test(value);
  const hasComparison = /\b\d+(?:\.\d+)?\s*(?:%|mg|g\/dL|ng\/mL|ms|weeks?|months?)\b.{0,50}\b(?:versus|vs\.?|compared|from|to|higher|lower)\b/i.test(value);
  const hasAssessment = words.length >= 7 && /\b(?:concern|risk|evidence|signal|association|limitation)\b/i.test(value);
  if (!hasPredicate && !hasComparison && !hasAssessment) return false;
  const titleWords = words.filter((word) => /^[A-Z][A-Za-z-]*$/.test(word)).length;
  return !(words.length <= 7 && titleWords / words.length >= 0.7 && !hasComparison);
}

function isReviewableConflict(conflict: InvestigationConflict) {
  if (/^(?:documentation discrepancy|potential contradiction|conflict|inconsistency|source disagreement|outcome disagreement)[.!]?$/i.test(conflict.statement.trim())) {
    return false;
  }
  const positionDocuments = new Set(conflict.positions.map((position) => position.documentName));
  return conflict.positions.length >= 2 && positionDocuments.size >= 2 && conflict.citationIds.length >= 2;
}

function attachRelationships<T extends InvestigationConflict | InvestigationChange>(
  item: T,
  targetKind: "conflict" | "change",
  citations: Citation[],
  facts: GroundedFact[],
  session: ResearchSession,
) {
  const targetText = "statement" in item
    ? `${item.statement} ${item.explanation} ${item.positions.map((position) => position.statement).join(" ")}`
    : `${item.measure} ${item.earlierValue} to ${item.laterValue}`;
  const relationships = buildEvidenceRelationships({
    targetItemId: item.id,
    targetText,
    targetKind,
    citations: citations.filter((citation) => item.citationIds.includes(citation.id)),
    facts,
    documents: session.documents,
    aiMappings: session.results?.reportGeneration.researchIntelligence?.evidenceMappings,
  });
  return {
    ...item,
    citationIds: Array.from(new Set([
      ...item.citationIds,
      ...relationships.map((relationship) => relationship.citationId),
    ])),
    relationships,
  };
}

function strongestCrossDocumentCitationIds(
  findings: InvestigationFinding[],
  citations: Citation[],
  requestedThemes: FindingTheme[],
) {
  const selected: string[] = [];
  const documents = new Set<string>();
  const add = (finding: InvestigationFinding, preferNewDocument: boolean) => {
    const citation = finding.citationIds
      .map((citationId) => citations.find((item) => item.id === citationId))
      .find((item) =>
        item &&
        !selected.includes(item.id) &&
        !selected.some((selectedId) => {
          const selectedCitation = citations.find((candidate) => candidate.id === selectedId);
          if (!selectedCitation) return false;
          const sameSourcePage = selectedCitation.documentId === item.documentId &&
            selectedCitation.page === item.page;
          return areDuplicateSupportingPassages(
            selectedCitation.exactQuote ?? selectedCitation.excerpt,
            item.exactQuote ?? item.excerpt,
            sameSourcePage,
          );
        }) &&
        (!preferNewDocument || !documents.has(item.documentId)),
      );
    if (!citation || selected.includes(citation.id)) return false;
    selected.push(citation.id);
    documents.add(citation.documentId);
    return true;
  };

  for (const theme of requestedThemes) {
    const candidates = findings.filter((finding) => finding.theme === theme);
    candidates.some((finding) => add(finding, true));
    if (selected.length === 4) return selected;
  }
  for (const finding of findings) {
    add(finding, true);
    if (selected.length === 4) return selected;
  }
  for (const finding of findings) {
    add(finding, false);
    if (selected.length === 4) return selected;
  }
  return selected;
}

function normalizeDirectAnswer(answer: string, facts: GroundedFact[], question: string) {
  const value = polishPrimaryAnswerFluency(answer);
  const malformed = /^(?:on\s+\w+|factors?\s+(?:arguing|for|against)|findings?|summary|primary answer)\s*[:,]/i.test(value);
  const sourceText = facts.map((fact) => `${fact.text} ${fact.excerpt}`).join(" ").toLowerCase();
  const unsupportedCertainty = /\b(?:significant|demonstrated|definitive|conclusive)\b/i.test(value) &&
    !/\b(?:significant|demonstrated|definitive|conclusive)\b/i.test(sourceText);
  const unsupportedEfficacyClaim = /\bdemonstrated\b.{0,80}\befficacy\b/i.test(value);
  const groundedSynthesis = polishPrimaryAnswerFluency(buildBestSupportedAnswer(question, facts));
  if (assessPrimaryAnswerEvidence(question, facts).evidenceLimited) {
    return groundedSynthesis;
  }
  const hasSupportedSynthesis = !isIncompletePrimaryAnswer(groundedSynthesis);
  const prematurelyIncomplete = isIncompletePrimaryAnswer(value) && hasSupportedSynthesis;
  if (
    !malformed &&
    !unsupportedCertainty &&
    !unsupportedEfficacyClaim &&
    !prematurelyIncomplete &&
    value.length >= 40 &&
    /[.!?]$/.test(value)
  ) {
    return value;
  }
  if (hasSupportedSynthesis) return groundedSynthesis;
  const fallback = facts
    .map((fact) => polishFindingStatement(fact.text, fact.excerpt))
    .find((statement) => isReviewableFindingStatement(statement));
  return polishPrimaryAnswerFluency(fallback
    ? `The strongest supported conclusion is that ${lowercaseLeading(fallback)} Remaining uncertainty should be interpreted separately from this established finding.`
    : "The uploaded documents do not contain enough complete, directly extractable evidence to answer the research question reliably.");
}

function primaryUncertainty(session: ResearchSession, facts: GroundedFact[]) {
  void facts;
  return session.results?.reportGeneration.researchIntelligence?.strongestCounterpoint.trim()
    || session.results?.reportGeneration.risksAndUncertainties[0]
    || session.results?.debateConsensus.missingEvidence[0]
    || "The conclusion is limited to the uploaded source set.";
}

function directionalInterpretation(earlier: string, later: string) {
  const first = Number.parseFloat(earlier);
  const second = Number.parseFloat(later);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return "The later record documents a measurable change.";
  if (second > first) return "The measured value increased on the later observation.";
  if (second < first) return "The measured value decreased on the later observation.";
  return "The measured value remained stable across observations.";
}

function uniqueFindingsByConclusion(items: InvestigationFinding[]) {
  const accepted: InvestigationFinding[] = [];
  for (const item of items) {
    if (!item.statement.trim()) continue;
    const duplicate = accepted.find((candidate) =>
      !statementsOppose(candidate.statement, item.statement) &&
      areOverlappingClinicalConclusions(candidate.statement, item.statement),
    );
    if (!duplicate) {
      accepted.push(item);
      continue;
    }

    duplicate.relationships = rankEvidenceRelationships(
      duplicate.statement,
      [...duplicate.relationships, ...item.relationships],
    );
    duplicate.citationIds = duplicate.relationships.map((relationship) => relationship.citationId);
    duplicate.sourceCount = new Set(
      duplicate.relationships.map((relationship) => relationship.documentId),
    ).size;
    duplicate.priorityScore = Math.max(duplicate.priorityScore, item.priorityScore);
  }
  return accepted;
}

function uniqueConflicts(items: InvestigationConflict[]) {
  const accepted: InvestigationConflict[] = [];
  for (const item of items) {
    const duplicateIndex = accepted.findIndex((candidate) =>
      areSemanticallyEquivalent(candidate.statement, item.statement) ||
      conflictsDescribeSameDisagreement(candidate, item),
    );
    if (duplicateIndex === -1) {
      accepted.push(item);
      continue;
    }
    accepted[duplicateIndex] = mergeDuplicateConflicts(accepted[duplicateIndex], item);
  }
  return accepted;
}

function conflictsDescribeSameDisagreement(
  left: InvestigationConflict,
  right: InvestigationConflict,
) {
  const matches = left.positions.flatMap((leftPosition) =>
    right.positions
      .filter((rightPosition) =>
        sameConflictSide(leftPosition.statement, rightPosition.statement) &&
        sameClinicalQuestion(leftPosition.statement, rightPosition.statement),
      )
      .map(() => conflictSide(leftPosition.statement)),
  );
  const matchedSides = new Set(matches.filter((side) => side !== "neutral"));
  if (matchedSides.size >= 2) return true;

  const leftDocuments = new Set(left.documentNames);
  const sharedDocumentCount = right.documentNames.filter((name) => leftDocuments.has(name)).length;
  return sharedDocumentCount >= 2 && left.positions.every((leftPosition) =>
    right.positions.some((rightPosition) =>
      sameConflictSide(leftPosition.statement, rightPosition.statement) &&
      sameClinicalQuestion(leftPosition.statement, rightPosition.statement),
    ),
  );
}

function mergeDuplicateConflicts(
  left: InvestigationConflict,
  right: InvestigationConflict,
) {
  const primary = conflictEvidenceScore(right) > conflictEvidenceScore(left) ? right : left;
  const secondary = primary === left ? right : left;
  const positions = primary.positions.map((position) => {
    const matchingCitations = secondary.positions
      .filter((candidate) =>
        sameConflictSide(position.statement, candidate.statement) &&
        sameClinicalQuestion(position.statement, candidate.statement),
      )
      .flatMap((candidate) => candidate.citationIds);
    return {
      ...position,
      citationIds: Array.from(new Set([...position.citationIds, ...matchingCitations])),
    };
  });
  const citationIds = Array.from(new Set(positions.flatMap((position) => position.citationIds)));
  return {
    ...primary,
    positions,
    citationIds,
    documentNames: Array.from(new Set(positions.map((position) => position.documentName))),
  };
}

function conflictEvidenceScore(conflict: InvestigationConflict) {
  const citedSides = conflict.positions.filter((position) => position.citationIds.length > 0).length;
  const concreteDetails = conflict.positions.reduce((total, position) =>
    total +
    (position.statement.match(/\b\d+(?:\.\d+)?%?\b/g)?.length ?? 0) +
    (/\b(?:diagnos|recommend|risk|benefit|worsen|improv|contraindicat|delay|defer|proceed|start|stop)\w*\b/i.test(position.statement) ? 1 : 0),
  0);
  return citedSides * 20 +
    Math.min(conflict.citationIds.length, 4) * 4 +
    concreteDetails * 2 +
    Math.min(conflict.statement.length, 320) / 80;
}

function sameConflictSide(left: string, right: string) {
  const leftSide = conflictSide(left);
  const rightSide = conflictSide(right);
  if (leftSide === rightSide && leftSide !== "neutral") return true;
  return (
    (leftSide === "supportive" && rightSide === "positive") ||
    (leftSide === "positive" && rightSide === "supportive") ||
    (leftSide === "cautionary" && rightSide === "negative") ||
    (leftSide === "negative" && rightSide === "cautionary")
  );
}

function conflictSide(text: string) {
  const action = recommendationAction(text);
  if (action === "proceed") return "supportive";
  if (action && ["delay", "stop", "restrict"].includes(action)) return "cautionary";
  if (isMaterialConcern(text)) return "cautionary";
  const polarity = evidencePolarity(text);
  if (polarity) return polarity;
  if (/\b(?:benefit|support|stabili|favorable|effective)\w*\b/i.test(text)) {
    return "supportive";
  }
  return "neutral";
}

function uniqueChanges(items: InvestigationChange[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.measure}|${item.earlierValue}|${item.laterValue}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function looksLongitudinal(value: string) {
  return /\b(?:improved|decreased|increased|follow-up|later|earlier|from\s+\d+.*to\s+\d+)\b/i.test(value);
}

function isQuestion(value: string) {
  return /\?$/.test(value.trim()) || /^(?:whether|what|when|where|why|how|which|who|has|have|is|are|could|would|did|does|can)\b/i.test(value.trim());
}

function createOpenQuestions({
  questionFacts,
  intelligenceQuestions,
  reportQuestions,
  citations,
  facts,
  session,
}: {
  questionFacts: GroundedFact[];
  intelligenceQuestions: Array<{
    unknown: string;
    known?: string;
    whyItMatters: string;
    evidenceNeeded: string;
    evidenceIds?: string[];
  }>;
  reportQuestions: string[];
  citations: Citation[];
  facts: GroundedFact[];
  session: ResearchSession;
}) {
  const seeds = [
    ...questionFacts.map((fact) => ({
      id: fact.id,
      question: fact.text,
      known: "",
      whyItMatters: "",
      evidenceNeeded: "",
      evidenceIds: [],
    })),
    ...facts
      .filter((fact) =>
        ["limitation", "discrepancy"].includes(normalizedContentType(fact)) ||
        isClinicallyImportantUncertainty(fact.text) ||
        (
          normalizedContentType(fact) === "recommendation" &&
          /\b(?:until|uncertain|uncertainty|unresolved|restricted|lower starting dose|indication|dosing|dose)\b/i.test(fact.text)
        ),
      )
      .map((fact) => ({
        id: `gap-question:${fact.id}`,
        question: openQuestionFromGap(fact.text),
        known: fact.text,
        whyItMatters: "",
        evidenceNeeded: "",
        evidenceIds: [fact.evidenceId],
      })),
    ...intelligenceQuestions.map((item, index) => ({
      id: `intelligence-question:${index}`,
      question: item.unknown,
      known: item.known ?? "",
      whyItMatters: item.whyItMatters,
      evidenceNeeded: item.evidenceNeeded,
      evidenceIds: item.evidenceIds ?? [],
    })),
    ...reportQuestions.filter(isQuestion).map((question, index) => ({
      id: `report-question:${index}`,
      question,
      known: "",
      whyItMatters: "",
      evidenceNeeded: "",
      evidenceIds: [],
    })),
  ];
  const merged = new Map<string, typeof seeds[number]>();
  for (const seed of seeds) {
    const family = questionFamily(seed.question);
    const existing = merged.get(family);
    if (!existing) {
      merged.set(family, seed);
      continue;
    }
    merged.set(family, {
      ...existing,
      known: existing.known || seed.known,
      whyItMatters: existing.whyItMatters || seed.whyItMatters,
      evidenceNeeded: existing.evidenceNeeded || seed.evidenceNeeded,
      evidenceIds: Array.from(new Set([...existing.evidenceIds, ...seed.evidenceIds])),
    });
  }

  const questions = Array.from(merged.entries()).flatMap(([family, seed]) => {
    const question = canonicalQuestion(family, seed.question);
    if (isGenericOpenQuestion(question) || isOpenQuestionAnswered(question, facts)) return [];
    const id = `question:${family}`;
    const explicitlyLinkedFacts = facts.filter((fact) => seed.evidenceIds.includes(fact.evidenceId));
    const candidateFacts = explicitlyLinkedFacts.length > 0
      ? explicitlyLinkedFacts
      : relevantFactsForQuestion(question, facts);
    const candidateEvidenceIds = candidateFacts.map((fact) => fact.evidenceId);
    const known = specificOrSafe(seed.known, knownEvidenceForQuestion(candidateFacts));
    const relationships = buildEvidenceRelationships({
      targetItemId: id,
      targetText: `${question} ${known}`,
      targetKind: "open_question",
      citations: citations.filter((citation) =>
        candidateEvidenceIds.includes(citation.evidenceId) || candidateEvidenceIds.includes(citation.chunkId),
      ),
      facts,
      documents: session.documents,
      aiMappings: session.results?.reportGeneration.researchIntelligence?.evidenceMappings,
    });
    const relevantFacts = factsForRelationships(relationships, facts, citations);
    const evidenceFacts = candidateFacts.length > 0 ? candidateFacts : relevantFacts;
    const directCitationIds = candidateFacts.flatMap((fact) => supportingCitationIds(fact, citations));
    const citationIds = Array.from(new Set([
      ...relationships.map((relationship) => relationship.citationId),
      ...directCitationIds,
    ]));
    if (evidenceFacts.length === 0 || citationIds.length === 0) return [];
    const missingEvidence = specificOrSafe(seed.evidenceNeeded, evidenceNeededForOpenQuestion(question));
    const whyItMatters = specificOrSafe(seed.whyItMatters, openQuestionImpact(question, evidenceFacts));
    return [{
      id,
      question,
      whyUnresolved: missingEvidence,
      whyItMatters,
      known,
      missingEvidence,
      citationIds,
      relationships,
    } satisfies InvestigationQuestion];
  });
  return uniqueOpenQuestions(questions);
}

function uniqueOpenQuestions(questions: InvestigationQuestion[]) {
  const selected: InvestigationQuestion[] = [];
  for (const question of questions) {
    const duplicate = selected.find((candidate) =>
      areSemanticallyEquivalent(candidate.question, question.question) ||
      sharesSpecificPhrase(candidate.question, question.question),
    );
    if (!duplicate) {
      selected.push(question);
      continue;
    }
    duplicate.citationIds = Array.from(new Set([...duplicate.citationIds, ...question.citationIds]));
    duplicate.relationships = Array.from(new Map(
      [...duplicate.relationships, ...question.relationships].map((relationship) => [relationship.id, relationship]),
    ).values());
  }
  return selected;
}

function sharesSpecificPhrase(left: string, right: string) {
  const ignored = new Set([
    "available workup",
    "documented result",
    "uploaded record",
    "pending result",
  ]);
  const bigrams = (value: string) => {
    const tokens = comparisonTokens(value);
    return tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`);
  };
  const rightBigrams = new Set(bigrams(right));
  return bigrams(left).some((phrase) => !ignored.has(phrase) && rightBigrams.has(phrase));
}

function relevantFactsForQuestion(question: string, facts: GroundedFact[]) {
  const questionTopics = semanticTopics(question);
  const questionTokens = comparisonTokens(question);
  const family = semanticFamily(question);
  return facts
    .filter((fact) => normalizedContentType(fact) !== "unresolved_question")
    .map((fact) => {
      const text = `${fact.text} ${fact.excerpt}`;
      const sharedTopics = semanticTopics(text).filter((topic) => questionTopics.includes(topic)).length;
      const sharedTokens = comparisonTokens(text).filter((token) => questionTokens.includes(token)).length;
      const sameFamily = semanticFamily(text) === family;
      return { fact, score: sharedTopics * 5 + sharedTokens * 2 + Number(sameFamily) * 4 };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => item.fact);
}

function questionFamily(question: string) {
  const family = semanticFamily(question);
  return family || question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalQuestion(_family: string, fallback: string) {
  return ensureQuestion(fallback);
}

function factsForRelationships(
  relationships: EvidenceRelationship[],
  facts: GroundedFact[],
  citations: Citation[],
) {
  const factIds = new Set(relationships.flatMap((relationship) =>
    citations.find((citation) => citation.id === relationship.citationId)?.supportedClaimIds ?? [],
  ));
  return facts.filter((fact) => normalizedContentType(fact) !== "unresolved_question" && factIds.has(fact.id));
}

function knownEvidenceForQuestion(facts: GroundedFact[]) {
  if (facts.length === 0) return "No directly related source observation was retrieved.";

  const bestFact = facts.find((fact) =>
    !appearsIncompleteSourceText(fact.text, fact.excerpt) &&
    isReviewableFindingStatement(polishFindingStatement(fact.text, fact.excerpt)),
  ) ?? facts[0];
  const polished = polishFindingStatement(bestFact.text, bestFact.excerpt);
  return appearsIncompleteSourceText(polished, bestFact.excerpt)
    ? `The closest source passage is in ${bestFact.documentName}, but it does not resolve the question.`
    : polished;
}

function specificOrSafe(candidate: string, fallback: string) {
  const value = candidate.trim();
  if (!value || /source observation that directly|materially change the evidence-based conclusion|additional directly relevant source evidence|resolving this question could/i.test(value)) return fallback;
  return value;
}

function ensureQuestion(value: string) {
  const trimmed = value.trim().replace(/[.]+$/, "");
  return `${trimmed}${trimmed.endsWith("?") ? "" : "?"}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
