import { getAgentPrompt } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import type { SearchChunk, TrialSummarizerAgentOutput } from "@/lib/types";
import { asEvidence, defaultWarnings, pickSentences } from "@/lib/agents/shared";

export async function runTrialSummarizerAgent({
  question,
  chunks,
}: {
  question: string;
  chunks: SearchChunk[];
}) {
  return runStructuredGeneration<TrialSummarizerAgentOutput>({
    system: getAgentPrompt("trial-summarizer"),
    user: JSON.stringify({ question, chunks: chunks.slice(0, 6) }),
    fallback: () => ({
      agentName: "Clinical Trial Summarizer Agent",
      summary: "Compiled a concise study briefing focused on methods, findings, limitations, and relevance.",
      confidence: chunks.length > 2 ? "medium" : "low",
      limitations: [
        "If the PDFs contain multiple studies, findings should be validated study-by-study before external sharing.",
      ],
      warnings: defaultWarnings(),
      evidence: asEvidence(chunks),
      findings: [
        {
          studyObjective: "Assess the principal research objective described in the uploaded material.",
          methods: pickSentences(chunks[0]?.text ?? "Methods details were limited in the retrieved excerpts."),
          keyFindings: pickSentences(chunks[1]?.text ?? chunks[0]?.text ?? "Key findings require more study-specific extraction."),
          limitations: "Study limitations should be checked against appendices, sample size notes, and follow-up duration.",
          relevance: `Relevant to the question: ${question}`,
        },
      ],
    }),
  });
}
