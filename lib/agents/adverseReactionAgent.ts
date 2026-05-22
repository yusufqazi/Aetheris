import { getAgentPrompt } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import type { AdverseReactionAgentOutput, SearchChunk } from "@/lib/types";
import { asEvidence, defaultWarnings, pickSentences } from "@/lib/agents/shared";

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
}: {
  question: string;
  chunks: SearchChunk[];
}) {
  const matched = chunks.filter((chunk) =>
    EVENT_WORDS.some((word) => chunk.text.toLowerCase().includes(word)),
  );

  return runStructuredGeneration<AdverseReactionAgentOutput>({
    system: getAgentPrompt("adverse-reaction"),
    user: JSON.stringify({ question, chunks: matched.slice(0, 6) }),
    fallback: () => ({
      agentName: "Adverse Reaction Agent",
      summary:
        matched.length > 0
          ? "Safety language and adverse-event references were identified in the uploaded sources."
          : "Only limited safety-specific language was retrieved, so adverse-event extraction is incomplete.",
      confidence: matched.length > 1 ? "medium" : "low",
      limitations: [
        "Event frequencies may be absent or partial when source tables are not fully captured in extracted text.",
      ],
      warnings: defaultWarnings(),
      evidence: asEvidence(matched.length > 0 ? matched : chunks),
      findings: (matched.slice(0, 3).map((chunk) => ({
        adverseEvent: "Safety-related event or warning signal",
        frequency: "Not consistently reported in retrieved text",
        affectedPopulation: "Population requires confirmation from source tables",
        sourceEvidence: pickSentences(chunk.text),
        confidenceLevel: "medium" as const,
      })) || []).slice(0, 3),
    }),
  });
}
