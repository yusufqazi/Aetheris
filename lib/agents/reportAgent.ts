import { getAgentPrompt, RESEARCH_DISCLAIMER } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import type {
  AdverseReactionAgentOutput,
  DebateConsensusOutput,
  DrugInteractionAgentOutput,
  LiteratureSearchAgentOutput,
  ReportOutput,
  TrialSummarizerAgentOutput,
} from "@/lib/types";
import { defaultWarnings } from "@/lib/agents/shared";

export async function runReportAgent(payload: {
  question: string;
  literature: LiteratureSearchAgentOutput;
  drug: DrugInteractionAgentOutput;
  adverse: AdverseReactionAgentOutput;
  trial: TrialSummarizerAgentOutput;
  debate: DebateConsensusOutput;
}) {
  const { question, literature, drug, adverse, trial, debate } = payload;

  return runStructuredGeneration<ReportOutput>({
    system: getAgentPrompt("report-generation"),
    user: JSON.stringify(payload),
    fallback: () => {
      const keyFindings = [
        literature.summary,
        drug.summary,
        adverse.summary,
        debate.finalConsensus,
      ];

      const markdownReport = `# Aetheris Research Brief

## Executive Summary
${debate.finalConsensus}

## Key Findings
${keyFindings.map((finding) => `- ${finding}`).join("\n")}

## Physician-Style Briefing
${trial.summary}

## Patient-Friendly Summary
${adverse.summary}

## Risks and Uncertainties
${debate.missingEvidence.map((item) => `- ${item}`).join("\n")}

## Disclaimer
${RESEARCH_DISCLAIMER}`;

      return {
        agentName: "Report Generation Agent",
        summary: "Combined the specialized agent outputs into a single structured report.",
        confidence: "medium",
        limitations: ["This report should be reviewed against the original PDFs before distribution."],
        warnings: defaultWarnings(),
        evidence: literature.evidence.slice(0, 4),
        executiveSummary: debate.finalConsensus,
        keyFindings,
        evidenceTable: [
          {
            topic: "Retrieved evidence",
            finding: literature.topRelevantExcerpts[0]?.excerpt ?? "No excerpt available",
            supportingSource: literature.topRelevantExcerpts[0]
              ? `${literature.topRelevantExcerpts[0].documentName} p.${literature.topRelevantExcerpts[0].page ?? "n/a"}`
              : "Uploaded documents",
            confidence: literature.confidence,
          },
        ],
        risksAndUncertainties: debate.missingEvidence,
        recommendedFollowUpQuestions: [
          `What additional evidence is needed to answer: ${question}?`,
          "Would regulatory labeling or supplementary appendices change the conclusion?",
        ],
        researchDisclaimer: RESEARCH_DISCLAIMER,
        physicianBriefing: `${trial.summary} ${drug.summary}`,
        patientFriendlySummary:
          "This summary highlights what the uploaded documents say about benefits and risks in simpler language, but it should not be treated as personal medical advice.",
        markdownReport,
      };
    },
  });
}
