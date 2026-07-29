import { getAgentPrompt } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import type { LiteratureSearchAgentOutput, SearchChunk } from "@/lib/types";
import {
  asEvidence,
  confidenceFromEvidence,
  defaultWarnings,
  groundedFactsFromChunks,
  hasConcreteContent,
  type FallbackObserver,
} from "@/lib/agents/shared";
import { literatureSearchOutputSchema } from "@/lib/research/schemas";

export async function runLiteratureSearchAgent({
  question,
  chunks,
  onFallback,
}: {
  question: string;
  chunks: SearchChunk[];
  onFallback?: FallbackObserver;
}) {
  const facts = groundedFactsFromChunks(chunks, question);
  return runStructuredGeneration<LiteratureSearchAgentOutput>({
    system: getAgentPrompt("literature-search"),
    user: JSON.stringify({ question, chunks: chunks.slice(0, 6) }),
    schema: literatureSearchOutputSchema,
    schemaName: "literature_search_output",
    qualityCheck: (output) => output.topRelevantExcerpts.length > 0 && hasConcreteContent(output),
    onFallback,
    fallback: () => ({
      agentName: "Literature Search Agent",
      summary: facts.length > 0
        ? `Retrieved ${facts.length} concrete source facts, including: ${facts.slice(0, 2).map((fact) => fact.text).join(" ")}`
        : "No concrete source facts were present in the retrieved passages.",
      confidence: confidenceFromEvidence(facts, chunks),
      limitations: ["Local fallback ranks and extracts uploaded source text without adding external evidence."],
      warnings: defaultWarnings(),
      evidence: asEvidence(chunks),
      topRelevantExcerpts: facts.slice(0, 8).map((fact) => ({
        excerpt: fact.excerpt,
        documentName: fact.documentName,
        page: fact.page,
        section: fact.page ? `Page ${fact.page}` : null,
        relevanceExplanation: fact.relevance,
      })),
    }),
  });
}
