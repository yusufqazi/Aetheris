import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

import { getLlmConfiguration, type LlmProvider } from "@/lib/llm";
import { chunkDocument } from "@/lib/pdf.shared";
import { requestedAnswerDimensions } from "@/lib/research/claims";
import { semanticFamily } from "@/lib/research/evidence-relationships";
import type {
  EvidenceItem,
  RetrievalMethod,
  SearchChunk,
  UploadedDocument,
} from "@/lib/types";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "from", "this", "into", "were", "have",
  "across", "these", "their", "about", "what", "which", "when", "where", "does",
]);

interface IndexedChunk extends SearchChunk {
  embedding?: number[];
}

export interface EvidenceIndex {
  chunks: IndexedChunk[];
  method: RetrievalMethod;
  embeddingModel?: string | null;
  embeddingProvider?: LlmProvider | null;
}

export interface IndexProgress {
  completed: number;
  total: number;
  method: RetrievalMethod;
}

export function tokenize(input: string) {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
    ),
  );
}

export function keywordScore(query: string, text: string) {
  const queryTokens = tokenize(query);
  const textLower = text.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    const occurrences = textLower.split(token).length - 1;
    if (occurrences > 0) {
      score += Math.min(occurrences, 4) * (token.length > 7 ? 3 : 2);
    }
  }

  return score;
}

export async function buildEvidenceIndex(
  documents: UploadedDocument[],
  onProgress?: (progress: IndexProgress) => void | Promise<void>,
  preparedChunks?: SearchChunk[],
): Promise<EvidenceIndex> {
  const chunks = preparedChunks ?? documents.flatMap((document) => chunkDocument(document));
  const configuration = getLlmConfiguration();

  if (!configuration.enabled || !configuration.provider || !configuration.embeddingModel || chunks.length === 0) {
    await onProgress?.({ completed: chunks.length, total: chunks.length, method: "lexical" });
    return { chunks, method: "lexical", embeddingModel: null, embeddingProvider: null };
  }

  const indexed: IndexedChunk[] = [];
  const batchSize = configuration.provider === "google" ? 32 : 48;

  try {
    for (let offset = 0; offset < chunks.length; offset += batchSize) {
      const batch = chunks.slice(offset, offset + batchSize);
      const embeddings = configuration.provider === "google"
        ? await embedWithGoogle(batch.map((chunk) => chunk.text), configuration.embeddingModel, "RETRIEVAL_DOCUMENT")
        : await embedWithOpenAi(batch.map((chunk) => chunk.text), configuration.embeddingModel);

      if (embeddings.length !== batch.length || embeddings.some((embedding) => embedding.length === 0)) {
        throw new Error("The embedding provider returned an incomplete passage batch.");
      }

      for (let index = 0; index < batch.length; index += 1) {
        indexed.push({ ...batch[index], embedding: embeddings[index] });
      }

      await onProgress?.({
        completed: Math.min(offset + batch.length, chunks.length),
        total: chunks.length,
        method: "embedding",
      });
    }

    return {
      chunks: indexed,
      method: "embedding",
      embeddingModel: configuration.embeddingModel,
      embeddingProvider: configuration.provider,
    };
  } catch (error) {
    console.error("[Aetheris retrieval] Semantic embedding failed; using lexical retrieval.", error);
    await onProgress?.({ completed: chunks.length, total: chunks.length, method: "lexical" });
    return { chunks, method: "lexical", embeddingModel: null, embeddingProvider: null };
  }
}

export async function retrieveFromIndex(index: EvidenceIndex, query: string, limit = 10) {
  let queryEmbedding: number[] | null = null;

  if (index.method === "embedding" && index.embeddingModel && index.embeddingProvider) {
    try {
      const embeddings = index.embeddingProvider === "google"
        ? await embedWithGoogle([query], index.embeddingModel, "RETRIEVAL_QUERY")
        : await embedWithOpenAi([query], index.embeddingModel);
      queryEmbedding = embeddings[0] ?? null;
    } catch (error) {
      console.error("[Aetheris retrieval] Query embedding failed; using lexical ranking.", error);
      queryEmbedding = null;
    }
  }

  const ranked = rankEvidenceChunks(index.chunks, query, queryEmbedding, limit);
  return { chunks: ranked, method: queryEmbedding ? "embedding" : "lexical" };
}

export function rankEvidenceChunks(
  chunks: Array<SearchChunk & { embedding?: number[] }>,
  query: string,
  queryEmbedding: number[] | null,
  limit = 10,
) {
  const queryTerms = tokenize(query);
  const lexicalScores = chunks.map((chunk) => keywordScore(query, chunk.text));
  const maxLexical = Math.max(1, ...lexicalScores);
  const method: RetrievalMethod = queryEmbedding ? "embedding" : "lexical";

  const scored = chunks
    .map((chunk, chunkIndex) => {
      const lexicalScore = lexicalScores[chunkIndex] / maxLexical;
      const similarityScore = queryEmbedding && chunk.embedding
        ? clampSimilarity(cosineSimilarity(queryEmbedding, chunk.embedding))
        : null;
      const baseScore = similarityScore === null
        ? lexicalScore
        : similarityScore * 0.82 + lexicalScore * 0.18;
      const score = Math.min(1, baseScore + evidenceSpecificityBonus(chunk.text, query));

      return {
        ...chunk,
        score,
        lexicalScore,
        similarityScore,
        matchedTerms: queryTerms.filter((term) => chunk.text.toLowerCase().includes(term)),
        retrievalMethod: method,
      } satisfies SearchChunk;
    })
    .sort((left, right) => right.score - left.score);

  return selectDiverseEvidence(scored, query, limit)
    .map((chunk, position) => ({ ...chunk, rank: position + 1 }));
}

export async function retrieveRelevantChunks(documents: UploadedDocument[], query: string, limit = 8) {
  const index = await buildEvidenceIndex(documents);
  const result = await retrieveFromIndex(index, query, limit);
  return result.chunks;
}

export function chunksToEvidence(chunks: SearchChunk[], relevance: string): EvidenceItem[] {
  return chunks.map((chunk) => ({
    id: `evidence:${chunk.id}`,
    chunkId: chunk.id,
    documentId: chunk.documentId,
    excerpt: chunk.text,
    documentName: chunk.documentName,
    page: chunk.page,
    section: chunk.page ? `Page ${chunk.page}` : null,
    relevance,
    contextBefore: chunk.contextBefore,
    contextAfter: chunk.contextAfter,
    matchedTerms: chunk.matchedTerms,
    lexicalScore: chunk.lexicalScore,
    similarityScore: chunk.similarityScore,
    retrievalMethod: chunk.retrievalMethod ?? "lexical",
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
  }));
}

export function summarizeChunkCoverage(chunks: SearchChunk[]) {
  return chunks.map((chunk) => ({
    documentName: chunk.documentName,
    page: chunk.page,
    excerpt: chunk.text.slice(0, 240),
  }));
}

async function embedWithGoogle(texts: string[], model: string, taskType: string) {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
  const usesEmbedding2 = model === "gemini-embedding-2";
  const instruction = taskType === "RETRIEVAL_DOCUMENT"
    ? "Represent this clinical source passage for evidence retrieval"
    : "Represent this clinical research question for retrieving relevant evidence";
  const response = await client.models.embedContent({
    model,
    contents: usesEmbedding2
      ? texts.map((text) => ({ role: "user", parts: [{ text: `${instruction}:\n${text}` }] }))
      : texts,
    config: usesEmbedding2
      ? { outputDimensionality: 768 }
      : { taskType },
  });
  return (response.embeddings ?? []).map((embedding) => embedding.values ?? []);
}

async function embedWithOpenAi(texts: string[], model: string) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.embeddings.create({ model, input: texts, encoding_format: "float" });
  return response.data.map((item) => item.embedding);
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function clampSimilarity(value: number) {
  return Math.max(0, Math.min(1, (value + 1) / 2));
}

function selectDiverseEvidence(chunks: SearchChunk[], query: string, limit: number) {
  const selected: SearchChunk[] = [];
  const remaining = [...chunks];
  const requestedDimensions = requestedAnswerDimensions(query);
  const requestedFacets = requestedEvidenceFacets(query);

  // Diagnosis, treatment, objective support, and unresolved decision inputs
  // are distinct evidence jobs even when they share a broad UI category.
  for (const facet of requestedFacets) {
    if (selected.length >= limit) break;
    const index = remaining.findIndex((chunk) => chunkEvidenceFacets(chunk.text).includes(facet));
    if (index < 0) continue;
    selected.push(remaining[index]);
    remaining.splice(index, 1);
  }

  // Reserve one strong passage for each part of a multi-part research question.
  for (const dimension of requestedDimensions) {
    if (selected.length >= limit) break;
    const index = remaining.findIndex((chunk) => chunkDimensions(chunk.text).includes(dimension));
    if (index < 0) continue;
    selected.push(remaining[index]);
    remaining.splice(index, 1);
  }

  while (selected.length < limit && remaining.length > 0) {
    const topRemainingScore = Math.max(...remaining.map((chunk) => chunk.score));
    const seenFamilies = new Set(selected.map((chunk) => semanticFamily(chunk.text)));
    const novelCandidates = remaining.filter((chunk) =>
      !seenFamilies.has(semanticFamily(chunk.text)) &&
      (chunk.score >= topRemainingScore * 0.55 || chunk.matchedTerms.length > 0),
    );
    const pool = novelCandidates.length > 0 ? novelCandidates : remaining;
    const next = [...pool].sort((left, right) =>
      diversifiedScore(right, selected) - diversifiedScore(left, selected),
    )[0];
    selected.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }

  return selected;
}

function diversifiedScore(candidate: SearchChunk, selected: SearchChunk[]) {
  const newDocument = selected.every((item) => item.documentId !== candidate.documentId);
  const samePage = selected.some((item) =>
    item.documentId === candidate.documentId && item.page === candidate.page,
  );
  const familyRepeated = selected.some((item) => semanticFamily(item.text) === semanticFamily(candidate.text));
  const overlap = Math.max(0, ...selected.map((item) => tokenOverlap(candidate.text, item.text)));
  return candidate.score
    + Number(newDocument) * 0.06
    - Number(samePage) * 0.04
    - Number(familyRepeated) * 0.28
    - overlap * 0.18;
}

function chunkDimensions(text: string) {
  const dimensions = [] as ReturnType<typeof requestedAnswerDimensions>;
  if (/efficacy|effective|response|improv|benefit|outcome|endpoint|decreased|increased|quality.of.life/i.test(text)) {
    dimensions.push("efficacy");
  }
  if (/safety|adverse|risk|harm|interaction|medication|drug|qtc?|arrhythmia|bleed|nausea|headache/i.test(text)) {
    dimensions.push("safety");
  }
  if (/limitation|limited|uncertain|missing|unresolved|excluded|not (?:measured|established|evaluated)|follow-up is needed|generaliz/i.test(text)) {
    dimensions.push("limitation");
  }
  if (dimensions.length === 0) dimensions.push("context");
  return dimensions;
}

function evidenceSpecificityBonus(text: string, query: string) {
  const numeric = /\b\d+(?:\.\d+)?\s*(?:%|mg|g\/dL|ng\/mL|mmol\/L|ms|weeks?|months?|participants?|patients?)\b|\bp\s*[=<]\s*0?\.\d+/i.test(text);
  const qualifying = /does not prove|not establish|uncertain|remains? (?:low|unknown)|excluded|limitation/i.test(text);
  const diagnostic = /\b(?:diagnos(?:is|ed)|strongly support\w*|consistent with|meets? (?:the )?criteria|leading (?:diagnosis|interpretation)|confirmed)\b/i.test(text);
  const treatmentDecision = /\b(?:recommend\w*|should|start\w*|initiat\w*|continue\w*|defer\w*|delay\w*|hold|until|proceed\w*|monitor\w*|obtain\w*|perform\w*)\b/i.test(text);
  const objective = /\b(?:laborator|biomarker|imaging|patholog|biopsy|culture|antibod|protein|creatinine|complement|measurement|result)\w*\b/i.test(text);
  const asksDiagnosis = requestedEvidenceFacets(query).includes("diagnosis");
  const asksTreatment = requestedEvidenceFacets(query).includes("treatment");
  return Number(numeric) * 0.035
    + Number(qualifying) * 0.025
    + Number(diagnostic && asksDiagnosis) * 0.06
    + Number(treatmentDecision && asksTreatment) * 0.06
    + Number(objective) * 0.035;
}

type EvidenceFacet = "diagnosis" | "treatment" | "objective" | "safety" | "longitudinal" | "uncertainty" | "outcome" | "context";

function requestedEvidenceFacets(query: string): EvidenceFacet[] {
  const facets: EvidenceFacet[] = [];
  const add = (facet: EvidenceFacet) => {
    if (!facets.includes(facet)) facets.push(facet);
  };
  if (/\b(?:diagnos|cause|etiolog|leading interpretation|explain(?:s|ed)? the presentation)\b/i.test(query)) add("diagnosis");
  if (/\b(?:treat|therap|manage|management|recommend|should|decision|next step|proceed|defer|delay|monitor)\w*\b/i.test(query)) add("treatment");
  if (/\b(?:laborator|biomarker|imaging|patholog|biopsy|culture|test result|measurement)\w*\b/i.test(query)) add("objective");
  if (/\b(?:safety|risk|harm|adverse|contraindicat|concern|tradeoff|trade-off)\w*\b/i.test(query)) add("safety");
  if (/\b(?:trend|trajectory|longitudinal|over time|follow-up|progress|improv|worsen)\w*\b/i.test(query)) add("longitudinal");
  if (/\b(?:uncertain|unknown|missing|gap|unresolved|limitation|excluded|generaliz|remain(?:s|ing)? evidence)\w*\b/i.test(query)) add("uncertainty");
  if (/\b(?:efficacy|response|outcome|benefit|effect)\w*\b/i.test(query)) add("outcome");
  return facets.length > 0 ? facets : ["context"];
}

function chunkEvidenceFacets(text: string): EvidenceFacet[] {
  const facets: EvidenceFacet[] = [];
  const add = (facet: EvidenceFacet) => {
    if (!facets.includes(facet)) facets.push(facet);
  };
  if (/\b(?:diagnos(?:is|ed)|strongly support\w*|consistent with|meets? (?:the )?criteria|leading (?:diagnosis|interpretation)|confirmed)\b/i.test(text)) add("diagnosis");
  if (/\b(?:recommend\w*|should|start\w*|initiat\w*|continue\w*|defer\w*|delay\w*|hold|until|proceed\w*|monitor\w*|obtain\w*|perform\w*)\b/i.test(text)) add("treatment");
  if (/\b(?:laborator|biomarker|imaging|patholog|biopsy|culture|antibod|protein|creatinine|complement|measurement|result)\w*\b/i.test(text)) add("objective");
  if (/\b(?:safety|risk|harm|adverse|contraindicat|concern|complication|toxicity)\w*\b/i.test(text)) add("safety");
  if (/\b(?:baseline|follow-up|later|earlier|trend|trajectory|improv\w*|worsen\w*|increas\w*|decreas\w*)\b/i.test(text)) add("longitudinal");
  if (/\b(?:uncertain|unknown|missing|pending|not (?:measured|performed|established|available)|unresolved|limitation)\w*\b/i.test(text)) add("uncertainty");
  if (/\b(?:efficacy|response|outcome|benefit|effect|endpoint)\w*\b/i.test(text)) add("outcome");
  return facets.length > 0 ? facets : ["context"];
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const shared = leftTokens.filter((token) => rightTokens.includes(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : shared / union;
}
