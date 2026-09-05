import { getAgentPrompt, RESEARCH_DISCLAIMER } from "@/lib/prompts";
import { runStructuredGeneration } from "@/lib/llm";
import { z } from "zod";
import type {
  AdverseReactionAgentOutput,
  DebateConsensusOutput,
  DrugInteractionAgentOutput,
  LiteratureSearchAgentOutput,
  NormalizedEvidenceBundle,
  TrialSummarizerAgentOutput,
} from "@/lib/types";
import { defaultWarnings, type FallbackObserver } from "@/lib/agents/shared";
import {
  assessPrimaryAnswerEvidence,
  buildGroundedReport,
  isIncompletePrimaryAnswer,
  primaryAnswerConsistencyIssues,
  primaryAnswerDeniesDisagreement,
  primaryAnswerCoverageIssues,
} from "@/lib/research/grounding";
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
import {
  isGenericOpenQuestion,
  isOpenQuestionAnswered,
  openQuestionsFromMissingEvidence,
  openQuestionQualityIssues,
  reconcileTemporalEvidence,
} from "@/lib/research/open-questions";
import {
  containsPrimaryAnswerSourceLeakage,
  primaryAnswerQualityIssues,
  polishPrimaryAnswerFluency,
} from "@/lib/research/primary-answer";
import { normalizedEvidenceForModel } from "@/lib/research/evidence-normalization";
import type { EvidenceItem, GroundedFact, ResearchIntelligence } from "@/lib/types";

export const REPORT_PROVIDER_TIMEOUT_MS = 40_000;
export const REPORT_PROVIDER_MAX_RETRIES = 0;

export async function runReportAgent(payload: {
  question: string;
  literature: LiteratureSearchAgentOutput;
  drug: DrugInteractionAgentOutput;
  adverse: AdverseReactionAgentOutput;
  trial: TrialSummarizerAgentOutput;
  debate: DebateConsensusOutput;
  facts: GroundedFact[];
  evidence: EvidenceItem[];
  normalizedEvidence: NormalizedEvidenceBundle;
  onFallback?: FallbackObserver;
  shouldUseProvider?: () => boolean;
  onAssemblyRecovery?: (error: unknown) => void | Promise<void>;
}) {
  const { question, evidence, onFallback, shouldUseProvider } = payload;
  const facts = reconcileTemporalEvidence(payload.facts, evidence);
  const debate = {
    ...payload.debate,
    missingEvidence: payload.debate.missingEvidence.filter((item) => {
      const questions = openQuestionsFromMissingEvidence(item);
      return questions.length === 0 || questions.some((openQuestion) =>
        !isOpenQuestionAnswered(openQuestion, facts, evidence)
      );
    }),
  };
  const primaryAnswerCoverage = assessPrimaryAnswerEvidence(question, facts);
  const sourceDocumentCount = new Set(evidence.map((item) => item.documentId)).size;
  const groundedReport = buildGroundedReport({ question, facts, evidence });
  const fallbackIntelligence = buildFallbackResearchIntelligence({
    question,
    facts,
    evidence,
    directAnswer: groundedReport.executiveSummary,
    uncertainties: groundedReport.risksAndUncertainties,
    followUpQuestions: groundedReport.recommendedFollowUpQuestions,
    consensus: debate,
  });
  const modelPayload = {
    question,
    primaryAnswerCoverage: {
      evidenceLimited: primaryAnswerCoverage.evidenceLimited,
      requestedParts: primaryAnswerCoverage.requestedParts,
      supportedParts: primaryAnswerCoverage.supportedParts,
      unsupportedParts: primaryAnswerCoverage.unsupportedParts,
      partStatus: primaryAnswerCoverage.partStatus,
    },
    primaryAnswerCandidates: primaryAnswerCoverage.eligibleFacts.map((fact) => ({
      contentType: fact.contentType,
      category: fact.category,
      statement: fact.text,
      evidenceId: fact.evidenceId,
    })),
    normalizedEvidence: normalizedEvidenceForModel(payload.normalizedEvidence),
    specialists: {
      literature: {
        summary: payload.literature.summary,
      },
      drugInteractions: {
        summary: payload.drug.summary,
        findings: payload.drug.findings.map((finding) => ({
          possibleInteraction: finding.possibleInteraction,
          severityEstimate: finding.severityEstimate,
          uncertaintyLevel: finding.uncertaintyLevel,
          notes: finding.notes,
        })),
      },
      adverseReactions: {
        summary: payload.adverse.summary,
        findings: payload.adverse.findings.map((finding) => ({
          adverseEvent: finding.adverseEvent,
          frequency: finding.frequency,
          affectedPopulation: finding.affectedPopulation,
          confidenceLevel: finding.confidenceLevel,
        })),
      },
      clinicalContext: {
        summary: payload.trial.summary,
        findings: payload.trial.findings,
      },
      consensus: {
        summary: debate.summary,
        agreements: debate.agreements,
        disagreements: debate.disagreements,
        missingEvidence: debate.missingEvidence,
        finalConsensus: debate.finalConsensus,
      },
    },
  };

  type ResearchDirectorOutput = z.infer<typeof researchDirectorOutputSchema>;
  const fallbackDirectorOutput = toResearchDirectorOutput(fallbackIntelligence);
  let generatedDirectorOutput: ResearchDirectorOutput;
  const generationStartedAt = Date.now();
  try {
    generatedDirectorOutput = await runStructuredGeneration<ResearchDirectorOutput>({
      system: getAgentPrompt("report-generation"),
      user: JSON.stringify(modelPayload),
      schema: researchDirectorOutputSchema,
      schemaName: "research_intelligence_output",
      qualityCheck: (output) => {
        const primaryAnswerIssues = primaryAnswerQualityIssues(output.directAnswer, {
          singleDocument: sourceDocumentCount <= 1,
        });
        if (primaryAnswerIssues.length > 0) {
          return {
            valid: false,
            reason: primaryAnswerIssues.map((issue) => `direct-answer-${issue}`).join(", "),
          };
        }
        const coverageIssues = primaryAnswerCoverageIssues(output.directAnswer, question, facts);
        const consistencyIssues = primaryAnswerConsistencyIssues(
          output.directAnswer,
          question,
          facts,
          Math.max(
            output.contradictions.length,
            fallbackIntelligence.contradictions.length,
          ),
          fallbackIntelligence.structuredClaims?.map((claim) => claim.conclusion) ?? [],
        );
        if (coverageIssues.length > 0 || consistencyIssues.length > 0) {
          return {
            valid: false,
            reason: [...coverageIssues, ...consistencyIssues]
              .map((issue) => `direct-answer-${issue}`)
              .join(", "),
          };
        }
        const issues = researchIntelligenceGroundingIssues(
          toResearchIntelligence(output, fallbackIntelligence, facts, question),
          evidence,
          question,
        );
        return { valid: issues.length === 0, reason: issues.join(", ") };
      },
      onFallback,
      shouldUseProvider,
      maxAttempts: 2,
      openAiRequestPolicy: {
        timeoutMs: REPORT_PROVIDER_TIMEOUT_MS,
        maxRetries: REPORT_PROVIDER_MAX_RETRIES,
      },
      fallback: () => fallbackDirectorOutput,
    });
  } catch (error) {
    // The specialist and consensus calls have already completed by this point.
    // Preserve that live AI work and finish its grounded presentation
    // instead of failing the entire run because the final formatting call lost
    // its network connection.
    logReportRecovery(error, generationStartedAt);
    await payload.onAssemblyRecovery?.(error);
    generatedDirectorOutput = {
      ...fallbackDirectorOutput,
      directAnswer: debate.finalConsensus.trim() || fallbackDirectorOutput.directAnswer,
    };
  }

  const sanitizedIntelligence = sanitizeResearchIntelligence({
    ...toResearchIntelligence(generatedDirectorOutput, fallbackIntelligence, facts, question),
  }, evidence, facts)
    ?? fallbackIntelligence;
  const consistencyIssues = primaryAnswerConsistencyIssues(
    sanitizedIntelligence.directAnswer,
    question,
    facts,
    sanitizedIntelligence.contradictions.length,
    sanitizedIntelligence.structuredClaims?.map((claim) => claim.conclusion) ?? [],
  );
  const researchIntelligence = consistencyIssues.length > 0
    ? {
        ...sanitizedIntelligence,
        directAnswer: consistencyIssues.includes("supported-disagreement-denied")
          ? recoverAcceptedDisagreement(
              sanitizedIntelligence.directAnswer,
              sanitizedIntelligence.contradictions,
            )
          : completeDirectAnswer(
              debate.finalConsensus,
              fallbackIntelligence.directAnswer,
              question,
              facts,
            ),
      }
    : sanitizedIntelligence;
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

function logReportRecovery(error: unknown, startedAt: number) {
  if (process.env.NODE_ENV === "test") return;
  const message = error instanceof Error ? error.message : String(error);
  const category = /timeout|timed out|did not respond before/i.test(message)
    ? "provider_timeout"
    : /schema validation|grounding checks|too vague|insufficiently grounded/i.test(message)
      ? "schema_or_quality_rejection"
      : "provider_api_error";
  console.warn("[Aetheris report] Deterministic report recovery activated", {
    category,
    elapsedMs: Date.now() - startedAt,
  });
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
  question: string,
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
  const directAnswer = completeDirectAnswer(output.directAnswer, fallback.directAnswer, question, facts);
  const recoveredSupportedAnswer =
    output.answerStatus === "insufficient" &&
    isIncompletePrimaryAnswer(output.directAnswer) &&
    !isIncompletePrimaryAnswer(directAnswer);
  return {
    ...fallback,
    answerStatus: recoveredSupportedAnswer ? fallback.answerStatus : output.answerStatus,
    directAnswer,
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

function recoverAcceptedDisagreement(
  answer: string,
  contradictions: ResearchIntelligence["contradictions"],
) {
  const retainedSentences =
    answer
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter(
        (sentence) =>
          sentence.length > 0 && !primaryAnswerDeniesDisagreement(sentence),
      ) ?? [];
  const acceptedDisagreement = contradictions.find(
    (contradiction) => contradiction.issue.trim().length > 0,
  );

  if (!acceptedDisagreement) return retainedSentences.join(" ");

  const issue = acceptedDisagreement.issue.trim();
  const completeIssue = /[.!?]$/.test(issue) ? issue : `${issue}.`;
  return [...retainedSentences, completeIssue].join(" ");
}

function completeDirectAnswer(
  generated: string,
  groundedFallback: string,
  question: string,
  facts: GroundedFact[],
) {
  const candidate = polishPrimaryAnswerFluency(generated);
  const fallback = polishPrimaryAnswerFluency(groundedFallback);
  const singleDocument = new Set(facts.map((fact) => fact.documentId)).size <= 1;
  if (assessPrimaryAnswerEvidence(question, facts).evidenceLimited) {
    return fallback;
  }
  if (!candidate) return fallback;
  if (isIncompletePrimaryAnswer(candidate) && !isIncompletePrimaryAnswer(fallback)) {
    return fallback;
  }
  if (
    primaryAnswerQualityIssues(candidate, { singleDocument }).length > 0 ||
    containsPrimaryAnswerNoise(candidate) ||
    containsPrimaryAnswerSourceLeakage(candidate) ||
    copiesSourcePassage(candidate, facts) ||
    primaryAnswerCoverageIssues(candidate, question, facts).length > 0 ||
    primaryAnswerConsistencyIssues(candidate, question, facts).length > 0
  ) {
    return fallback;
  }

  const candidateTopics = new Set(semanticTopics(candidate));
  const fallbackTopics = semanticTopics(fallback);
  const coveredTopics = fallbackTopics.filter((topic) => candidateTopics.has(topic)).length;
  const coverage = coveredTopics / Math.max(1, fallbackTopics.length);
  const substantiallyShorter = candidate.length < fallback.length * 0.55;
  const substantiallyLonger = candidate.length > Math.max(850, fallback.length * 1.35);

  return substantiallyLonger || (substantiallyShorter && coverage < 0.7) ? fallback : candidate;
}

function containsPrimaryAnswerNoise(value: string) {
  return /(?:^|\s)(?:primary answer|treatment priority|key tradeoff|remaining evidence)\s*:/i.test(value) ||
    /\b(?:MRN|medical record number|page \d+(?: of \d+)?|synthetic test document|testing notice|confidential)\b/i.test(value);
}

function copiesSourcePassage(answer: string, facts: GroundedFact[]) {
  const normalizedAnswer = normalizeWords(answer);
  return facts.some((fact) => {
    const words = normalizeWords(`${fact.text} ${fact.excerpt}`).split(" ").filter(Boolean);
    if (words.length < 10) return false;
    for (let index = 0; index <= words.length - 10; index += 1) {
      if (normalizedAnswer.includes(words.slice(index, index + 10).join(" "))) return true;
    }
    return false;
  });
}

function normalizeWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    openQuestionQualityIssues(question).length === 0 &&
    !isGenericOpenQuestion(question) &&
    !/^(?:what|which) (?:additional|other|more) (?:source|evidence|information)/i.test(question) &&
    !/reduce uncertainty|strengthen the conclusion|materially change the conclusion|more evidence (?:is|would be) needed/i.test(question);
}
