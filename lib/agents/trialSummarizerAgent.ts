import { getAgentPrompt } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import type { SearchChunk, TrialSummarizerAgentOutput } from "@/lib/types";
import {
  asEvidence,
  confidenceFromEvidence,
  defaultWarnings,
  groundedFactsFromChunks,
  hasConcreteContent,
  normalizedReasoningInput,
  type FallbackObserver,
} from "@/lib/agents/shared";
import { factsByCategory } from "@/lib/research/grounding";
import { trialSummarizerOutputSchema } from "@/lib/research/schemas";

export async function runTrialSummarizerAgent({
  question,
  chunks,
  onFallback,
}: {
  question: string;
  chunks: SearchChunk[];
  onFallback?: FallbackObserver;
}) {
  const facts = groundedFactsFromChunks(chunks, question);
  const design = factsByCategory(facts, "study-design");
  const findings = factsByCategory(facts, "efficacy", "statistical");
  const limitations = factsByCategory(facts, "limitation", "exclusion");
  return runStructuredGeneration<TrialSummarizerAgentOutput>({
    system: getAgentPrompt("trial-summarizer"),
    user: JSON.stringify({
      question,
      normalizedEvidence: normalizedReasoningInput(chunks.slice(0, 6)),
    }),
    schema: trialSummarizerOutputSchema,
    schemaName: "trial_summarizer_output",
    qualityCheck: (output) => output.findings.length > 0 && hasConcreteContent(output),
    onFallback,
    fallback: () => ({
      agentName: "Clinical Trial Summarizer Agent",
      summary: [...design, ...findings, ...limitations].slice(0, 4).map((fact) => fact.text).join(" "),
      confidence: confidenceFromEvidence(facts, chunks),
      limitations: [
        "If the PDFs contain multiple studies, findings should be validated study-by-study before external sharing.",
      ],
      warnings: defaultWarnings(),
      evidence: asEvidence(chunks),
      findings: [
        {
          studyObjective: question,
          methods: design.map((fact) => fact.text).join(" ") || "Study design details were not present in the retrieved passages.",
          keyFindings: findings.map((fact) => fact.text).join(" ") || "No concrete efficacy result was present in the retrieved passages.",
          limitations: limitations.map((fact) => fact.text).join(" ") || "No explicit study limitation was present in the retrieved passages.",
          relevance: `Relevant to the question: ${question}`,
        },
      ],
    }),
  });
}
