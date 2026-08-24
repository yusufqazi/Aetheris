import { extractGroundedFacts } from "@/lib/research/grounding";
import type {
  EvidenceItem,
  GroundedFact,
  GroundedFactCategory,
  NormalizedEvidenceBundle,
  NormalizedEvidenceObject,
  ResearchContentType,
} from "@/lib/types";

export function extractGroundedFactsFromNormalizedEvidence(
  normalized: NormalizedEvidenceBundle,
  sourceEvidence: EvidenceItem[],
  question: string,
) {
  const sourceById = new Map(sourceEvidence.map((item) => [item.id, item]));
  const facts: GroundedFact[] = [];

  for (const object of normalized.objects) {
    const source = sourceById.get(object.evidenceId);
    if (!source) continue;
    const normalizedEvidence: EvidenceItem = {
      ...source,
      id: object.id,
      excerpt: object.statement,
      contextBefore: "",
      contextAfter: "",
    };
    const extracted = extractGroundedFacts([normalizedEvidence], question);

    if (extracted.length === 0) {
      facts.push(factFromNormalizedObject(object, source));
      continue;
    }
    for (const fact of extracted) {
      facts.push({
        ...fact,
        id: `fact:${object.id}:${facts.length}`,
        category: categoryForNormalizedObject(object, fact.category),
        contentType: contentTypeForNormalizedObject(object, fact.contentType),
        evidenceId: source.id,
        documentId: source.documentId,
        documentName: source.documentName,
        page: source.page,
        excerpt: object.sourceExcerpt || source.excerpt,
      });
    }
  }

  return deduplicateFacts(facts);
}

function factFromNormalizedObject(
  object: NormalizedEvidenceObject,
  source: EvidenceItem,
): GroundedFact {
  return {
    id: `fact:${object.id}`,
    category: categoryForNormalizedObject(object, "context"),
    contentType: contentTypeForNormalizedObject(object, "finding"),
    text: object.statement,
    evidenceId: source.id,
    documentId: source.documentId,
    documentName: source.documentName,
    page: source.page,
    excerpt: object.sourceExcerpt || source.excerpt,
    relevance: relevanceForNormalizedObject(object),
  };
}

function contentTypeForNormalizedObject(
  object: NormalizedEvidenceObject,
  fallback: ResearchContentType,
): ResearchContentType {
  if (fallback !== "finding" && fallback !== "evidence_excerpt") return fallback;
  if (object.kind === "recommendation") return "recommendation";
  if (object.kind === "uncertainty" || object.kind === "limitation") return "limitation";
  return fallback === "evidence_excerpt" ? "finding" : fallback;
}

function categoryForNormalizedObject(
  object: NormalizedEvidenceObject,
  fallback: GroundedFactCategory,
): GroundedFactCategory {
  if (object.kind === "uncertainty" || object.kind === "limitation") return "limitation";
  if (fallback !== "context") return fallback;
  if (/\b(?:adverse|safety|toxicity|harm|fall|dizziness|somnolence|risk|contraindicat|worsen)\w*\b/i.test(object.statement)) {
    return "safety";
  }
  if (/\b(?:response|efficacy|benefit|improv|decreas|reduc|remission|survival|outcome)\w*\b/i.test(object.statement)) {
    return "efficacy";
  }
  if (/\bp\s*[=<]|confidence interval|statistical|randomi[sz]ed|placebo|comparator/i.test(object.statement)) {
    return "statistical";
  }
  return fallback;
}

function relevanceForNormalizedObject(object: NormalizedEvidenceObject) {
  return ({
    diagnosis: "Normalized diagnostic evidence linked to the exact source passage.",
    recommendation: "Normalized recommendation linked to the exact source passage.",
    uncertainty: "Normalized uncertainty statement linked to the exact source passage.",
    limitation: "Normalized evidence limitation linked to the exact source passage.",
    table_fact: "Structured table fact linked to the exact source passage.",
    observation: "Normalized clinical observation linked to the exact source passage.",
  } as const)[object.kind];
}

function deduplicateFacts(facts: GroundedFact[]) {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.evidenceId}:${fact.text.toLowerCase().replace(/[^a-z0-9.%]+/g, " ").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
