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

export function semanticTopics(text: string): string[] {
  return significantTokens(text);
}

export function semanticFamily(text: string) {
  const tokens = significantTokens(text);
  const numeric = text.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  return [...tokens.slice(0, 6), ...numeric.slice(0, 2)].sort().join("-");
}

export function areSemanticallyEquivalent(left: string, right: string) {
  const leftTokens = significantTokens(left);
  const rightTokens = significantTokens(right);
  const shared = leftTokens.filter((token) => rightTokens.includes(token)).length;
  const denominator = Math.max(1, Math.min(leftTokens.length, rightTokens.length));
  const leftNumbers: string[] = left.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const rightNumbers: string[] = right.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const numbersCompatible = leftNumbers.length === 0 || rightNumbers.length === 0 ||
    leftNumbers.some((value) => rightNumbers.includes(value));
  return numbersCompatible && shared >= 3 && shared / denominator >= 0.72;
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
      relevanceExplanation: aiMapping && !isVagueRelevanceExplanation(aiMapping.relevanceExplanation)
        ? aiMapping.relevanceExplanation
        : relevanceExplanationFor(targetText, span.quote, relationshipType),
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
    const ratio = sharedTopics.length / Math.max(1, Math.min(targetTopics.length, 8));
    const targetNumbers: string[] = targetText.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
    const evidenceNumbers: string[] = evidenceText.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
    const numericMatch = targetNumbers.length === 0 ||
      evidenceNumbers.length === 0 ||
      targetNumbers.some((value) => evidenceNumbers.includes(value));
    const minimumOverlap = targetKind === "open_question" && targetTopics.length > 3 ? 2 : 1;
    const relevant = numericMatch && sharedTopics.length >= minimumOverlap && ratio >= 0.2;
    return {
      relevant,
      confidence: relevant && sharedTopics.length >= 3 ? "high" as const : "medium" as const,
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
  const claim = targetText.replace(/\s+/g, " ").trim().replace(/[.]+$/, "");
  if (relationshipType === "identifies_missing_evidence") {
    return `Identifies evidence that remains absent or unresolved for the selected question: ${claim}.`;
  }
  if (relationshipType === "proposes_follow_up") {
    return `Documents a follow-up step proposed for the selected question: ${claim}.`;
  }
  if (relationshipType === "weakens") return `Documents a limitation that narrows the selected claim: ${claim}.`;
  if (relationshipType === "contradicts") return `Documents evidence that conflicts with the selected claim: ${claim}.`;
  const shared = significantTokens(targetText)
    .filter((token) => significantTokens(quote).includes(token))
    .slice(0, 4);
  return shared.length > 0
    ? `Documents the source observations about ${shared.join(", ")} used in the selected claim.`
    : `Directly documents the source observation used in the selected claim: ${claim}.`;
}

function isVagueRelevanceExplanation(value: string) {
  return /supports? (?:the )?(?:reported|selected|overall) (?:assessment|finding|conclusion)|directly relevant (?:source )?evidence|relevant to the (?:analysis|question)/i.test(value);
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
    "study", "report", "document", "source", "patient", "patients", "finding", "findings", "evidence",
    "clinical", "uploaded", "current", "question", "result", "results", "reported", "described",
  ]);
  return Array.from(new Set(
    text.toLowerCase().match(/[a-z0-9.]+/g)?.filter((token) => token.length > 2 && !stop.has(token)) ?? [],
  ));
}
