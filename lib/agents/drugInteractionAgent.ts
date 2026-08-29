import { getAgentPrompt } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import type { DrugInteractionAgentOutput, SearchChunk } from "@/lib/types";
import {
  asEvidence,
  confidenceFromEvidence,
  defaultWarnings,
  groundedFactsFromChunks,
  hasConcreteContent,
  normalizedReasoningInput,
  pickSentences,
  type FallbackObserver,
} from "@/lib/agents/shared";
import { factsByCategory } from "@/lib/research/grounding";
import { drugInteractionOutputSchema } from "@/lib/research/schemas";

const SIGNAL_WORDS = ["interaction", "cyp", "inhibitor", "inducer", "coadmin", "exposure"];

export async function runDrugInteractionAgent({
  question,
  chunks,
  onFallback,
  shouldUseProvider,
}: {
  question: string;
  chunks: SearchChunk[];
  onFallback?: FallbackObserver;
  shouldUseProvider?: () => boolean;
}) {
  const interactionChunks = chunks.filter((chunk) =>
    SIGNAL_WORDS.some((word) => chunk.text.toLowerCase().includes(word)),
  );
  const sourceChunks = interactionChunks.length > 0 ? interactionChunks : chunks;
  const interactionFacts = factsByCategory(
    groundedFactsFromChunks(sourceChunks, question),
    "interaction",
  );

  return runStructuredGeneration<DrugInteractionAgentOutput>({
    system: getAgentPrompt("drug-interaction"),
    user: JSON.stringify({
      question,
      normalizedEvidence: normalizedReasoningInput(sourceChunks.slice(0, 6)),
    }),
    schema: drugInteractionOutputSchema,
    schemaName: "drug_interaction_output",
    qualityCheck: (output) => output.findings.length > 0 && hasConcreteContent(output),
    onFallback,
    shouldUseProvider,
    fallback: () => ({
      agentName: "Drug Interaction Agent",
      summary: interactionFacts.length > 0
        ? interactionFacts.slice(0, 6).map((fact) => fact.text).join(" ")
        : "No explicit medication interaction was established in the retrieved passages.",
      confidence: confidenceFromEvidence(interactionFacts, sourceChunks),
      limitations: [
        "This assistant cannot determine clinical significance without full labeling, mechanistic data, or expert review.",
      ],
      warnings: defaultWarnings(),
      evidence: asEvidence(sourceChunks),
      findings: interactionFacts.length > 0
        ? interactionFacts.slice(0, 6).map((fact) => ({
            possibleInteraction: fact.text,
            severityEstimate: /clinically relevant|high priority|most important/i.test(fact.text)
              ? "high"
              : /moderate/i.test(fact.text)
                ? "moderate"
                : "unclear",
            uncertaintyLevel: /not proof|uncertain|unclear|may|possible/i.test(fact.text)
              ? "high"
              : "medium",
            notes: fact.relevance,
            evidence: fact.excerpt,
          }))
        : [{
            possibleInteraction: "No explicit drug-drug interaction was confirmed in the retrieved excerpts.",
            severityEstimate: "unclear",
            uncertaintyLevel: "high",
            notes: "Further source review is needed before drawing conclusions.",
            evidence: pickSentences(sourceChunks[0]?.text ?? "No direct interaction language surfaced."),
          }],
    }),
  });
}
