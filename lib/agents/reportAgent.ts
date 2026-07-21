import { getAgentPrompt, RESEARCH_DISCLAIMER } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import { z } from "zod";
import type {
  AdverseReactionAgentOutput,
  DebateConsensusOutput,
  DrugInteractionAgentOutput,
  LiteratureSearchAgentOutput,
  TrialSummarizerAgentOutput,
} from "@/lib/types";
import { defaultWarnings, type FallbackObserver } from "@/lib/agents/shared";
import { buildGroundedReport } from "@/lib/research/grounding";
import {
  buildClaimEvidenceMappings,
  buildFallbackResearchIntelligence,
} from "@/lib/research/claims";
import {
  researchIntelligenceGroundingIssues,
  sanitizeResearchIntelligence,
} from "@/lib/research/intelligence";
import { researchDirectorOutputSchema } from "@/lib/research/schemas";
import { semanticFamily, semanticTopics } from "@/lib/research/evidence-relationships";
import { isGenericOpenQuestion } from "@/lib/research/open-questions";
import type { EvidenceItem, GroundedFact, ResearchIntelligence } from "@/lib/types";

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
  const fallbackIntelligence = buildFallbackResearchIntelligence({
    question,
    facts,
    evidence,
    directAnswer: groundedReport.executiveSummary,
    uncertainties: groundedReport.risksAndUncertainties,
    followUpQuestions: groundedReport.recommendedFollowUpQuestions,
  });
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

  type ResearchDirectorOutput = z.infer<typeof researchDirectorOutputSchema>;
  const fallbackDirectorOutput = toResearchDirectorOutput(fallbackIntelligence);
  const generatedDirectorOutput = await runStructuredGeneration<ResearchDirectorOutput>({
    system: getAgentPrompt("report-generation"),
    user: JSON.stringify(modelPayload),
    schema: researchDirectorOutputSchema,
    schemaName: "research_intelligence_output",
    qualityCheck: (output) => {
      const issues = researchIntelligenceGroundingIssues(
        toResearchIntelligence(output, fallbackIntelligence, facts),
        evidence,
        question,
      );
      return { valid: issues.length === 0, reason: issues.join(", ") };
    },
    onFallback,
    fallback: () => fallbackDirectorOutput,
  });

  const researchIntelligence = sanitizeResearchIntelligence({
    ...toResearchIntelligence(generatedDirectorOutput, fallbackIntelligence, facts),
  }, evidence)
    ?? fallbackIntelligence;
  const synthesizedReport = buildGroundedReport({
    question,
    facts,
    evidence,
    executiveSummaryOverride: researchIntelligence.directAnswer,
  });
  const structuredFindings = researchIntelligence.structuredClaims?.map((claim) => claim.conclusion) ?? [];

  return {
    ...synthesizedReport,
    summary: synthesizedReport.summary,
    confidence: synthesizedReport.confidence,
    limitations: synthesizedReport.limitations,
    warnings: defaultWarnings(),
    evidence: synthesizedReport.evidence,
    executiveSummary: synthesizedReport.executiveSummary,
    keyFindings: structuredFindings.length > 0 ? structuredFindings : synthesizedReport.keyFindings,
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

function toResearchDirectorOutput(intelligence: ResearchIntelligence) {
  return {
    answerStatus: intelligence.answerStatus,
    directAnswer: intelligence.directAnswer,
    claims: (intelligence.structuredClaims ?? []).map((claim) => ({
      conclusion: claim.conclusion,
      kind: claim.kind,
      dimension: claim.dimension,
      theme: claim.theme ?? fallbackTheme(claim.dimension),
      clinicalImplication: claim.clinicalImplication ?? claim.reasoningSummary,
      reasoningSummary: claim.reasoningSummary,
      evidenceIds: claim.evidenceIds,
      counterEvidenceIds: claim.counterEvidenceIds,
      uncertainty: claim.uncertainty,
      confidence: claim.confidence,
    })),
    trajectory: intelligence.evidenceTrajectory.map((item) => ({
      label: item.label,
      finding: item.finding,
      interpretation: item.interpretation,
      evidenceIds: item.evidenceIds,
    })),
    contradictions: intelligence.contradictions,
    unansweredQuestions: intelligence.decisionChangingUnknowns.map((item) => ({
      question: item.unknown,
      known: item.known ?? "The uploaded evidence establishes the linked source observations.",
      missing: item.evidenceNeeded,
      whyItMatters: item.whyItMatters,
      evidenceIds: item.evidenceIds ?? [],
    })),
  };
}

function toResearchIntelligence(
  output: z.infer<typeof researchDirectorOutputSchema>,
  fallback: ResearchIntelligence,
  facts: GroundedFact[],
): ResearchIntelligence {
  const structuredClaims = output.claims.map((claim, index) => ({
    ...claim,
    id: `claim:${claim.dimension}:${semanticFamily(claim.conclusion)}:${index}`,
    priority: index === 0 ? "primary" as const : index < 5 ? "important" as const : "context" as const,
  }));
  const isFallbackQuestionSet = output.unansweredQuestions.length === fallback.decisionChangingUnknowns.length &&
    output.unansweredQuestions.every((item, index) => item.question === fallback.decisionChangingUnknowns[index]?.unknown);
  const generatedUnknowns = isFallbackQuestionSet
    ? fallback.decisionChangingUnknowns
    : output.unansweredQuestions
        .filter((item) => isSpecificResearchQuestion(item.question))
        .map((item, index) => ({
          unknown: item.question,
          known: item.known,
          whyItMatters: item.whyItMatters,
          evidenceNeeded: item.missing,
          evidenceIds: item.evidenceIds,
          priority: index === 0 ? "high" as const : "moderate" as const,
        }));
  const decisionChangingUnknowns = mergeUnknowns(
    generatedUnknowns,
    fallback.decisionChangingUnknowns,
  );
  return {
    ...fallback,
    answerStatus: output.answerStatus,
    directAnswer: completeDirectAnswer(output.directAnswer, fallback.directAnswer),
    strongestSupportedConclusion: structuredClaims[0]?.conclusion ?? fallback.strongestSupportedConclusion,
    strongestCounterpoint: structuredClaims.find((claim) => claim.counterEvidenceIds.length > 0)?.uncertainty
      ?? fallback.strongestCounterpoint,
    evidenceTrajectory: output.trajectory.map((item, index) => ({
      sequence: index + 1,
      ...item,
    })),
    contradictions: mergeContradictions(output.contradictions, fallback.contradictions),
    decisionChangingUnknowns,
    evidenceMappings: buildClaimEvidenceMappings(structuredClaims, facts),
    structuredClaims,
  };
}

function completeDirectAnswer(generated: string, groundedFallback: string) {
  const candidate = generated.trim();
  const fallback = groundedFallback.trim();
  if (!candidate) return fallback;

  const candidateTopics = new Set(semanticTopics(candidate));
  const fallbackTopics = semanticTopics(fallback);
  const coveredTopics = fallbackTopics.filter((topic) => candidateTopics.has(topic)).length;
  const coverage = coveredTopics / Math.max(1, fallbackTopics.length);
  const substantiallyShorter = candidate.length < fallback.length * 0.55;

  return substantiallyShorter && coverage < 0.7 ? fallback : candidate;
}

function mergeUnknowns(
  generated: ResearchIntelligence["decisionChangingUnknowns"],
  fallback: ResearchIntelligence["decisionChangingUnknowns"],
) {
  const merged: ResearchIntelligence["decisionChangingUnknowns"] = [];
  for (const unknown of [...generated, ...fallback]) {
    if (!isSpecificResearchQuestion(unknown.unknown)) continue;
    const family = semanticFamily(`${unknown.unknown} ${unknown.known ?? ""}`);
    if (merged.some((item) => semanticFamily(`${item.unknown} ${item.known ?? ""}`) === family)) continue;
    merged.push(unknown);
  }
  return merged.slice(0, 6);
}

function mergeContradictions(
  generated: ResearchIntelligence["contradictions"],
  fallback: ResearchIntelligence["contradictions"],
) {
  const merged: ResearchIntelligence["contradictions"] = [];
  for (const contradiction of [...generated, ...fallback]) {
    const evidenceKey = [...contradiction.evidenceIds].sort().join("|");
    if (merged.some((item) =>
      [...item.evidenceIds].sort().join("|") === evidenceKey ||
      semanticFamily(item.issue) === semanticFamily(contradiction.issue),
    )) continue;
    merged.push(contradiction);
  }
  return merged.slice(0, 5);
}

function fallbackTheme(dimension: "efficacy" | "safety" | "limitation" | "context") {
  return {
    efficacy: "Clinical outcomes",
    safety: "Risks and tolerability",
    limitation: "Evidence limitations",
    context: "Clinical context",
  }[dimension];
}

function isSpecificResearchQuestion(value: string) {
  const question = value.replace(/\s+/g, " ").trim();
  return question.length >= 24 &&
    !isGenericOpenQuestion(question) &&
    !/^(?:what|which) (?:additional|other|more) (?:source|evidence|information)/i.test(question) &&
    !/reduce uncertainty|strengthen the conclusion|materially change the conclusion|more evidence (?:is|would be) needed/i.test(question);
}
