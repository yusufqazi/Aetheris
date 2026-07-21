import type {
  Citation,
  EvidenceItem,
  GroundedFact,
  ResearchSession,
  UploadedDocument,
} from "@/lib/types";

export interface ExactEvidenceSpan {
  quote: string;
  startOffset: number;
  endOffset: number;
}

export function findExactEvidenceSpan(pageText: string, candidateQuote: string): ExactEvidenceSpan | null {
  const quote = candidateQuote.trim();
  if (!pageText || !quote) return null;

  const exactStart = pageText.indexOf(quote);
  if (exactStart >= 0) {
    return { quote, startOffset: exactStart, endOffset: exactStart + quote.length };
  }

  const source = normalizeWhitespaceWithOffsets(pageText);
  const normalizedQuote = quote.replace(/\s+/g, " ").trim();
  const normalizedStart = source.text.indexOf(normalizedQuote);
  if (normalizedStart < 0) return null;

  const startOffset = source.offsets[normalizedStart];
  const finalNormalizedIndex = normalizedStart + normalizedQuote.length - 1;
  const endOffset = (source.offsets[finalNormalizedIndex] ?? startOffset) + 1;
  return {
    quote: pageText.slice(startOffset, endOffset),
    startOffset,
    endOffset,
  };
}

export function getSessionCitations(session: ResearchSession): Citation[] {
  const persisted = session.results?.citations ?? session.results?.reportGeneration.citations ?? [];
  return createClaimCitations(
    session.evidence ?? session.results?.evidenceIndex ?? [],
    session.results?.groundedFacts ?? [],
    session.documents,
    persisted,
  );
}

export function createClaimCitations(
  evidence: EvidenceItem[],
  facts: GroundedFact[],
  documents: UploadedDocument[],
  persisted: Citation[] = [],
) {
  const citations: Citation[] = [];
  const usedIds = new Set<string>();
  const factsByEvidence = new Map<string, GroundedFact[]>();

  for (const fact of facts) {
    const linked = factsByEvidence.get(fact.evidenceId) ?? [];
    linked.push(fact);
    factsByEvidence.set(fact.evidenceId, linked);
  }

  for (const fact of facts) {
    const item = evidence.find((candidate) => candidate.id === fact.evidenceId);
    const pageText = pageTextFor(documents, fact.documentId, fact.page);
    const span = pageText ? findExactEvidenceSpan(pageText, fact.excerpt) : null;
    const existing = persisted.find((candidate) => candidate.evidenceId === fact.evidenceId);
    const preferredId = existing?.id ?? `citation:${fact.id}`;
    const id = usedIds.has(preferredId) ? `${preferredId}:${fact.id}` : preferredId;
    usedIds.add(id);
    citations.push({
      id,
      evidenceId: fact.evidenceId,
      chunkId: item?.chunkId ?? existing?.chunkId ?? fact.evidenceId,
      documentId: fact.documentId,
      documentName: fact.documentName,
      page: fact.page,
      excerpt: span?.quote ?? fact.excerpt,
      exactQuote: span?.quote ?? fact.excerpt,
      startOffset: span?.startOffset ?? null,
      endOffset: span?.endOffset ?? null,
      relevance: fact.relevance,
      supportedClaimIds: [fact.id],
      label: existing?.label ?? `[${citations.length + 1}]`,
    });
  }

  for (const item of evidence) {
    if (factsByEvidence.has(item.id)) continue;
    const existing = persisted.find((candidate) => candidate.evidenceId === item.id);
    const quoteCandidate = existing?.exactQuote
      ?? selectNarrowEvidenceQuote(existing?.excerpt ?? item.excerpt, item.matchedTerms);
    const pageText = pageTextFor(documents, item.documentId, item.page);
    const span = pageText && quoteCandidate ? findExactEvidenceSpan(pageText, quoteCandidate) : null;
    const id = existing?.id ?? `citation:${item.id}`;
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    citations.push({
      id,
      evidenceId: item.id,
      chunkId: item.chunkId,
      documentId: item.documentId,
      documentName: item.documentName,
      page: item.page,
      excerpt: span?.quote ?? quoteCandidate ?? item.excerpt,
      exactQuote: span?.quote ?? quoteCandidate ?? undefined,
      startOffset: span?.startOffset ?? null,
      endOffset: span?.endOffset ?? null,
      relevance: item.relevance,
      supportedClaimIds: [],
      label: existing?.label ?? `[${citations.length + 1}]`,
    });
  }

  return mergeEquivalentCitations(citations).map((citation, index) => ({
    ...citation,
    label: `[${index + 1}]`,
  }));
}

export function selectNarrowEvidenceQuote(text: string, matchedTerms: string[] = []) {
  const candidates = text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 12 && value.length <= 520);
  if (candidates.length === 0) return text.length <= 520 ? text.trim() : null;

  const terms = matchedTerms.map((term) => term.toLowerCase());
  return [...candidates].sort((left, right) => {
    const score = (value: string) => terms.filter((term) => value.toLowerCase().includes(term)).length;
    return score(right) - score(left);
  })[0];
}

export function surroundingEvidenceContext(
  pageText: string,
  startOffset: number,
  endOffset: number,
) {
  const before = pageText.slice(0, startOffset);
  const after = pageText.slice(endOffset);
  const beforeParts = before.split(/(?<=[.!?])\s+|\n+/).map((value) => value.trim()).filter(Boolean);
  const afterParts = after.split(/(?<=[.!?])\s+|\n+/).map((value) => value.trim()).filter(Boolean);
  return {
    before: beforeParts.slice(-2).join(" "),
    after: afterParts.slice(0, 2).join(" "),
  };
}

export function pageTextFor(
  documents: UploadedDocument[],
  documentId: string,
  pageNumber?: number | null,
) {
  const document = documents.find((item) => item.id === documentId);
  return document?.pages.find((page) => page.number === pageNumber)?.text ?? "";
}

function normalizeWhitespaceWithOffsets(value: string) {
  let text = "";
  const offsets: number[] = [];
  let inWhitespace = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/\s/.test(character)) {
      if (!inWhitespace && text) {
        text += " ";
        offsets.push(index);
      }
      inWhitespace = true;
      continue;
    }
    text += character;
    offsets.push(index);
    inWhitespace = false;
  }

  return { text: text.trim(), offsets };
}

function mergeEquivalentCitations(citations: Citation[]) {
  const merged = new Map<string, Citation>();
  for (const citation of citations) {
    const quote = (citation.exactQuote ?? citation.excerpt).toLowerCase().replace(/\s+/g, " ").trim();
    const key = `${citation.documentId}:${citation.page ?? "na"}:${citation.startOffset ?? quote}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, citation);
      continue;
    }
    merged.set(key, {
      ...existing,
      supportedClaimIds: Array.from(new Set([
        ...(existing.supportedClaimIds ?? []),
        ...(citation.supportedClaimIds ?? []),
      ])),
    });
  }
  return Array.from(merged.values());
}
