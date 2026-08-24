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
import { isGenericOpenQuestion } from "@/lib/research/open-questions";
import {
  containsPrimaryAnswerSourceLeakage,
  primaryAnswerQualityIssues,
  polishPrimaryAnswerFluency,
} from "@/lib/research/primary-answer";
import { normalizedEvidenceForModel } from "@/lib/research/evidence-normalization";
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
  normalizedEvidence: NormalizedEvidenceBundle;
  onFallback?: FallbackObserver;
}) {
  const { question, facts, evidence, onFallback } = payload;
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
  });
  const modelPayload = {
    question,
    primaryAnswerCoverage: {
      evidenceLimited: primaryAnswerCoverage.evidenceLimited,
      requestedParts: primaryAnswerCoverage.requestedParts,
      supportedParts: primaryAnswerCoverage.supportedParts,
      unsupportedParts: primaryAnswerCoverage.unsupportedParts,
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
      const primaryAnswerIssues = primaryAnswerQualityIssues(output.directAnswer, {
        singleDocument: sourceDocumentCount <= 1,
      });
      if (primaryAnswerIssues.length > 0) {
        return {
          valid: false,
          reason: primaryAnswerIssues.map((issue) => `direct-answer-${issue}`).join(", "),
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
    fallback: () => fallbackDirectorOutput,
  });

  const researchIntelligence = sanitizeResearchIntelligence({
    ...toResearchIntelligence(generatedDirectorOutput, fallbackIntelligence, facts, question),
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
    !coversRequestedPrimaryAnswer(candidate, question, facts)
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

function coversRequestedPrimaryAnswer(
  answer: string,
  question: string,
  facts: GroundedFact[],
) {
  const asksDiagnosis = /\b(?:diagnos|etiology|cause|leading interpretation|best supported)\w*\b/i.test(question);
  const asksTreatment = /\b(?:treat|management|therapy|medication|priority|proceed|begin|start|defer|delay|hold)\w*\b/i.test(question);
  const asksTradeoff = /\b(?:tradeoff|trade-off|risk|benefit|harm|constraint|balance)\w*\b/i.test(question);
  const asksRemaining = /\b(?:remaining|missing|unresolved|uncertain|evidence still needed|open question)\w*\b/i.test(question);
  const hasDiagnosis = facts.some((fact) => /\b(?:diagnos|leading interpretation|strongly support|confirmed)\w*\b/i.test(fact.text));
  const hasTreatment = facts.some((fact) => fact.contentType === "recommendation");
  const hasTradeoff = facts.some((fact) =>
    ["interaction_concern", "safety_observation", "discrepancy"].includes(fact.contentType),
  );

  if (asksDiagnosis && hasDiagnosis && !/\b(?:diagnos|supports?|indicates?|consistent with|most likely|leading)\w*\b/i.test(answer)) return false;
  if (asksTreatment && hasTreatment && !/\b(?:manage|prioriti|initiat|start|begin|continue|defer|delay|hold|avoid|administer|monitor|should)\w*\b/i.test(answer)) return false;
  if (asksTradeoff && hasTradeoff && !/\b(?:balanc|tradeoff|trade-off|against|while|risk|constraint|limit)\w*\b/i.test(answer)) return false;
  if (asksRemaining && !/\b(?:depend|pending|remain|uncertain|unresolved|clarif|confirm|completion|no specific)\w*\b/i.test(answer)) return false;
  return true;
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
    !isGenericOpenQuestion(question) &&
    !/^(?:what|which) (?:additional|other|more) (?:source|evidence|information)/i.test(question) &&
    !/reduce uncertainty|strengthen the conclusion|materially change the conclusion|more evidence (?:is|would be) needed/i.test(question);
}
