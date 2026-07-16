import { chunkDocument } from "@/lib/pdf.shared";
import {
  buildEvidenceIndex,
  chunksToEvidence,
  retrieveFromIndex,
} from "@/lib/embeddings";
import { runAdverseReactionAgent } from "@/lib/agents/adverseReactionAgent";
import { runDebateAgent } from "@/lib/agents/debateAgent";
import { runDrugInteractionAgent } from "@/lib/agents/drugInteractionAgent";
import { runLiteratureSearchAgent } from "@/lib/agents/literatureSearchAgent";
import { runReportAgent } from "@/lib/agents/reportAgent";
import { runTrialSummarizerAgent } from "@/lib/agents/trialSummarizerAgent";
import type { FallbackObserver } from "@/lib/agents/shared";
import { getLlmConfiguration } from "@/lib/llm";
import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import { assembleResearchArtifacts } from "@/lib/research/artifacts";
import { extractGroundedFacts } from "@/lib/research/grounding";
import type { ResearchEventInput } from "@/lib/research/events";
import {
  SPECIALIST_AGENT_IDS,
  type AdverseReactionAgentOutput,
  type AgentId,
  type AgentOutput,
  type AnalysisBundle,
  type DebateConsensusOutput,
  type DrugInteractionAgentOutput,
  type EvidenceItem,
  type LiteratureSearchAgentOutput,
  type ReportOutput,
  type ResearchMetrics,
  type ResearchSession,
  type SearchChunk,
  type SessionMode,
  type TrialSummarizerAgentOutput,
} from "@/lib/types";

const DOMAIN_QUERIES: Record<(typeof SPECIALIST_AGENT_IDS)[number], string> = {
  "literature-search": "source excerpts study findings evidence results",
  "drug-interaction": "drug interaction coadministration exposure pharmacokinetic CYP inhibitor inducer",
  "adverse-reaction": "adverse event safety warning contraindication toxicity tolerability",
  "trial-summarizer": "trial methods population endpoint results follow-up limitation statistical",
};

const DEMO_COMPLETION_DELAY: Record<(typeof SPECIALIST_AGENT_IDS)[number], number> = {
  "literature-search": 420,
  "drug-interaction": 680,
  "adverse-reaction": 900,
  "trial-summarizer": 1_120,
};

type PipelineEmitter = (event: ResearchEventInput) => void | Promise<void>;

export async function runResearchPipeline({
  session,
  emit,
}: {
  session: ResearchSession;
  emit: PipelineEmitter;
}) {
  const startedAt = Date.now();
  const selectedAgents = session.selectedAgents;
  const pageCount = session.documents.reduce((sum, document) => sum + document.pageCount, 0);
  const llmConfiguration = getLlmConfiguration();
  let actualMode: SessionMode = llmConfiguration.enabled ? "live" : "demo";
  let fallbackAnnounced = actualMode === "demo";
  const fallbackReasons = new Set<string>();
  const onFallback: FallbackObserver = (reason) => {
    actualMode = "demo";
    fallbackReasons.add(reason);
  };
  const announceFallbackIfNeeded = async () => {
    if (actualMode !== "demo" || fallbackAnnounced) {
      return;
    }
    fallbackAnnounced = true;
    await emit({
      type: "analysis.mode",
      phase: "analyzing",
      message: "Aetheris switched to local fallback mode",
      data: {
        mode: "demo",
        reason: Array.from(fallbackReasons).join(" ") || "The AI result was unavailable or insufficiently grounded.",
      },
    });
  };

  await emit({
    type: "analysis.mode",
    phase: "processing",
    message: actualMode === "live" ? "AI mode active" : "Local fallback mode active",
    data: {
      mode: actualMode,
      reason: actualMode === "live"
        ? `${llmConfiguration.providerLabel} ${llmConfiguration.model} is configured; model outputs remain constrained to source evidence.`
        : "No AI provider key is configured; deterministic local extraction will be used and clearly labeled.",
    },
  });

  await emit({
    type: "stage.started",
    phase: "processing",
    stageId: "chunking",
    message: "Building page-addressable evidence passages",
    data: { progress: 10, detail: "Preserving page and context offsets" },
  });

  const chunks = session.documents.flatMap((document) => chunkDocument(document));
  await emit({
    type: "stage.completed",
    phase: "processing",
    stageId: "chunking",
    message: `${chunks.length} evidence passages created from ${pageCount} pages`,
    data: { progress: 100, metrics: { chunkCount: chunks.length, pageCount } },
  });

  await emit({
    type: "stage.started",
    phase: "processing",
    stageId: "indexing",
    message: llmConfiguration.enabled
      ? "Creating semantic embeddings"
      : "Preparing deterministic lexical index",
    data: { progress: 4, detail: "Indexing source passages for specialist retrieval" },
  });

  const evidenceIndex = await buildEvidenceIndex(
    session.documents,
    async ({ completed, total, method }) => {
      await emit({
        type: "stage.progress",
        phase: "processing",
        stageId: "indexing",
        message: method === "embedding" ? "Embedding source passages" : "Building lexical index",
        data: {
          progress: total === 0 ? 100 : Math.round((completed / total) * 100),
          detail: `${completed} of ${total} passages indexed`,
        },
      });
    },
    chunks,
  );

  await emit({
    type: "stage.completed",
    phase: "processing",
    stageId: "indexing",
    message: evidenceIndex.method === "embedding"
      ? `${chunks.length} passages embedded for semantic retrieval`
      : `${chunks.length} passages indexed with lexical retrieval`,
    data: {
      progress: 100,
      detail: evidenceIndex.method === "embedding"
        ? `Model: ${evidenceIndex.embeddingModel}`
        : "Demo/offline fallback; no embedding similarity is claimed",
      metrics: { retrievalMethod: evidenceIndex.method },
    },
  });

  await emit({
    type: "stage.started",
    phase: "retrieving",
    stageId: "retrieval",
    message: "Running specialist-specific evidence searches",
    data: { progress: 8, detail: "Each specialist receives independently ranked context" },
  });

  const retrievalEntries = await Promise.all(
    SPECIALIST_AGENT_IDS.map(async (agentId, index) => {
      if (!selectedAgents.includes(agentId)) {
        return [agentId, { chunks: [] as SearchChunk[], method: evidenceIndex.method }] as const;
      }

      const query = `${session.question}\nSpecialist focus: ${DOMAIN_QUERIES[agentId]}`;
      const result = await retrieveFromIndex(evidenceIndex, query, 10);
      await emit({
        type: "stage.progress",
        phase: "retrieving",
        stageId: "retrieval",
        message: `${agentLabel(agentId)} evidence context ready`,
        data: {
          progress: 20 + Math.round(((index + 1) / SPECIALIST_AGENT_IDS.length) * 75),
          detail: `${result.chunks.length} passages ranked for ${agentLabel(agentId)}`,
        },
      });
      return [agentId, result] as const;
    }),
  );
  const retrievals = Object.fromEntries(retrievalEntries) as Record<
    (typeof SPECIALIST_AGENT_IDS)[number],
    { chunks: SearchChunk[]; method: "embedding" | "lexical" }
  >;
  const retrievalMethod = retrievalEntries.some(([, result]) => result.method === "lexical")
    ? "lexical"
    : "embedding";

  await emit({
    type: "stage.completed",
    phase: "retrieving",
    stageId: "retrieval",
    message: "Specialist evidence retrieval completed",
    data: { progress: 100, metrics: { retrievalMethod } },
  });

  await emit({
    type: "stage.started",
    phase: "retrieving",
    stageId: "evidence-ranking",
    message: "Reconciling ranked passages across specialists",
    data: { progress: 20 },
  });

  const evidence = mergeEvidence(
    retrievalEntries.flatMap(([agentId, result]) =>
      chunksToEvidence(result.chunks, `Ranked for ${agentLabel(agentId)}`),
    ),
  );
  const groundedFacts = extractGroundedFacts(evidence, session.question);
  await emit({
    type: "evidence.ready",
    phase: "retrieving",
    stageId: "evidence-ranking",
    message: `${evidence.length} traceable passages selected for analysis`,
    data: { evidence, retrievalMethod, chunkCount: chunks.length },
  });
  await emit({
    type: "stage.completed",
    phase: "retrieving",
    stageId: "evidence-ranking",
    message: `${evidence.length} evidence passages ranked and source-anchored`,
    data: {
      progress: 100,
      metrics: { retrievedEvidenceCount: evidence.length, retrievalMethod },
    },
  });

  const specialistOutputs: Partial<Record<AgentId, AgentOutput>> = {};
  let completedAgentCount = 0;

  const specialistSettlements = await Promise.allSettled(
    SPECIALIST_AGENT_IDS.map(async (agentId) => {
      if (!selectedAgents.includes(agentId)) {
        const output = fallbackSpecialist(agentId, "This specialist was not selected for the session.");
        specialistOutputs[agentId] = output;
        await emitAgentSkipped(emit, agentId);
        return;
      }

      const rankedChunks = retrievals[agentId].chunks;
      await emit({
        type: "agent.started",
        phase: "analyzing",
        stageId: agentId,
        agentId,
        message: `${agentLabel(agentId)} started independent analysis`,
        data: {
          currentTask: agentTask(agentId),
          progress: 12,
          evidenceCount: rankedChunks.length,
        },
      });

      try {
        const output = await runSpecialist(agentId, session.question, rankedChunks, onFallback);
        await announceFallbackIfNeeded();
        if (!llmConfiguration.enabled) {
          await delay(DEMO_COMPLETION_DELAY[agentId]);
        }

        const anchoredOutput = {
          ...output,
          evidence: chunksToEvidence(rankedChunks.slice(0, 4), `Reviewed by ${agentLabel(agentId)}`),
        } as AgentOutput;
        specialistOutputs[agentId] = anchoredOutput;
        completedAgentCount += 1;

        await emit({
          type: "agent.completed",
          phase: "analyzing",
          stageId: agentId,
          agentId,
          message: `${agentLabel(agentId)} completed with ${anchoredOutput.confidence} confidence`,
          data: {
            currentTask: "Analysis complete",
            progress: 100,
            evidenceCount: anchoredOutput.evidence.length,
            output: anchoredOutput,
          },
        });
      } catch (error) {
        const fallback = fallbackSpecialist(
          agentId,
          error instanceof Error ? error.message : "The specialist did not return a result.",
        );
        specialistOutputs[agentId] = fallback;
        await emit({
          type: "agent.failed",
          phase: "analyzing",
          stageId: agentId,
          agentId,
          message: `${agentLabel(agentId)} could not complete; consensus will continue cautiously`,
          data: {
            currentTask: "Specialist analysis unavailable",
            progress: 100,
            evidenceCount: rankedChunks.length,
            output: fallback,
            error: {
              code: "AGENT_FAILED",
              title: `${agentLabel(agentId)} failed`,
              message: error instanceof Error ? error.message : "Unknown specialist error",
              stageId: agentId,
              retryable: true,
            },
          },
        });
      }
    }),
  );

  void specialistSettlements;

  const literature = specialistOutputs["literature-search"] as LiteratureSearchAgentOutput;
  const drug = specialistOutputs["drug-interaction"] as DrugInteractionAgentOutput;
  const adverse = specialistOutputs["adverse-reaction"] as AdverseReactionAgentOutput;
  const trial = specialistOutputs["trial-summarizer"] as TrialSummarizerAgentOutput;

  let debate: DebateConsensusOutput;
  if (selectedAgents.includes("debate-consensus")) {
    await emit({
      type: "agent.started",
      phase: "consensus",
      stageId: "debate-consensus",
      agentId: "debate-consensus",
      message: "Consensus engine is comparing specialist positions",
      data: {
        currentTask: "Mapping agreement, contradiction, and missing evidence",
        progress: 18,
        evidenceCount: evidence.length,
      },
    });
    debate = await runDebateAgent({
      question: session.question,
      literature,
      drug,
      adverse,
      trial,
      onFallback,
    });
    await announceFallbackIfNeeded();
    debate = { ...debate, evidence: evidence.slice(0, 4) };
    if (!llmConfiguration.enabled) {
      await delay(420);
    }
    completedAgentCount += 1;
    await emit({
      type: "agent.completed",
      phase: "consensus",
      stageId: "debate-consensus",
      agentId: "debate-consensus",
      message: `${debate.agreements.length} agreements and ${debate.disagreements.length} disagreements mapped`,
      data: {
        currentTask: "Consensus complete",
        progress: 100,
        evidenceCount: debate.evidence.length,
        output: debate,
      },
    });
  } else {
    debate = fallbackDebate(session.question, literature, drug, adverse, trial);
    await emitAgentSkipped(emit, "debate-consensus");
  }

  let report: ReportOutput;
  if (selectedAgents.includes("report-generation")) {
    await emit({
      type: "agent.started",
      phase: "generating-report",
      stageId: "report-generation",
      agentId: "report-generation",
      message: "Report agent is assembling the traceable briefing",
      data: {
        currentTask: "Structuring findings, limitations, confidence, and references",
        progress: 15,
        evidenceCount: evidence.length,
      },
    });
    report = await runReportAgent({
      question: session.question,
      literature,
      drug,
      adverse,
      trial,
      debate,
      facts: groundedFacts,
      evidence,
      onFallback,
    });
    await announceFallbackIfNeeded();
    report = { ...report, evidence: evidence.slice(0, 4) };
    if (!llmConfiguration.enabled) {
      await delay(360);
    }
    completedAgentCount += 1;
  } else {
    report = fallbackReport(debate);
    await emitAgentSkipped(emit, "report-generation");
  }

  const initialBundle: AnalysisBundle = {
    literatureSearch: literature,
    drugInteraction: drug,
    adverseReaction: adverse,
    trialSummarizer: trial,
    debateConsensus: debate,
    reportGeneration: report,
    groundedFacts,
  };
  const artifacts = assembleResearchArtifacts(initialBundle, evidence, session.documents);

  if (selectedAgents.includes("report-generation")) {
    await emit({
      type: "agent.completed",
      phase: "generating-report",
      stageId: "report-generation",
      agentId: "report-generation",
      message: "Report structure generated; sections are ready for assembly",
      data: {
        currentTask: "Assembling report sections",
        progress: 100,
        evidenceCount: evidence.length,
        output: artifacts.bundle.reportGeneration,
      },
    });
  }

  for (const section of artifacts.sections) {
    if (!llmConfiguration.enabled) {
      await delay(90);
    }
    await emit({
      type: "report.section.completed",
      phase: "generating-report",
      stageId: "report-generation",
      message: `${section.title} assembled`,
      data: { section },
    });
  }

  const metrics: Partial<ResearchMetrics> = {
    documentCount: session.documents.length,
    pageCount,
    chunkCount: chunks.length,
    retrievedEvidenceCount: evidence.length,
    completedAgentCount,
    disagreementCount: debate.disagreements.length,
    assembledSectionCount: artifacts.sections.length,
    retrievalMethod,
    elapsedMs: Date.now() - startedAt,
  };

  await emit({
    type: "session.completed",
    phase: "completed",
    message: "Research briefing completed with source traceability preserved",
    data: {
      results: artifacts.bundle,
      confidence: artifacts.confidence,
      metrics,
    },
  });

  return { results: artifacts.bundle, metrics, confidence: artifacts.confidence, mode: actualMode };
}

async function runSpecialist(
  agentId: AgentId,
  question: string,
  chunks: SearchChunk[],
  onFallback: FallbackObserver,
) {
  switch (agentId) {
    case "literature-search":
      return runLiteratureSearchAgent({ question, chunks, onFallback });
    case "drug-interaction":
      return runDrugInteractionAgent({ question, chunks, onFallback });
    case "adverse-reaction":
      return runAdverseReactionAgent({ question, chunks, onFallback });
    case "trial-summarizer":
      return runTrialSummarizerAgent({ question, chunks, onFallback });
    default:
      throw new Error(`Unsupported specialist: ${agentId}`);
  }
}

function mergeEvidence(items: EvidenceItem[]) {
  return Array.from(new Map(items.map((item) => [item.chunkId, item])).values())
    .sort((left, right) => {
      const leftScore = left.similarityScore ?? left.lexicalScore;
      const rightScore = right.similarityScore ?? right.lexicalScore;
      return rightScore - leftScore;
    })
    .slice(0, 24);
}

async function emitAgentSkipped(emit: PipelineEmitter, agentId: AgentId) {
  await emit({
    type: "agent.skipped",
    phase: agentId === "report-generation"
      ? "generating-report"
      : agentId === "debate-consensus"
        ? "consensus"
        : "analyzing",
    stageId: agentId,
    agentId,
    message: `${agentLabel(agentId)} was not selected`,
    data: {
      currentTask: "Skipped by session configuration",
      progress: 100,
      evidenceCount: 0,
    },
  });
}

function fallbackSpecialist(agentId: AgentId, reason: string): AgentOutput {
  const base = {
    confidence: "low" as const,
    limitations: [reason],
    warnings: [RESEARCH_DISCLAIMER],
    evidence: [],
  };

  switch (agentId) {
    case "literature-search":
      return { ...base, agentName: "Literature Retrieval Agent", summary: reason, topRelevantExcerpts: [] };
    case "drug-interaction":
      return { ...base, agentName: "Drug Interaction Agent", summary: reason, findings: [] };
    case "adverse-reaction":
      return { ...base, agentName: "Adverse Reaction Agent", summary: reason, findings: [] };
    default:
      return { ...base, agentName: "Clinical Trial Summarizer", summary: reason, findings: [] };
  }
}

function fallbackDebate(
  question: string,
  literature: LiteratureSearchAgentOutput,
  drug: DrugInteractionAgentOutput,
  adverse: AdverseReactionAgentOutput,
  trial: TrialSummarizerAgentOutput,
): DebateConsensusOutput {
  return {
    agentName: "Debate / Consensus Agent",
    summary: "Consensus generation was disabled for this session.",
    confidence: "low",
    limitations: ["Specialist outputs were not reconciled by the consensus engine."],
    warnings: [RESEARCH_DISCLAIMER],
    evidence: literature.evidence,
    agreements: [literature.summary, trial.summary].filter(Boolean),
    disagreements: [drug.summary, adverse.summary].filter(Boolean),
    missingEvidence: ["Consensus review was disabled."],
    finalConsensus: `No formal consensus was generated for: ${question}`,
  };
}

function fallbackReport(debate: DebateConsensusOutput): ReportOutput {
  return {
    agentName: "Report Generation Agent",
    summary: "Report generation was disabled for this session.",
    confidence: "low",
    limitations: ["No final report was generated."],
    warnings: [RESEARCH_DISCLAIMER],
    evidence: debate.evidence,
    executiveSummary: debate.finalConsensus,
    keyFindings: debate.agreements,
    evidenceTable: [],
    risksAndUncertainties: debate.missingEvidence,
    recommendedFollowUpQuestions: ["Enable report generation for a complete briefing."],
    researchDisclaimer: RESEARCH_DISCLAIMER,
    physicianBriefing: "Not generated.",
    patientFriendlySummary: "Not generated.",
    markdownReport: `# Aetheris\n\n${debate.finalConsensus}\n\n${RESEARCH_DISCLAIMER}`,
  };
}

function agentLabel(agentId: AgentId) {
  return {
    "literature-search": "Literature Retrieval Agent",
    "drug-interaction": "Drug Interaction Agent",
    "adverse-reaction": "Adverse Reaction Agent",
    "trial-summarizer": "Clinical Trial Summarizer",
    "debate-consensus": "Debate / Consensus Agent",
    "report-generation": "Report Generation Agent",
  }[agentId];
}

function agentTask(agentId: AgentId) {
  return {
    "literature-search": "Verifying the strongest source passages",
    "drug-interaction": "Reviewing exposure and co-administration language",
    "adverse-reaction": "Comparing safety signals and contraindications",
    "trial-summarizer": "Assessing design, endpoints, population, and limitations",
    "debate-consensus": "Reconciling specialist positions",
    "report-generation": "Assembling the research briefing",
  }[agentId];
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
