import {
  SPECIALIST_AGENT_IDS,
  type AgentBaseOutput,
  type AgentId,
  type AnalysisBundle,
  type Citation,
  type ConfidenceProfile,
  type ConsensusClaim,
  type ConsensusPosition,
  type EvidenceItem,
  type GroundedFact,
  type ReportItem,
  type ReportSection,
  type UploadedDocument,
} from "@/lib/types";
import { createClaimCitations } from "@/lib/research/evidence-spans";
import { assessEvidenceConfidence } from "@/lib/research/confidence";

export function assembleResearchArtifacts(
  bundle: AnalysisBundle,
  evidence: EvidenceItem[],
  documents: UploadedDocument[],
) {
  const citations = createCitations(evidence, bundle.groundedFacts ?? [], documents);
  const confidence = createConfidenceProfile(bundle, evidence, citations, documents);
  const consensusClaims = createConsensusClaims(bundle, citations, confidence);
  const sections = createReportSections(bundle, citations, confidence);

  const reportGeneration = {
    ...bundle.reportGeneration,
    sections,
    citations,
  };

  return {
    bundle: {
      ...bundle,
      reportGeneration,
      debateConsensus: { ...bundle.debateConsensus, claims: consensusClaims },
      evidenceIndex: evidence,
      citations,
      consensusClaims,
      confidence,
    } satisfies AnalysisBundle,
    citations,
    consensusClaims,
    confidence,
    sections,
  };
}

export function createCitations(
  evidence: EvidenceItem[],
  facts: GroundedFact[] = [],
  documents: UploadedDocument[] = [],
): Citation[] {
  return createClaimCitations(evidence, facts, documents);
}

export function createConfidenceProfile(
  bundle: AnalysisBundle,
  evidence: EvidenceItem[],
  citations: Citation[],
  documents: UploadedDocument[],
): ConfidenceProfile {
  const facts = bundle.groundedFacts ?? [];
  const citedFacts = facts.filter((fact) =>
    citations.some((citation) => citation.evidenceId === fact.evidenceId),
  );
  const coveredDocuments = new Set(citedFacts.map((fact) => fact.documentId)).size;
  const coverage = documents.length === 0
    ? 0
    : Math.round((coveredDocuments / documents.length) * 100);
  const missingCount = bundle.debateConsensus.missingEvidence.length;
  const disagreements = bundle.debateConsensus.disagreements.length;
  const assessment = assessEvidenceConfidence({
    facts,
    evidence,
    counterEvidenceCount: disagreements,
    missingEvidenceCount: missingCount,
  });
  const citedAssessment = assessEvidenceConfidence({
    facts: citedFacts,
    evidence,
    counterEvidenceCount: disagreements,
    missingEvidenceCount: missingCount,
  });
  const citedFactCount = citedAssessment.supportCount;
  const citationStrength = assessment.supportCount > 0
    ? Math.round(
        (citedFactCount / assessment.supportCount) * 45 +
        citedAssessment.strengthScore * 0.4 +
        citedAssessment.sourceDiversityScore * 0.15,
      )
    : 0;
  const agreements = bundle.debateConsensus.agreements.length;
  const agreement = Math.round((agreements / Math.max(1, agreements + disagreements)) * 100);
  const contradictionCount = disagreements;
  const missingScore = Math.max(0, 100 - missingCount * 16);
  const contradictionScore = Math.max(0, 100 - contradictionCount * 20);
  const overall = Math.round(
    coverage * 0.14 +
      citationStrength * 0.24 +
      agreement * 0.16 +
      assessment.score * 0.28 +
      missingScore * 0.09 +
      contradictionScore * 0.09,
  );

  return {
    overall,
    generatedAt: new Date().toISOString(),
    dimensions: [
      {
        id: "evidence-coverage",
        label: "Evidence Coverage",
        score: coverage,
        detail: `${coveredDocuments} of ${documents.length} source documents contribute ranked evidence.`,
      },
      {
        id: "citation-strength",
        label: "Citation Strength",
        score: citationStrength,
        detail: `${citedFactCount} of ${assessment.supportCount} concrete findings link to exact source passages; directness and source independence are also weighted.`,
      },
      {
        id: "agent-agreement",
        label: "Agent Agreement",
        score: agreement,
        detail: `${agreements} aligned claims and ${disagreements} material disagreements were identified.`,
      },
      {
        id: "reasoning-confidence",
        label: "Reasoning Confidence",
        score: assessment.score,
        detail: `${assessment.supportCount} distinct supporting findings across ${assessment.sourceCount} source${assessment.sourceCount === 1 ? "" : "s"} were assessed for strength and consistency.`,
      },
      {
        id: "missing-evidence",
        label: "Missing Evidence",
        score: missingScore,
        riskCount: missingCount,
        detail: `${missingCount} evidence gap${missingCount === 1 ? "" : "s"} remain visible in consensus.`,
      },
      {
        id: "contradictions",
        label: "Contradictions",
        score: contradictionScore,
        riskCount: contradictionCount,
        detail: `${contradictionCount} unresolved contradiction${contradictionCount === 1 ? "" : "s"} require review.`,
      },
    ],
  };
}

function createConsensusClaims(
  bundle: AnalysisBundle,
  citations: Citation[],
  confidence: ConfidenceProfile,
): ConsensusClaim[] {
  const specialistOutputs = getSpecialistOutputEntries(bundle);
  const citationIds = citations.slice(0, 4).map((citation) => citation.id);
  const claims: ConsensusClaim[] = bundle.debateConsensus.agreements.map((claim, index) => ({
    id: `consensus:agreement:${index}`,
    claim,
    confidence: Math.min(94, Math.max(35, confidence.overall + 5)),
    uncertaintyReasons: bundle.debateConsensus.missingEvidence.slice(0, 2),
    citationIds,
    positions: specialistOutputs.map(([agentId, output]) =>
      createPosition(agentId, "agree", output, citationIds),
    ),
  }));

  bundle.debateConsensus.disagreements.forEach((claim, index) => {
    const positions = specialistOutputs.map(([agentId, output], positionIndex) =>
      createPosition(
        agentId,
        positionIndex === 1 ? "caution" : positionIndex === 2 ? "disagree" : "insufficient",
        output,
        citationIds.slice(positionIndex % 2, positionIndex % 2 + 2),
      ),
    );

    claims.push({
      id: `consensus:disagreement:${index}`,
      claim,
      confidence: Math.min(78, Math.max(28, confidence.overall - 14)),
      uncertaintyReasons: bundle.debateConsensus.missingEvidence,
      citationIds,
      positions,
    });
  });

  if (claims.length === 0) {
    claims.push({
      id: "consensus:insufficient",
      claim: bundle.debateConsensus.finalConsensus,
      confidence: Math.min(45, confidence.overall),
      uncertaintyReasons: bundle.debateConsensus.missingEvidence,
      citationIds,
      positions: specialistOutputs.map(([agentId, output]) =>
        createPosition(agentId, "insufficient", output, citationIds),
      ),
    });
  }

  return claims;
}

function createPosition(
  agentId: AgentId,
  stance: ConsensusPosition["stance"],
  output: AgentBaseOutput,
  evidenceIds: string[],
): ConsensusPosition {
  return {
    agentId,
    stance,
    confidence: output.confidence,
    rationale: output.summary,
    evidenceIds,
  };
}

function createReportSections(
  bundle: AnalysisBundle,
  citations: Citation[],
  confidence: ConfidenceProfile,
): ReportSection[] {
  const facts = bundle.groundedFacts ?? [];
  const interactionFacts = facts.filter((fact) => fact.contentType === "interaction_concern").slice(0, 6);
  const outcomeFacts = facts.filter((fact) =>
    (fact.contentType === "finding" || fact.contentType === "longitudinal_change") &&
    (fact.category === "efficacy" || fact.category === "statistical"),
  ).slice(0, 2);
  const efficacy = [...interactionFacts, ...outcomeFacts];
  const safety = facts.filter((fact) => fact.contentType === "safety_observation").slice(0, 4);
  const design = facts.filter((fact) =>
    fact.contentType === "finding" && fact.category === "study-design",
  ).slice(0, 3);
  const limitations = facts.filter((fact) =>
    fact.contentType === "limitation" || fact.contentType === "discrepancy",
  ).slice(0, 4);
  const executiveFacts = [efficacy[0], efficacy[1], safety[0], design[0], limitations[0]].filter(
    (fact): fact is GroundedFact => Boolean(fact),
  );

  return [
    createSection({
      id: "executive-summary",
      title: "Executive Summary",
      body: bundle.reportGeneration.executiveSummary,
      citationIds: citationIdsForFacts(executiveFacts, citations),
      agentIds: ["debate-consensus", "report-generation"],
      documentIds: documentIdsForFacts(executiveFacts),
    }),
    createFactSection({
      id: "key-findings",
      title: "Findings That Answer the Question",
      facts: efficacy,
      citations,
      agentIds: [...SPECIALIST_AGENT_IDS],
    }),
    createFactSection({
      id: "safety-findings",
      title: "Safety Findings",
      facts: safety,
      citations,
      agentIds: ["adverse-reaction", "trial-summarizer"],
    }),
    createFactSection({
      id: "study-design",
      title: "What the Documents Describe",
      facts: design,
      citations,
      agentIds: ["trial-summarizer"],
    }),
    createFactSection({
      id: "limitations",
      title: "What Remains Uncertain",
      facts: limitations,
      citations,
      agentIds: [...SPECIALIST_AGENT_IDS, "debate-consensus"],
    }),
    createSection({
      id: "confidence",
      title: "Evidence Confidence",
      body: `Overall research confidence is ${confidence.overall}%. ${bundle.reportGeneration.risksAndUncertainties.join(" ")}`,
      values: confidence.dimensions.map(
        (dimension) => `${dimension.label}: ${dimension.score}% — ${dimension.detail}`,
      ),
      citationIds: [],
      agentIds: [...SPECIALIST_AGENT_IDS, "debate-consensus"],
      documentIds: [],
    }),
    createSection({
      id: "follow-up-questions",
      title: "Follow-Up Questions",
      values: bundle.reportGeneration.recommendedFollowUpQuestions,
      citationIds: [],
      agentIds: ["debate-consensus", "report-generation"],
      documentIds: [],
    }),
    createFactSection({
      id: "source-evidence",
      title: "Source Evidence",
      facts,
      citations,
      agentIds: ["literature-search", "report-generation"],
      showSource: true,
    }),
    createSection({
      id: "disclaimer",
      title: "Research-Use Disclaimer",
      body: bundle.reportGeneration.researchDisclaimer,
      citationIds: [],
      agentIds: ["report-generation"],
      documentIds: [],
    }),
  ];
}

function createFactSection({
  id,
  title,
  facts,
  citations,
  agentIds,
  showSource = false,
}: {
  id: ReportSection["id"];
  title: string;
  facts: GroundedFact[];
  citations: Citation[];
  agentIds: AgentId[];
  showSource?: boolean;
}): ReportSection {
  const items = facts.map<ReportItem>((fact) => {
    const citation = citations.find((item) => item.evidenceId === fact.evidenceId);
    return {
      id: `${id}:${fact.id}`,
      text: showSource
        ? `${fact.documentName}${fact.page ? `, page ${fact.page}` : ""}: "${fact.excerpt}" - ${fact.relevance}`
        : fact.text,
      citationIds: citation ? [citation.id] : [],
      agentIds,
      documentIds: [fact.documentId],
    };
  });

  return {
    id,
    title,
    items,
    citationIds: unique(items.flatMap((item) => item.citationIds)),
    agentIds,
    documentIds: documentIdsForFacts(facts),
    status: "assembled",
  };
}

function citationIdsForFacts(facts: GroundedFact[], citations: Citation[]) {
  return unique(
    facts
      .map((fact) => citations.find((citation) => citation.evidenceId === fact.evidenceId)?.id)
      .filter((id): id is string => Boolean(id)),
  );
}

function documentIdsForFacts(facts: GroundedFact[]) {
  return unique(facts.map((fact) => fact.documentId));
}

function createSection({
  id,
  title,
  body,
  values = [],
  citationIds,
  agentIds,
  documentIds,
}: {
  id: ReportSection["id"];
  title: string;
  body?: string;
  values?: string[];
  citationIds: string[];
  agentIds: AgentId[];
  documentIds: string[];
}): ReportSection {
  const items = values.map<ReportItem>((text, index) => ({
    id: `${id}:item:${index}`,
    text,
    citationIds: citationIds.length > 0 ? [citationIds[index % citationIds.length]] : [],
    agentIds,
    documentIds,
  }));

  return {
    id,
    title,
    body,
    items,
    citationIds,
    agentIds,
    documentIds,
    status: "assembled",
  };
}

function getSpecialistOutputEntries(bundle: AnalysisBundle): Array<[AgentId, AgentBaseOutput]> {
  return [
    ["literature-search", bundle.literatureSearch],
    ["drug-interaction", bundle.drugInteraction],
    ["adverse-reaction", bundle.adverseReaction],
    ["trial-summarizer", bundle.trialSummarizer],
  ];
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
