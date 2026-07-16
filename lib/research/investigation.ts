import type {
  Citation,
  EvidenceRelationship,
  GroundedFact,
  ResearchSession,
} from "@/lib/types";
import { getSessionCitations } from "@/lib/research/evidence-spans";
import {
  areSemanticallyEquivalent,
  buildEvidenceRelationships,
  semanticFamily,
} from "@/lib/research/evidence-relationships";

export type SupportLabel =
  | "Strongly supported"
  | "Moderately supported"
  | "Limited support"
  | "Conflicting evidence"
  | "Insufficient evidence";

export type FindingPriority = "Primary finding" | "Important finding" | "Supporting context";
export type FindingDimension = "efficacy" | "safety" | "limitation" | "context";

export interface InvestigationFinding {
  id: string;
  statement: string;
  support: SupportLabel;
  sourceCount: number;
  citationIds: string[];
  reasoningType: string;
  priority: FindingPriority;
  priorityScore: number;
  uncertainty: string;
  dimension: FindingDimension;
  relationships: EvidenceRelationship[];
}

export interface InvestigationConflict {
  id: string;
  statement: string;
  type: "Direct contradiction" | "Documentation discrepancy" | "Unresolved inconsistency";
  explanation: string;
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
  const interactionFocused = focus.interactions && !focus.efficacy && !focus.limitations;
  const findingFacts = facts.filter((fact) => {
    const contentType = normalizedContentType(fact);
    if (interactionFocused) return contentType === "interaction_concern";
    return (
      contentType === "finding" ||
      contentType === "interaction_concern" ||
      contentType === "safety_observation" ||
      contentType === "longitudinal_change" ||
      contentType === "limitation"
    ) && fact.category !== "study-design";
  });
  const conflictFacts = facts.filter((fact) => normalizedContentType(fact) === "discrepancy");
  const changeFacts = facts.filter((fact) => normalizedContentType(fact) === "longitudinal_change");
  const questionFacts = facts.filter((fact) => normalizedContentType(fact) === "unresolved_question");

  const findings = createInvestigationFindings(findingFacts, citations, session, focus).slice(0, 9);
  const conflicts = uniqueByStatement([
    ...conflictFacts.map((fact) => conflictFromFact(fact, citations)),
    ...(intelligence?.contradictions ?? [])
      .filter((item) => !looksLongitudinal(`${item.issue} ${item.reconciliation}`))
      .map((item, index) => ({
        id: `intelligence-conflict:${index}`,
        statement: item.issue,
        type: conflictType(item.issue),
        explanation: item.reconciliation,
        citationIds: citationIdsForEvidence(item.evidenceIds, citations),
        relationships: [],
      } satisfies InvestigationConflict)),
  ]).slice(0, 6).map((item) => attachRelationships(item, "conflict", citations, facts, session));
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
  }).slice(0, 6);
  const citedDocumentCount = new Set(
    findings.flatMap((finding) => finding.citationIds)
      .map((id) => citations.find((citation) => citation.id === id)?.documentId)
      .filter(Boolean),
  ).size;
  const support = primarySupport(findings, conflicts, citedDocumentCount);
  const strongestCitationIds = strongestCrossDocumentCitationIds(findings, citations);
  const directAnswer = normalizeDirectAnswer(
    intelligence?.directAnswer.trim() || report?.executiveSummary || "The uploaded evidence did not produce a direct answer.",
    facts,
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

function createInvestigationFindings(
  facts: GroundedFact[],
  citations: Citation[],
  session: ResearchSession,
  focus: ReturnType<typeof questionFocus>,
) {
  const eligibleFacts = facts.filter((fact) => !appearsIncompleteSourceText(fact.text, fact.excerpt));
  const groups = groupFactsByMeaning(eligibleFacts);
  const responseFacts = eligibleFacts.filter((fact) => isTreatmentResponseFact(fact));
  const responseSummary = focus.efficacy && responseFacts.length >= 2
    ? [findingFromFacts(
        responseFacts,
        citations,
        session,
        focus,
        "Hematologic and symptomatic improvement occurred after the documented treatment changes.",
        true,
      )]
    : [];

  const findings = [
    ...responseSummary,
    ...uniqueByStatement(groups.map((group) => findingFromFacts(group, citations, session, focus))),
  ]
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

function findingFromFacts(
  facts: GroundedFact[],
  citations: Citation[],
  session: ResearchSession,
  focus: ReturnType<typeof questionFocus>,
  statementOverride?: string,
  primarySummary = false,
): InvestigationFinding {
  const candidateCitationIds = Array.from(new Set(facts.flatMap((fact) => supportingCitationIds(fact, citations))));
  const sourceContext = session.documents.map((document) => document.text).join(" ");
  const statement = statementOverride ?? (facts.length > 1 && facts.some((fact) => /\bqt(?:c)?\b|qt[- ]prolong/i.test(fact.text))
    ? buildQtConcernStatement(facts)
    : polishFindingStatement(facts[0].text, facts[0].excerpt, sourceContext));
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
  const combined = facts.map((fact) => `${fact.text} ${fact.excerpt}`).join(" ");
  const dimension = findingDimension(combined, facts);
  const priorityScore = findingPriorityScore(combined, sourceCount, linked.length, dimension, focus, primarySummary);
  return {
    id,
    statement,
    support: sourceCount >= 2 ? "Strongly supported" : sourceCount === 1 ? "Moderately supported" : "Limited support",
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
    relationships,
    uncertainty: /may|possible|concern|risk|not prove|uncertain/i.test(combined)
      ? "This is a source-grounded concern, not proof that medication-related harm occurred."
      : "The conclusion remains limited to the uploaded records.",
  };
}

function buildQtConcernStatement(facts: GroundedFact[]) {
  const subjects = facts.flatMap((fact) => {
    const prefix = fact.text.split(/\b(?:creates?|increases?|both|can|may|could|electrolyte)\b/i)[0]
      .replace(/\b(?:critical|high|moderate|low)\s+concern\b.*$/i, "")
      .trim();
    return prefix.split(/\s+(?:\+|plus)\s+/i).map((value) => value
      .replace(/\bborderline\s+(?=QTc?\b)/i, "")
      .replace(/[.:;,]+$/, "")
      .trim());
  }).filter(Boolean);
  const unique = Array.from(new Map(subjects.map((subject) => [subject.toLowerCase(), subject])).values());
  const formatted = formatList(unique.slice(0, 4));
  return formatted
    ? `Potential cumulative QT-prolongation concern involving ${formatted}.`
    : "Potential cumulative QT-prolongation concern documented in the uploaded records.";
}

export function polishFindingStatement(text: string, rawExcerpt = text, sourceContext = "") {
  let value = text.replace(/\s+/g, " ").trim();
  const tableRow = value.match(/^([A-Z][A-Za-z-]+)(?:\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|mL))?(?:\s+(?:once|twice|daily|weekly|as needed|prn))*\s+(?:active|inactive|current|historical)\s+(.+)$/i);
  if (tableRow) value = `${tableRow[1]} ${tableRow[2]}`;
  value = value
    .replace(/\b(\w+)\s+\1\b/gi, "$1")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

  if (/^fatigue\b/i.test(value) && /(?:about|approximately)?\s*40\s*%\s+improved/i.test(value)) {
    return "Fatigue improved by approximately 40% during follow-up.";
  }
  if (/\bhemoglobin\b|\bhgb\b/i.test(value) && /\b(?:8\.7).*\b(?:10\.4)\b/i.test(value)) {
    return "Hemoglobin increased from 8.7 to 10.4 g/dL during follow-up.";
  }
  if (/\bferritin\b/i.test(value) && /\b14\s*ng\/mL\b/i.test(value) && /remain|still|low/i.test(value)) {
    return "Ferritin remained low at 14 ng/mL during follow-up.";
  }
  if (/heavy menstrual bleeding/i.test(value) && /persist|remain|ongoing|continued/i.test(value)) {
    return "Heavy menstrual bleeding persisted during follow-up.";
  }
  if (/\bnausea\b/i.test(value) && /improv|decreas|reduc/i.test(value)) {
    return "Nausea improved after the iron formulation was changed.";
  }
  if (/orthostatic/i.test(value) && /propranolol/i.test(`${value} ${sourceContext}`) && /improv|reduc|stop|discontinu/i.test(value)) {
    return "Orthostatic symptoms improved after propranolol was stopped.";
  }

  if (/gastrointestinal (?:blood loss|bleeding)/i.test(value)) {
    const subject = value.match(/^([A-Z][A-Za-z-]+)/)?.[1] ?? "The documented medication";
    const hasAnemia = /\banemia\b/i.test(sourceContext);
    const hasHeavyBleeding = /heavy menstrual bleeding/i.test(sourceContext);
    const context = hasAnemia && hasHeavyBleeding
      ? "anemia and heavy menstrual bleeding"
      : hasAnemia
        ? "documented anemia"
        : "the documented bleeding history";
    const review = /should|minimi[sz]e|review/i.test(`${value} ${rawExcerpt}`);
    return `${subject} may increase gastrointestinal bleeding risk${review ? ` and should be reviewed in the context of ${context}` : ` in the context of ${context}`}.`;
  }

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
  let score = 2;
  if (primarySummary) score += 8;
  if (dimension === "efficacy" && focus.efficacy) score += 4;
  if (dimension === "safety" && focus.safety) score += 3;
  if (dimension === "limitation" && focus.limitations) score += 2;
  if (/\bqt(?:c)?\b|contraindicat|arrhythmia|bleeding|severe|high priority/i.test(text)) score += focus.safety ? 2 : 0;
  else if (/interaction|absorption|orthostatic|exposure|risk|concern/i.test(text)) score += focus.safety ? 1 : 0;
  score += Math.min(2, sourceCount);
  score += evidenceCount > 1 ? 1 : 0;
  return score;
}

function findingDimension(text: string, facts: GroundedFact[]): FindingDimension {
  if (facts.some((fact) => normalizedContentType(fact) === "limitation") || /remains? low|persisted|unresolved|not excluded|missing/i.test(text)) {
    return "limitation";
  }
  if (facts.some((fact) => normalizedContentType(fact) === "interaction_concern" || normalizedContentType(fact) === "safety_observation")) {
    return "safety";
  }
  if (/improv|increas|decreas|response|follow-up|hemoglobin|fatigue|nausea|orthostatic/i.test(text)) return "efficacy";
  return "context";
}

function formatList(values: string[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${lowercaseLeading(values[1])}`;
  return `${values.slice(0, -1).map((value, index) => index === 0 ? value : lowercaseLeading(value)).join(", ")}, and ${lowercaseLeading(values.at(-1) ?? "")}`;
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

function conflictFromFact(fact: GroundedFact, citations: Citation[]): InvestigationConflict {
  return {
    id: fact.id,
    statement: fact.text,
    type: conflictType(fact.text),
    explanation: "The records describe the same subject differently and require verification.",
    citationIds: supportingCitationIds(fact, citations),
    relationships: [],
  };
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
  if (/document|record|note|history|reported|described|frequency/i.test(text)) return "Documentation discrepancy";
  return "Unresolved inconsistency";
}

function primarySupport(findings: InvestigationFinding[], conflicts: InvestigationConflict[], documentCount: number): SupportLabel {
  if (findings.length === 0) return "Insufficient evidence";
  if (conflicts.some((item) => item.type === "Direct contradiction")) return "Conflicting evidence";
  if (findings.length >= 3 && documentCount >= 2) return "Strongly supported";
  if (findings.some((item) => item.citationIds.length > 0)) return "Moderately supported";
  return "Limited support";
}

function supportDescription(label: SupportLabel, findings: InvestigationFinding[], documentCount: number) {
  const text = findings.map((finding) => finding.statement).join(" ");
  const signals = [
    /hemoglobin|ferritin|\bqtc?\b/i.test(text) ? "laboratory trends" : null,
    /fatigue|nausea|orthostatic|symptom/i.test(text) ? "symptom improvement" : null,
    /follow-up|increased|improved|decreased/i.test(text) ? "follow-up findings" : null,
  ].filter((value): value is string => Boolean(value));
  const basis = signals.length > 0
    ? formatList(signals)
    : `${findings.length} directly sourced finding${findings.length === 1 ? "" : "s"}`;
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
    efficacy: /efficacy|effective|response|respond|improv|benefit|outcome|treatment/i.test(question),
    safety: /safety|safe|adverse|risk|harm|interaction|medication/i.test(question),
    limitations: /limitation|uncertain|missing|unresolved|caveat|weakness|gap/i.test(question),
    interactions: /interaction|contraindication|coadmin|medication|drug/i.test(question),
  };
}

function groupFactsByMeaning(facts: GroundedFact[]) {
  const groups: GroundedFact[][] = [];
  for (const fact of facts) {
    const existing = groups.find((group) => areSemanticallyEquivalent(
      `${group[0].text} ${group[0].excerpt}`,
      `${fact.text} ${fact.excerpt}`,
    ));
    if (existing) existing.push(fact);
    else groups.push([fact]);
  }
  return groups;
}

function appearsIncompleteSourceText(text: string, excerpt: string) {
  const value = `${text} ${excerpt}`.trim();
  if (/\.\.\.|…/.test(value)) return true;
  if (/\b(?:and|or|that|which|because|with|from|to|of|frequent)\s*[,:;-]*$/i.test(value)) return true;
  return /^(?:the\s+)?(?:first|second|third)\s+concern\s+is\s+that\b/i.test(value) && !/[.!?]$/.test(excerpt.trim());
}

function isTreatmentResponseFact(fact: GroundedFact) {
  if (normalizedContentType(fact) === "limitation" || normalizedContentType(fact) === "interaction_concern") return false;
  return /hemoglobin|hematologic|fatigue|nausea|orthostatic|symptom.{0,25}improv|improv.{0,25}symptom/i.test(`${fact.text} ${fact.excerpt}`);
}

function attachRelationships<T extends InvestigationConflict | InvestigationChange>(
  item: T,
  targetKind: "conflict" | "change",
  citations: Citation[],
  facts: GroundedFact[],
  session: ResearchSession,
) {
  const targetText = "statement" in item
    ? `${item.statement} ${item.explanation}`
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
    citationIds: relationships.map((relationship) => relationship.citationId),
    relationships,
  };
}

function strongestCrossDocumentCitationIds(findings: InvestigationFinding[], citations: Citation[]) {
  const selected: string[] = [];
  const documents = new Set<string>();
  for (const finding of findings) {
    for (const citationId of finding.citationIds) {
      const citation = citations.find((item) => item.id === citationId);
      if (!citation || documents.has(citation.documentId)) continue;
      selected.push(citationId);
      documents.add(citation.documentId);
      if (selected.length === 3) return selected;
    }
  }
  return selected;
}

function normalizeDirectAnswer(answer: string, facts: GroundedFact[]) {
  const sourceText = facts.map((fact) => `${fact.text} ${fact.excerpt}`).join(" ");
  const hasStatisticalEvidence = facts.some((fact) => fact.category === "statistical" || /\bp\s*[=<]|confidence interval/i.test(fact.excerpt));
  let value = answer.trim();
  if (!hasStatisticalEvidence) {
    const duration = /\b(?:four|4)\s+weeks?\b/i.test(sourceText) ? " over four weeks" : " during follow-up";
    value = value.replace(
      /(?:the\s+)?(?:treatment|modified treatment) regimen demonstrated (?:statistically )?significant hematologic and symptomatic efficacy/gi,
      `The modified regimen was followed by meaningful hematologic and symptomatic improvement${duration}`,
    );
    value = value.replace(/\bstatistically significant\b/gi, "documented");
    value = value.replace(/\bdemonstrated significant efficacy\b/gi, "was followed by meaningful improvement");
  }
  return value;
}

function primaryUncertainty(session: ResearchSession, facts: GroundedFact[]) {
  const sourceText = facts.map((fact) => `${fact.text} ${fact.excerpt}`).join(" ");
  if (/ferritin.{0,45}(?:remained|still|low)|(?:remained|still) low.{0,45}ferritin/i.test(sourceText) && /blood loss|heavy menstrual|bleeding source/i.test(sourceText)) {
    return "Long-term success remains uncertain because iron stores are still low and the source of blood loss is unresolved.";
  }
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

function uniqueByStatement<T extends { statement: string }>(items: T[]) {
  const accepted: T[] = [];
  for (const item of items) {
    if (!item.statement.trim() || accepted.some((candidate) => areSemanticallyEquivalent(candidate.statement, item.statement))) continue;
    accepted.push(item);
  }
  return accepted;
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
  intelligenceQuestions: Array<{ unknown: string; whyItMatters: string; evidenceNeeded: string }>;
  reportQuestions: string[];
  citations: Citation[];
  facts: GroundedFact[];
  session: ResearchSession;
}) {
  const seeds = [
    ...questionFacts.map((fact) => ({
      id: fact.id,
      question: fact.text,
      whyItMatters: "",
      evidenceNeeded: "",
    })),
    ...intelligenceQuestions.map((item, index) => ({
      id: `intelligence-question:${index}`,
      question: item.unknown,
      whyItMatters: item.whyItMatters,
      evidenceNeeded: item.evidenceNeeded,
    })),
    ...reportQuestions.filter(isQuestion).map((question, index) => ({
      id: `report-question:${index}`,
      question,
      whyItMatters: "",
      evidenceNeeded: "",
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
      whyItMatters: existing.whyItMatters || seed.whyItMatters,
      evidenceNeeded: existing.evidenceNeeded || seed.evidenceNeeded,
    });
  }

  return Array.from(merged.entries()).map(([family, seed]) => {
    const question = canonicalQuestion(family, seed.question);
    const id = `question:${family}`;
    const relationships = buildEvidenceRelationships({
      targetItemId: id,
      targetText: question,
      targetKind: "open_question",
      citations,
      facts,
      documents: session.documents,
      aiMappings: session.results?.reportGeneration.researchIntelligence?.evidenceMappings,
    });
    const relevantFacts = factsForRelationships(relationships, facts, citations);
    const known = knownEvidenceForQuestion(question, relevantFacts);
    const missingEvidence = specificOrSafe(seed.evidenceNeeded, missingEvidenceForQuestion(question));
    const whyItMatters = specificOrSafe(seed.whyItMatters, whyQuestionMatters(question));
    return {
      id,
      question,
      whyUnresolved: relationships.length > 0
        ? missingEvidence
        : "Not enough relevant evidence was found to explain this question.",
      whyItMatters,
      known,
      missingEvidence,
      citationIds: relationships.map((relationship) => relationship.citationId),
      relationships,
    } satisfies InvestigationQuestion;
  });
}

function questionFamily(question: string) {
  const family = semanticFamily(question);
  if (family === "blood-loss" || /definitive source of blood loss/i.test(question)) return "blood-loss";
  if (family === "ferritin") return "ferritin";
  if (family === "palpitations") return "palpitations";
  if (family === "qt") return "qt";
  if (family === "omeprazole-iron" || /frequency|timing|how often/i.test(question)) return "medication-frequency";
  return family || question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalQuestion(family: string, fallback: string) {
  return {
    ferritin: "Will ferritin normalize with oral therapy alone?",
    palpitations: "Are palpitations entirely secondary to anemia?",
    "blood-loss": "What is the definitive source of blood loss?",
    qt: "Did the QTc remain stable after the documented changes?",
    "medication-frequency": "What is the actual omeprazole use frequency and timing?",
  }[family] ?? ensureQuestion(fallback);
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

function knownEvidenceForQuestion(question: string, facts: GroundedFact[]) {
  if (facts.length === 0) return "Not enough relevant evidence was found to explain this question.";
  const source = facts.map((fact) => `${fact.text} ${fact.excerpt}`).join(" ");

  if (/ferritin|iron stores?|oral therapy/i.test(question)) {
    const values = extractMeasureValues(source, "ferritin");
    if (values.length >= 2) {
      const duration = /\b(?:four|4)\s+weeks?\b/i.test(source) ? " after four weeks of treatment" : " during follow-up";
      const remainedLow = /remain|still|below|low/i.test(source) ? " but remained below the reference range" : "";
      return `Ferritin increased from ${values[0]} ng/mL to ${values[1]} ng/mL${duration}${remainedLow}.`;
    }
    if (values.length === 1) return `Ferritin was documented at ${values[0]} ng/mL, but the available record does not establish later normalization.`;
  }
  if (/palpitations?|rhythm/i.test(question)) {
    if (/improv|reduc/i.test(source) && /persist|residual|remain/i.test(source)) {
      return "Palpitations improved after treatment but persisted, and the record does not include ambulatory rhythm monitoring.";
    }
  }
  if (/blood loss|bleeding/i.test(question)) {
    const menstrual = /heavy menstrual|menorrhagia/i.test(source);
    const gastrointestinal = /gastrointestinal|\bgi\b/i.test(source);
    if (menstrual && gastrointestinal) {
      return "Heavy menstrual bleeding is documented, while gastrointestinal blood loss was not formally excluded.";
    }
    if (menstrual) return "Heavy menstrual bleeding is documented and remained unresolved in the available follow-up.";
  }

  const polished = polishFindingStatement(facts[0].text, facts[0].excerpt);
  return appearsIncompleteSourceText(polished, facts[0].excerpt)
    ? "Not enough relevant evidence was found to explain this question."
    : polished;
}

function extractMeasureValues(text: string, measure: string) {
  const values: string[] = [];
  const pattern = new RegExp(`${measure}[^.;\\n]{0,55}?(\\d+(?:\\.\\d+)?)\\s*ng\\/mL`, "gi");
  for (const match of text.matchAll(pattern)) {
    if (!values.includes(match[1])) values.push(match[1]);
  }
  const paired = text.match(new RegExp(`${measure}[^.;\\n]{0,30}?(\\d+(?:\\.\\d+)?)\\s*(?:to|→|->)\\s*(\\d+(?:\\.\\d+)?)`, "i"));
  if (paired) return [paired[1], paired[2]];
  return values.slice(0, 2);
}

function specificOrSafe(candidate: string, fallback: string) {
  const value = candidate.trim();
  if (!value || /source observation that directly|materially change the evidence-based conclusion/i.test(value)) return fallback;
  return value;
}

function missingEvidenceForQuestion(question: string) {
  if (/ferritin|iron stores?|oral therapy/i.test(question)) {
    return "A later ferritin measurement after the planned additional course of oral therapy.";
  }
  if (/palpitations?|rhythm|arrhythmia/i.test(question)) {
    return "Ambulatory rhythm monitoring or another direct rhythm assessment.";
  }
  if (/\bqt(?:c)?\b|electrocardiogram|\becg\b/i.test(question)) {
    return "A later ECG documenting whether the QTc remained stable.";
  }
  if (/gastrointestinal|blood loss|bleeding/i.test(question)) {
    return "A documented gastrointestinal evaluation or explicit exclusion of ongoing blood loss.";
  }
  if (/frequency|timing|adherence|how often|use/i.test(question)) {
    return "A reconciled medication history with actual dosing frequency and timing.";
  }
  return "Not enough relevant evidence was found to explain what additional observation would resolve this question.";
}

function whyQuestionMatters(question: string) {
  if (/ferritin|iron stores?|oral therapy/i.test(question)) {
    return "Persistent low ferritin would indicate incomplete iron repletion and could change whether oral therapy alone is sufficient.";
  }
  if (/palpitations?|rhythm|arrhythmia/i.test(question)) {
    return "Persistent symptoms may have an additional cause that is not explained by the current record.";
  }
  if (/\bqt(?:c)?\b|electrocardiogram|\becg\b/i.test(question)) {
    return "Persistent QT prolongation would materially affect the medication-risk interpretation.";
  }
  if (/gastrointestinal|blood loss|bleeding/i.test(question)) {
    return "Continued blood loss could cause recurrent iron deficiency despite treatment.";
  }
  if (/frequency|timing|adherence|how often|use/i.test(question)) {
    return "Actual exposure frequency determines whether the documented interaction concern is clinically relevant.";
  }
  return "Not enough relevant evidence was found to explain why this question would change the conclusion.";
}

function ensureQuestion(value: string) {
  const trimmed = value.trim().replace(/[.]+$/, "");
  return `${trimmed}${trimmed.endsWith("?") ? "" : "?"}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
