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
import {
  confidenceFromEvidence,
  groundedFactsFromChunks,
  type FallbackObserver,
} from "@/lib/agents/shared";
import { assessEvidenceConfidence } from "@/lib/research/confidence";
import { getLlmConfiguration } from "@/lib/llm";
import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import { assembleResearchArtifacts } from "@/lib/research/artifacts";
import { normalizeEvidenceItems } from "@/lib/research/evidence-normalization";
import { extractGroundedFactsFromNormalizedEvidence } from "@/lib/research/normalized-grounding";
import { cleanSearchChunks } from "@/lib/research/source-cleaning";
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
  type GroundedFact,
  type LiteratureSearchAgentOutput,
  type ReportOutput,
  type ResearchMetrics,
  type ResearchSession,
  type SearchChunk,
  type SessionMode,
  type TrialSummarizerAgentOutput,
} from "@/lib/types";

const SPECIALIST_RESEARCH_TASKS: Record<(typeof SPECIALIST_AGENT_IDS)[number], string> = {
  "literature-search": "Find the passages that most directly answer the question, including changes over time and the basis for any documented decision.",
  "drug-interaction": "If the current documents contain relevant treatments or exposures, find interaction, compatibility, dose, timing, and monitoring evidence. Otherwise do not infer an interaction topic.",
  "adverse-reaction": "Find current-source evidence of harms, constraints, contraindications, complications, tolerability, and risk-related monitoring that bears on the question.",
  "trial-summarizer": "Find methods, population, comparisons, outcomes, follow-up, and evidence limitations that change how the current question should be interpreted.",
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
  let modelAvailable = llmConfiguration.enabled;
  let fallbackAnnounced = actualMode === "demo";
  const fallbackReasons = new Set<string>();
  const onFallback: FallbackObserver = (reason) => {
    actualMode = "demo";
    modelAvailable = false;
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

  const rawChunks = session.documents.flatMap((document) => chunkDocument(document));
  const chunks = cleanSearchChunks(rawChunks);
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

      const query = `${session.question}\nSpecialist task: ${SPECIALIST_RESEARCH_TASKS[agentId]}`;
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
  const broadRetrieval = await retrieveFromIndex(
    evidenceIndex,
    session.question,
    Math.min(32, Math.max(12, chunks.length)),
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
    [
      ...retrievalEntries.flatMap(([agentId, result]) =>
        chunksToEvidence(result.chunks, `Ranked for ${agentLabel(agentId)}`),
      ),
      ...chunksToEvidence(
        broadRetrieval.chunks,
        "Ranked against the complete research question",
      ),
    ],
  );
  const normalizedEvidence = normalizeEvidenceItems(evidence);
  const groundedFacts = extractGroundedFactsFromNormalizedEvidence(
    normalizedEvidence,
    evidence,
    session.question,
  );
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
        const output = await runSpecialist(
          agentId,
          session.question,
          rankedChunks,
          onFallback,
          () => modelAvailable,
        );
        await announceFallbackIfNeeded();
        if (!llmConfiguration.enabled) {
          await delay(DEMO_COMPLETION_DELAY[agentId]);
        }

        const specialistFacts = groundedFactsFromChunks(rankedChunks, session.question);
        const anchoredOutput = {
          ...output,
          confidence: confidenceFromEvidence(
            factsForSpecialistConfidence(agentId, specialistFacts),
            rankedChunks,
          ),
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
        if (llmConfiguration.enabled) {
          throw error;
        }
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
      shouldUseProvider: () => modelAvailable,
    });
    await announceFallbackIfNeeded();
    debate = {
      ...debate,
      confidence: assessEvidenceConfidence({
        facts: groundedFacts,
        evidence,
        counterEvidenceCount: debate.disagreements.length,
        missingEvidenceCount: debate.missingEvidence.length,
      }).level,
      evidence: evidence.slice(0, 4),
    };
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
    debate = {
      ...debate,
      confidence: assessEvidenceConfidence({
        facts: groundedFacts,
        evidence,
        counterEvidenceCount: debate.disagreements.length,
        missingEvidenceCount: debate.missingEvidence.length,
      }).level,
    };
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
    report = await withReportAssemblyProgress(
      runReportAgent({
        question: session.question,
        literature,
        drug,
        adverse,
        trial,
        debate,
        facts: groundedFacts,
        evidence,
        normalizedEvidence,
        onFallback,
        shouldUseProvider: () => modelAvailable,
        onAssemblyRecovery: async () => {
          await emit({
            type: "stage.progress",
            phase: "generating-report",
            stageId: "report-generation",
            message: "Finalizing from the completed specialist review",
            data: {
              progress: 86,
              detail: "The live specialist and consensus results are preserved; the source-grounded briefing is completing without repeating the model call.",
            },
          });
        },
      }),
      emit,
    );
    await announceFallbackIfNeeded();
    report = {
      ...report,
      confidence: assessEvidenceConfidence({
        facts: groundedFacts,
        evidence,
        counterEvidenceCount: debate.disagreements.length,
        missingEvidenceCount: debate.missingEvidence.length,
      }).level,
      evidence: evidence.slice(0, 4),
    };
    if (!llmConfiguration.enabled) {
      await delay(360);
    }
    completedAgentCount += 1;
  } else {
    report = fallbackReport(debate);
    report = {
      ...report,
      confidence: assessEvidenceConfidence({
        facts: groundedFacts,
        evidence,
        counterEvidenceCount: debate.disagreements.length,
        missingEvidenceCount: debate.missingEvidence.length,
      }).level,
    };
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

async function withReportAssemblyProgress<T>(
  operation: Promise<T>,
  emit: PipelineEmitter,
) {
  let progress = 24;
  const timer = setInterval(() => {
    progress = Math.min(76, progress + 8);
    void Promise.resolve(emit({
      type: "stage.progress",
      phase: "generating-report",
      stageId: "report-generation",
      message: "Report assembly is actively synthesizing the completed review",
      data: {
        progress,
        detail: "Combining specialist conclusions, disagreements, citations, and unresolved evidence",
      },
    })).catch((error) => {
      console.warn("[Aetheris research] Report progress update failed", error);
    });
  }, 5_000);

  try {
    return await operation;
  } finally {
    clearInterval(timer);
  }
}

function factsForSpecialistConfidence(
  agentId: (typeof SPECIALIST_AGENT_IDS)[number],
  facts: GroundedFact[],
) {
  if (agentId === "drug-interaction") {
    return facts.filter((fact) =>
      fact.category === "interaction" || fact.contentType === "interaction_concern"
    );
  }
  if (agentId === "adverse-reaction") {
    return facts.filter((fact) =>
      fact.category === "safety" || fact.contentType === "safety_observation"
    );
  }
  if (agentId === "trial-summarizer") {
    return facts.filter((fact) =>
      ["efficacy", "exclusion", "statistical", "study-design"].includes(fact.category) ||
      ["limitation", "longitudinal_change"].includes(fact.contentType)
    );
  }
  return facts;
}

async function runSpecialist(
  agentId: AgentId,
  question: string,
  chunks: SearchChunk[],
  onFallback: FallbackObserver,
  shouldUseProvider: () => boolean,
) {
  switch (agentId) {
    case "literature-search":
      return runLiteratureSearchAgent({ question, chunks, onFallback, shouldUseProvider });
    case "drug-interaction":
      return runDrugInteractionAgent({ question, chunks, onFallback, shouldUseProvider });
    case "adverse-reaction":
      return runAdverseReactionAgent({ question, chunks, onFallback, shouldUseProvider });
    case "trial-summarizer":
      return runTrialSummarizerAgent({ question, chunks, onFallback, shouldUseProvider });
    default:
      throw new Error(`Unsupported specialist: ${agentId}`);
  }
}

function mergeEvidence(items: EvidenceItem[]) {
  const ranked = Array.from(new Map(items.map((item) => [item.chunkId, item])).values())
    .sort((left, right) => {
      const leftScore = left.similarityScore ?? left.lexicalScore;
      const rightScore = right.similarityScore ?? right.lexicalScore;
      return rightScore - leftScore;
    });
  const selected: EvidenceItem[] = [];
  const selectedChunks = new Set<string>();
  const selectedDocuments = new Set<string>();
  const add = (item: EvidenceItem) => {
    if (selected.length >= 24 || selectedChunks.has(item.chunkId)) return;
    selected.push(item);
    selectedChunks.add(item.chunkId);
    selectedDocuments.add(item.documentId);
  };

  const documents = Array.from(new Set(ranked.map((item) => item.documentId)));
  const byDocument = new Map(documents.map((documentId) => [
    documentId,
    ranked.filter((item) => item.documentId === documentId),
  ]));

  // Round-robin the strongest passages from every source before filling the
  // remaining budget. This prevents a polished summary from crowding out the
  // underlying notes, laboratory records, consultations, or follow-up sources.
  for (let depth = 0; depth < 3 && selected.length < 24; depth += 1) {
    for (const documentId of documents) {
      const item = byDocument.get(documentId)?.[depth];
      if (item) add(item);
    }
  }
  for (const item of ranked) add(item);
  return selected.sort((left, right) =>
    (right.similarityScore ?? right.lexicalScore) - (left.similarityScore ?? left.lexicalScore),
  );
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
