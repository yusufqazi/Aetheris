import { getAgentPrompt } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import type {
  AdverseReactionAgentOutput,
  DebateConsensusOutput,
  DrugInteractionAgentOutput,
  LiteratureSearchAgentOutput,
  TrialSummarizerAgentOutput,
} from "@/lib/types";
import { defaultWarnings, hasConcreteContent, type FallbackObserver } from "@/lib/agents/shared";
import { debateConsensusOutputSchema } from "@/lib/research/schemas";

export async function runDebateAgent(payload: {
  question: string;
  literature: LiteratureSearchAgentOutput;
  drug: DrugInteractionAgentOutput;
  adverse: AdverseReactionAgentOutput;
  trial: TrialSummarizerAgentOutput;
  onFallback?: FallbackObserver;
  shouldUseProvider?: () => boolean;
}) {
  const { question, literature, drug, adverse, trial, onFallback, shouldUseProvider } = payload;
  const modelPayload = {
    question,
    specialists: {
      literature: { summary: literature.summary },
      drugInteractions: {
        summary: drug.summary,
        findings: drug.findings.map((finding) => ({
          possibleInteraction: finding.possibleInteraction,
          severityEstimate: finding.severityEstimate,
          uncertaintyLevel: finding.uncertaintyLevel,
          notes: finding.notes,
        })),
      },
      adverseReactions: {
        summary: adverse.summary,
        findings: adverse.findings.map((finding) => ({
          adverseEvent: finding.adverseEvent,
          frequency: finding.frequency,
          affectedPopulation: finding.affectedPopulation,
          confidenceLevel: finding.confidenceLevel,
        })),
      },
      clinicalContext: {
        summary: trial.summary,
        findings: trial.findings,
      },
    },
  };

  return runStructuredGeneration<DebateConsensusOutput>({
    system: getAgentPrompt("debate-consensus"),
    user: JSON.stringify(modelPayload),
    schema: debateConsensusOutputSchema,
    schemaName: "debate_consensus_output",
    qualityCheck: (output) => output.finalConsensus.trim().length > 30 && hasConcreteContent(output),
    onFallback,
    shouldUseProvider,
    fallback: () => ({
      agentName: "Debate / Consensus Agent",
      summary: "Compared agent outputs to surface aligned findings, open disagreements, and missing evidence.",
      confidence: trial.confidence === "high" && adverse.confidence === "high"
        ? "high"
        : trial.confidence === "low" && adverse.confidence === "low"
          ? "low"
          : "medium",
      limitations: [
        "The consensus engine synthesizes agent outputs and inherits any gaps from the underlying document retrieval.",
      ],
      warnings: defaultWarnings(),
      evidence: literature.evidence.slice(0, 3),
      agreements: [drug.summary, trial.summary, adverse.summary].filter(Boolean),
      disagreements: [
        drug.findings[0]?.severityEstimate === "moderate"
          ? "Interaction concern appears plausible, but the exact severity is not well established."
          : "Interaction risk could not be substantiated from the retrieved excerpts.",
      ],
      missingEvidence: [
        "Source tables or appendices not fully represented in plain-text extraction",
        "External literature or regulatory context outside the uploaded PDFs",
      ],
      finalConsensus: `${drug.summary} ${trial.summary} ${adverse.summary}`.trim(),
    }),
  });
}
