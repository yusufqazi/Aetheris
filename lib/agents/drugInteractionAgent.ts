import { getAgentPrompt } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import type { DrugInteractionAgentOutput, SearchChunk } from "@/lib/types";
import { asEvidence, defaultWarnings, pickSentences } from "@/lib/agents/shared";

const SIGNAL_WORDS = ["interaction", "cyp", "inhibitor", "inducer", "coadmin", "exposure"];

export async function runDrugInteractionAgent({
  question,
  chunks,
}: {
  question: string;
  chunks: SearchChunk[];
}) {
  const interactionChunks = chunks.filter((chunk) =>
    SIGNAL_WORDS.some((word) => chunk.text.toLowerCase().includes(word)),
  );

  return runStructuredGeneration<DrugInteractionAgentOutput>({
    system: getAgentPrompt("drug-interaction"),
    user: JSON.stringify({ question, chunks: interactionChunks.slice(0, 6) }),
    fallback: () => ({
      agentName: "Drug Interaction Agent",
      summary:
        interactionChunks.length > 0
          ? "Potential interaction signals were detected in the retrieved evidence, but their severity should be treated as a research hypothesis."
          : "No explicit interaction-heavy passages were retrieved, so interaction conclusions remain tentative.",
      confidence: interactionChunks.length > 1 ? "medium" : "low",
      limitations: [
        "This assistant cannot determine clinical significance without full labeling, mechanistic data, or expert review.",
      ],
      warnings: defaultWarnings(),
      evidence: asEvidence(interactionChunks.length > 0 ? interactionChunks : chunks),
      findings: [
        {
          possibleInteraction:
            interactionChunks[0]
              ? "Possible pharmacokinetic or co-administration concern referenced in the uploaded material."
              : "No explicit drug-drug interaction was confirmed in the retrieved excerpts.",
          severityEstimate: interactionChunks[0] ? "moderate" : "unclear",
          uncertaintyLevel: interactionChunks[0] ? "medium" : "high",
          notes: interactionChunks[0]
            ? pickSentences(interactionChunks[0].text)
            : "Further source review is needed before drawing conclusions.",
          evidence: interactionChunks[0]?.text.slice(0, 240) ?? "No direct interaction language surfaced in the top-ranked chunks.",
        },
      ],
    }),
  });
}
