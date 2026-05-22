import { retrieveRelevantChunks } from "@/lib/embeddings";
import { runAdverseReactionAgent } from "@/lib/agents/adverseReactionAgent";
import { runDebateAgent } from "@/lib/agents/debateAgent";
import { runDrugInteractionAgent } from "@/lib/agents/drugInteractionAgent";
import { runLiteratureSearchAgent } from "@/lib/agents/literatureSearchAgent";
import { runReportAgent } from "@/lib/agents/reportAgent";
import { runTrialSummarizerAgent } from "@/lib/agents/trialSummarizerAgent";
import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import type { AgentId, AnalysisBundle, UploadedDocument } from "@/lib/types";

export async function runMultiAgentAnalysis({
  question,
  documents,
  selectedAgents,
}: {
  question: string;
  documents: UploadedDocument[];
  selectedAgents: AgentId[];
}) {
  const chunks = retrieveRelevantChunks(documents, question, 10);

  const literatureSearch = selectedAgents.includes("literature-search")
    ? await runLiteratureSearchAgent({ question, chunks })
    : {
        agentName: "Literature Search Agent",
        summary: "This agent was disabled for the current run.",
        confidence: "low" as const,
        limitations: ["No retrieval output was generated because the agent was not selected."],
        warnings: [RESEARCH_DISCLAIMER],
        evidence: [],
        topRelevantExcerpts: [],
      };

  const drugInteraction = selectedAgents.includes("drug-interaction")
    ? await runDrugInteractionAgent({ question, chunks })
    : {
        agentName: "Drug Interaction Agent",
        summary: "This agent was disabled for the current run.",
        confidence: "low" as const,
        limitations: ["No interaction analysis was generated because the agent was not selected."],
        warnings: [RESEARCH_DISCLAIMER],
        evidence: [],
        findings: [],
      };

  const adverseReaction = selectedAgents.includes("adverse-reaction")
    ? await runAdverseReactionAgent({ question, chunks })
    : {
        agentName: "Adverse Reaction Agent",
        summary: "This agent was disabled for the current run.",
        confidence: "low" as const,
        limitations: ["No adverse-event analysis was generated because the agent was not selected."],
        warnings: [RESEARCH_DISCLAIMER],
        evidence: [],
        findings: [],
      };

  const trialSummarizer = selectedAgents.includes("trial-summarizer")
    ? await runTrialSummarizerAgent({ question, chunks })
    : {
        agentName: "Clinical Trial Summarizer Agent",
        summary: "This agent was disabled for the current run.",
        confidence: "low" as const,
        limitations: ["No trial summary was generated because the agent was not selected."],
        warnings: [RESEARCH_DISCLAIMER],
        evidence: [],
        findings: [],
      };

  const debateConsensus = selectedAgents.includes("debate-consensus")
    ? await runDebateAgent({
        question,
        literature: literatureSearch,
        drug: drugInteraction,
        adverse: adverseReaction,
        trial: trialSummarizer,
      })
    : {
        agentName: "Debate / Consensus Agent",
        summary: "This agent was disabled for the current run.",
        confidence: "low" as const,
        limitations: ["No debate or consensus synthesis was generated because the agent was not selected."],
        warnings: [RESEARCH_DISCLAIMER],
        evidence: [],
        agreements: [],
        disagreements: [],
        missingEvidence: ["Consensus review was disabled in this session."],
        finalConsensus: "No final consensus was generated because the debate agent was disabled.",
      };

  const reportGeneration = selectedAgents.includes("report-generation")
    ? await runReportAgent({
        question,
        literature: literatureSearch,
        drug: drugInteraction,
        adverse: adverseReaction,
        trial: trialSummarizer,
        debate: debateConsensus,
      })
    : {
        agentName: "Report Generation Agent",
        summary: "This agent was disabled for the current run.",
        confidence: "low" as const,
        limitations: ["No final report was generated because the agent was not selected."],
        warnings: [RESEARCH_DISCLAIMER],
        evidence: [],
        executiveSummary: "Report generation was not enabled for this session.",
        keyFindings: [],
        evidenceTable: [],
        risksAndUncertainties: ["No report was generated."],
        recommendedFollowUpQuestions: ["Enable the report agent to generate a structured summary."],
        researchDisclaimer: RESEARCH_DISCLAIMER,
        physicianBriefing: "Not generated.",
        patientFriendlySummary: "Not generated.",
        markdownReport: `# Aetheris\n\n${RESEARCH_DISCLAIMER}`,
      };

  const results: AnalysisBundle = {
    literatureSearch,
    drugInteraction,
    adverseReaction,
    trialSummarizer,
    debateConsensus,
    reportGeneration,
  };

  return results;
}
