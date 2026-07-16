import { getAgentPrompt } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import type { AdverseReactionAgentOutput, SearchChunk } from "@/lib/types";
import {
  asEvidence,
  confidenceFromEvidence,
  defaultWarnings,
  groundedFactsFromChunks,
  hasConcreteContent,
  type FallbackObserver,
} from "@/lib/agents/shared";
import { factsByCategory } from "@/lib/research/grounding";
import { adverseReactionOutputSchema } from "@/lib/research/schemas";

const EVENT_WORDS = [
  "adverse",
  "warning",
  "contraindication",
  "toxicity",
  "safety",
  "fatigue",
  "nausea",
  "dizziness",
  "rash",
];

export async function runAdverseReactionAgent({
  question,
  chunks,
  onFallback,
}: {
  question: string;
  chunks: SearchChunk[];
  onFallback?: FallbackObserver;
}) {
  const matched = chunks.filter((chunk) =>
    EVENT_WORDS.some((word) => chunk.text.toLowerCase().includes(word)),
  );
  const sourceChunks = matched.length > 0 ? matched : chunks;
  const safetyFacts = factsByCategory(groundedFactsFromChunks(sourceChunks, question), "safety");

  return runStructuredGeneration<AdverseReactionAgentOutput>({
    system: getAgentPrompt("adverse-reaction"),
    user: JSON.stringify({ question, chunks: sourceChunks.slice(0, 6) }),
    schema: adverseReactionOutputSchema,
    schemaName: "adverse_reaction_output",
    qualityCheck: (output) => hasConcreteContent(output),
    onFallback,
    fallback: () => ({
      agentName: "Adverse Reaction Agent",
      summary:
        safetyFacts.length > 0
          ? safetyFacts.map((fact) => fact.text).join(" ")
          : "No explicit adverse-event finding was present in the retrieved passages.",
      confidence: confidenceFromEvidence(safetyFacts.length, sourceChunks.length),
      limitations: [
        "Event frequencies may be absent or partial when source tables are not fully captured in extracted text.",
      ],
      warnings: defaultWarnings(),
      evidence: asEvidence(sourceChunks),
      findings: safetyFacts.map((fact) => ({
        adverseEvent: fact.text,
        frequency: fact.text.match(/\d+(?:\.\d+)?\s*%/g)?.join(", ") ?? "Frequency not stated in this excerpt",
        affectedPopulation: "Reported study population",
        sourceEvidence: fact.excerpt,
        confidenceLevel: confidenceFromEvidence(1, sourceChunks.length),
      })).slice(0, 6),
    }),
  });
}
