import { getAgentPrompt } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import type { LiteratureSearchAgentOutput, SearchChunk } from "@/lib/types";
import { asEvidence, defaultWarnings } from "@/lib/agents/shared";

export async function runLiteratureSearchAgent({
  question,
  chunks,
}: {
  question: string;
  chunks: SearchChunk[];
}) {
  return runStructuredGeneration<LiteratureSearchAgentOutput>({
    system: getAgentPrompt("literature-search"),
    user: JSON.stringify({ question, chunks: chunks.slice(0, 6) }),
    fallback: () => ({
      agentName: "Literature Search Agent",
      summary: "Retrieved the passages most relevant to the research question across the uploaded PDFs.",
      confidence: chunks.length > 0 ? "medium" : "low",
      limitations: [
        "This MVP uses chunk ranking with keyword similarity and is structured so vector search can be added later.",
      ],
      warnings: defaultWarnings(),
      evidence: asEvidence(chunks),
      topRelevantExcerpts: chunks.slice(0, 5).map((chunk) => ({
        excerpt: chunk.text.slice(0, 280),
        documentName: chunk.documentName,
        page: chunk.page,
        section: chunk.page ? `Page ${chunk.page}` : null,
        relevanceExplanation: `Matched to the query "${question}" based on topical overlap.`,
      })),
    }),
  });
}
