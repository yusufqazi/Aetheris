import {
  findExactEvidenceSpan,
  pageTextFor,
} from "@/lib/research/evidence-spans";
import type {
  Citation,
  EvidenceRelationship,
  EvidenceRelationshipType,
  GroundedFact,
  ResearchEvidenceMapping,
  UploadedDocument,
} from "@/lib/types";

type EvidenceTargetKind = "finding" | "open_question" | "conflict" | "change";

const TOPIC_PATTERNS = {
  ferritin: /\bferritin\b|iron stores?|iron repletion|oral iron|intravenous iron|\biv iron\b/i,
  hemoglobin: /\bhemoglobin\b|\bhgb\b|hematologic|\banemia\b/i,
  fatigue: /\bfatigue\b|energy|symptomatic improvement/i,
  palpitations: /palpitations?|ambulatory (?:rhythm )?monitor|rhythm monitoring|residual symptoms/i,
  qt: /\bqtc?\b|qt[- ]prolong|electrocardiogram|\becg\b/i,
  bloodLoss: /blood loss|bleeding source|heavy menstrual|menorrhagia|gastrointestinal bleed|\bgi bleed/i,
  ibuprofen: /\bibuprofen\b|\bnsaid/i,
  omeprazole: /\bomeprazole\b|acid suppress|proton pump|\bppi\b/i,
  nausea: /\bnausea\b|iron formulation|ferrous/i,
  orthostatic: /orthostatic|presyncope|postural|\bpropranolol\b/i,
} as const;

type SemanticTopic = keyof typeof TOPIC_PATTERNS;

export function semanticTopics(text: string): SemanticTopic[] {
  return (Object.entries(TOPIC_PATTERNS) as Array<[SemanticTopic, RegExp]>)
    .filter(([, pattern]) => pattern.test(text))
    .map(([topic]) => topic);
}

export function semanticFamily(text: string) {
  const topics = semanticTopics(text);
  if (topics.includes("ferritin")) return "ferritin";
  if (topics.includes("palpitations")) return "palpitations";
  if (topics.includes("qt")) return "qt";
  if (topics.includes("bloodLoss") && topics.includes("ibuprofen")) return "ibuprofen-bleeding";
  if (topics.includes("bloodLoss")) return "blood-loss";
  if (topics.includes("omeprazole")) return "omeprazole-iron";
  if (topics.includes("orthostatic")) return "orthostatic";
  if (topics.includes("nausea")) return "nausea";
  if (topics.includes("fatigue")) return "fatigue";
  if (topics.includes("hemoglobin")) return "hemoglobin";
  return normalizeSemanticText(text).split(" ").slice(0, 8).join(" ");
}

export function areSemanticallyEquivalent(left: string, right: string) {
  const leftFamily = semanticFamily(left);
  const rightFamily = semanticFamily(right);
  if (leftFamily && leftFamily === rightFamily) return true;

  const leftTokens = significantTokens(left);
  const rightTokens = significantTokens(right);
  const shared = leftTokens.filter((token) => rightTokens.includes(token)).length;
  const denominator = Math.max(1, Math.min(leftTokens.length, rightTokens.length));
  return shared >= 3 && shared / denominator >= 0.72;
}

export function buildEvidenceRelationships({
  targetItemId,
  targetText,
  targetKind,
  citations,
  facts,
  documents,
  aiMappings = [],
}: {
  targetItemId: string;
  targetText: string;
  targetKind: EvidenceTargetKind;
  citations: Citation[];
  facts: GroundedFact[];
  documents: UploadedDocument[];
  aiMappings?: ResearchEvidenceMapping[];
}) {
  const relationships: EvidenceRelationship[] = [];
  const seenQuotes = new Set<string>();

  for (const citation of citations) {
    const pageText = pageTextFor(documents, citation.documentId, citation.page);
    const candidateQuote = citation.exactQuote ?? citation.excerpt;
    const span = pageText ? findExactEvidenceSpan(pageText, candidateQuote) : null;
    if (!span || isQuestionOnlyQuote(span.quote)) continue;

    const fact = factForCitation(citation, facts);
    if (fact?.contentType === "unresolved_question") continue;

    const aiMapping = findValidatedAiMapping({
      aiMappings,
      targetKind,
      targetText,
      citation,
      quote: span.quote,
    });
    const compatibility = evidenceCompatibility(targetText, span.quote, fact, targetKind);
    if (!aiMapping && !compatibility.relevant) continue;

    const quoteKey = normalizeSemanticText(span.quote);
    if (!quoteKey || seenQuotes.has(quoteKey)) continue;
    seenQuotes.add(quoteKey);

    const relationshipType = aiMapping?.relationshipType
      ?? relationshipTypeFor(fact, targetKind, span.quote);
    relationships.push({
      id: `relationship:${targetItemId}:${citation.id}`,
      evidenceId: citation.evidenceId,
      citationId: citation.id,
      supportedItemId: targetItemId,
      relationshipType,
      relevanceExplanation: aiMapping?.relevanceExplanation
        ?? relevanceExplanationFor(targetText, span.quote, relationshipType),
      exactQuote: span.quote,
      documentId: citation.documentId,
      documentName: citation.documentName,
      page: citation.page,
      confidence: aiMapping?.confidence ?? compatibility.confidence,
    });
  }

  return relationships;
}

export function isQuestionOnlyQuote(text: string) {
  const value = text.replace(/^(?:open|unresolved|follow-up) question\s*[:\-]\s*/i, "").trim();
  return /\?$/.test(value) && !/\b(?:documented|reported|noted|considered|remained|measured)\b/i.test(value);
}

function evidenceCompatibility(
  targetText: string,
  quote: string,
  fact: GroundedFact | undefined,
  targetKind: EvidenceTargetKind,
) {
  const targetTopics = semanticTopics(targetText);
  const evidenceText = `${quote} ${fact?.text ?? ""}`;
  const evidenceTopics = semanticTopics(evidenceText);
  const sharedTopics = targetTopics.filter((topic) => evidenceTopics.includes(topic));

  if (targetTopics.length > 0) {
    const relevant = sharedTopics.length > 0 && passesTopicGuard(targetTopics, evidenceTopics);
    return {
      relevant,
      confidence: relevant && sharedTopics.length >= 2 ? "high" as const : "medium" as const,
    };
  }

  const targetTokens = significantTokens(targetText);
  const evidenceTokens = significantTokens(evidenceText);
  const overlap = targetTokens.filter((token) => evidenceTokens.includes(token)).length;
  const ratio = overlap / Math.max(1, targetTokens.length);
  const threshold = targetKind === "open_question" ? 0.42 : 0.3;
  return {
    relevant: overlap >= 2 && ratio >= threshold,
    confidence: ratio >= 0.65 ? "high" as const : "medium" as const,
  };
}

function passesTopicGuard(targetTopics: SemanticTopic[], evidenceTopics: SemanticTopic[]) {
  if (targetTopics.includes("ferritin")) return evidenceTopics.includes("ferritin");
  if (targetTopics.includes("palpitations")) return evidenceTopics.includes("palpitations");
  if (targetTopics.includes("qt")) return evidenceTopics.includes("qt");
  if (targetTopics.includes("bloodLoss")) return evidenceTopics.includes("bloodLoss");
  return targetTopics.some((topic) => evidenceTopics.includes(topic));
}

function relationshipTypeFor(
  fact: GroundedFact | undefined,
  targetKind: EvidenceTargetKind,
  quote: string,
): EvidenceRelationshipType {
  if (fact?.contentType === "discrepancy") return "contradicts";
  if (fact?.contentType === "recommendation") return "proposes_follow_up";
  if (fact?.contentType === "limitation" || /\b(?:missing|not (?:measured|excluded|available)|remains? unknown|unresolved)\b/i.test(quote)) {
    return targetKind === "open_question" ? "identifies_missing_evidence" : "weakens";
  }
  if (targetKind === "open_question") return "provides_context";
  return "supports";
}

function relevanceExplanationFor(
  targetText: string,
  quote: string,
  relationshipType: EvidenceRelationshipType,
) {
  const family = semanticFamily(`${targetText} ${quote}`);
  if (relationshipType === "identifies_missing_evidence") {
    return "Identifies evidence that remains absent or unresolved in the uploaded record.";
  }
  if (relationshipType === "proposes_follow_up") {
    return "Documents a follow-up step proposed in the source record.";
  }
  if (family === "ferritin") return "Documents the observed ferritin or iron-repletion response relevant to this question.";
  if (family === "palpitations") return "Documents the course of palpitations or the absence of direct rhythm assessment.";
  if (family === "qt") return "Documents the QTc measurement or ECG follow-up relevant to this item.";
  if (family === "blood-loss" || family === "ibuprofen-bleeding") return "Documents the bleeding history or an unresolved source of blood loss.";
  if (relationshipType === "weakens") return "Documents a limitation that narrows this conclusion.";
  if (relationshipType === "contradicts") return "Documents evidence that conflicts with this item.";
  return "Directly documents the observation described by this item.";
}

function findValidatedAiMapping({
  aiMappings,
  targetKind,
  targetText,
  citation,
  quote,
}: {
  aiMappings: ResearchEvidenceMapping[];
  targetKind: EvidenceTargetKind;
  targetText: string;
  citation: Citation;
  quote: string;
}) {
  return aiMappings.find((mapping) => {
    if (mapping.targetType !== targetKind || mapping.evidenceId !== citation.evidenceId) return false;
    if (!areSemanticallyEquivalent(mapping.targetText, targetText)) return false;
    if (normalizeSemanticText(mapping.exactQuote) !== normalizeSemanticText(quote)) return false;
    return evidenceCompatibility(targetText, quote, undefined, targetKind).relevant;
  });
}

function factForCitation(citation: Citation, facts: GroundedFact[]) {
  return citation.supportedClaimIds
    ?.map((id) => facts.find((fact) => fact.id === id))
    .find(Boolean)
    ?? facts.find((fact) => fact.evidenceId === citation.evidenceId && fact.excerpt === citation.excerpt)
    ?? facts.find((fact) => fact.evidenceId === citation.evidenceId);
}

function normalizeSemanticText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.%]+/g, " ")
    .replace(/\b(?:what|whether|is|are|was|were|will|did|does|the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(text: string) {
  const stop = new Set([
    "the", "and", "that", "with", "from", "this", "were", "was", "for", "but", "not", "into",
    "after", "before", "what", "whether", "does", "will", "could", "would", "should", "entirely",
  ]);
  return Array.from(new Set(
    text.toLowerCase().match(/[a-z0-9.]+/g)?.filter((token) => token.length > 2 && !stop.has(token)) ?? [],
  ));
}
