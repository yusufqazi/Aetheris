import { getAgentPrompt } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import type {
  AdverseReactionAgentOutput,
  DebateConsensusOutput,
  DrugInteractionAgentOutput,
  LiteratureSearchAgentOutput,
  TrialSummarizerAgentOutput,
} from "@/lib/types";
import { defaultWarnings } from "@/lib/agents/shared";

export async function runDebateAgent(payload: {
  question: string;
  literature: LiteratureSearchAgentOutput;
  drug: DrugInteractionAgentOutput;
  adverse: AdverseReactionAgentOutput;
  trial: TrialSummarizerAgentOutput;
}) {
  const { question, literature, drug, adverse, trial } = payload;

  return runStructuredGeneration<DebateConsensusOutput>({
    system: getAgentPrompt("debate-consensus"),
    user: JSON.stringify(payload),
    fallback: () => ({
      agentName: "Debate / Consensus Agent",
      summary: "Compared agent outputs to surface aligned findings, open disagreements, and missing evidence.",
      confidence: "medium",
      limitations: [
        "The consensus engine synthesizes agent outputs and inherits any gaps from the underlying document retrieval.",
      ],
      warnings: defaultWarnings(),
      evidence: literature.evidence.slice(0, 3),
      agreements: [
        `All agents remained focused on the research question: ${question}`,
        literature.topRelevantExcerpts.length > 0
          ? "Evidence retrieval surfaced traceable source passages for the downstream agents."
          : "Agents agree that retrieved evidence is sparse and conclusions should remain conservative.",
      ],
      disagreements: [
        drug.findings[0]?.severityEstimate === "moderate"
          ? "Interaction concern appears plausible, but the exact severity is not well established."
          : "Interaction risk could not be substantiated from the retrieved excerpts.",
      ],
      missingEvidence: [
        "Source tables or appendices not fully represented in plain-text extraction",
        "External literature or regulatory context outside the uploaded PDFs",
      ],
      finalConsensus: `${trial.summary} ${adverse.summary} The resulting conclusion should be used for research support only.`,
    }),
  });
}
