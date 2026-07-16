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
import { defaultWarnings, type FallbackObserver } from "@/lib/agents/shared";
import { buildGroundedReport, isConcreteReport } from "@/lib/research/grounding";
import {
  isResearchIntelligenceGrounded,
  sanitizeResearchIntelligence,
} from "@/lib/research/intelligence";
import { reportOutputSchema } from "@/lib/research/schemas";
import type { EvidenceItem, GroundedFact } from "@/lib/types";

export async function runReportAgent(payload: {
  question: string;
  literature: LiteratureSearchAgentOutput;
  drug: DrugInteractionAgentOutput;
  adverse: AdverseReactionAgentOutput;
  trial: TrialSummarizerAgentOutput;
  debate: DebateConsensusOutput;
  facts: GroundedFact[];
  evidence: EvidenceItem[];
  onFallback?: FallbackObserver;
}) {
  const { question, facts, evidence, onFallback } = payload;
  const groundedReport = buildGroundedReport({ question, facts, evidence });
  const modelPayload = {
    question,
    groundedFacts: facts,
    sourcePassages: evidence.map((item) => ({
      evidenceId: item.id,
      chunkId: item.chunkId,
      document: item.documentName,
      page: item.page,
      excerpt: item.excerpt,
      relevance: item.relevance,
    })),
    specialists: {
      literature: {
        summary: payload.literature.summary,
        excerpts: payload.literature.topRelevantExcerpts,
      },
      drugInteractions: {
        summary: payload.drug.summary,
        findings: payload.drug.findings,
      },
      adverseReactions: {
        summary: payload.adverse.summary,
        findings: payload.adverse.findings,
      },
      clinicalContext: {
        summary: payload.trial.summary,
        findings: payload.trial.findings,
      },
      consensus: {
        summary: payload.debate.summary,
        agreements: payload.debate.agreements,
        disagreements: payload.debate.disagreements,
        missingEvidence: payload.debate.missingEvidence,
        finalConsensus: payload.debate.finalConsensus,
      },
    },
  };

  const generated = await runStructuredGeneration<ReportOutput>({
    system: getAgentPrompt("report-generation"),
    user: JSON.stringify(modelPayload),
    schema: reportOutputSchema,
    schemaName: "report_generation_output",
    qualityCheck: (output) =>
      isConcreteReport({ ...output, evidence }, facts, question) &&
      isResearchIntelligenceGrounded(output.researchIntelligence, evidence),
    onFallback,
    fallback: () => groundedReport,
  });

  const synthesizedReport = generated === groundedReport
    ? groundedReport
    : buildGroundedReport({
        question,
        facts,
        evidence,
        executiveSummaryOverride: generated.executiveSummary,
      });
  const researchIntelligence = generated === groundedReport
    ? undefined
    : sanitizeResearchIntelligence(generated.researchIntelligence, evidence);

  return {
    ...generated,
    summary: synthesizedReport.summary,
    confidence: synthesizedReport.confidence,
    limitations: synthesizedReport.limitations,
    warnings: defaultWarnings(),
    evidence: synthesizedReport.evidence,
    executiveSummary: synthesizedReport.executiveSummary,
    keyFindings: synthesizedReport.keyFindings,
    evidenceTable: synthesizedReport.evidenceTable,
    risksAndUncertainties: synthesizedReport.risksAndUncertainties,
    recommendedFollowUpQuestions: synthesizedReport.recommendedFollowUpQuestions,
    researchDisclaimer: RESEARCH_DISCLAIMER,
    physicianBriefing: "",
    patientFriendlySummary: "",
    markdownReport: synthesizedReport.markdownReport,
    researchIntelligence,
  };
}
