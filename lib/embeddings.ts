import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

import { getLlmConfiguration, type LlmProvider } from "@/lib/llm";
import { chunkDocument } from "@/lib/pdf.shared";
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

  return chunks
    .map((chunk, chunkIndex) => {
      const lexicalScore = lexicalScores[chunkIndex] / maxLexical;
      const similarityScore = queryEmbedding && chunk.embedding
        ? clampSimilarity(cosineSimilarity(queryEmbedding, chunk.embedding))
        : null;
      const score = similarityScore === null
        ? lexicalScore
        : similarityScore * 0.82 + lexicalScore * 0.18;

      return {
        ...chunk,
        score,
        lexicalScore,
        similarityScore,
        matchedTerms: queryTerms.filter((term) => chunk.text.toLowerCase().includes(term)),
        retrievalMethod: method,
      } satisfies SearchChunk;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
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
