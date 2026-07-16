import { nanoid } from "nanoid";

import {
  AGENT_IDS,
  PIPELINE_STAGE_IDS,
  type AgentExecution,
  type AgentId,
  type EvidenceItem,
  type PipelineStageId,
  type PipelineStageStatus,
  type PipelineStageState,
  type ResearchEvent,
  type ResearchMetrics,
  type ResearchSession,
  type SessionPhase,
  type UploadedDocument,
} from "@/lib/types";

const STAGE_COPY: Record<PipelineStageId, { label: string; description: string }> = {
  uploading: {
    label: "Uploading",
    description: "Securely receiving the selected source documents.",
  },
  parsing: {
    label: "Parsing",
    description: "Extracting ordered text from every PDF page.",
  },
  normalizing: {
    label: "Normalizing",
    description: "Cleaning source text while preserving page boundaries.",
  },
  chunking: {
    label: "Chunking",
    description: "Building source-addressable evidence passages.",
  },
  indexing: {
    label: "Indexing",
    description: "Preparing semantic or lexical retrieval vectors.",
  },
  retrieval: {
    label: "Retrieval",
    description: "Searching each specialist's evidence context.",
  },
  "evidence-ranking": {
    label: "Evidence ranking",
    description: "Ranking traceable passages against the research objective.",
  },
  "literature-search": {
    label: "Literature retrieval",
    description: "Locating the strongest source-grounded excerpts.",
  },
  "drug-interaction": {
    label: "Drug interaction",
    description: "Reviewing interaction and exposure concerns.",
  },
  "adverse-reaction": {
    label: "Adverse reaction",
    description: "Extracting safety signals and contraindications.",
  },
  "trial-summarizer": {
    label: "Clinical trial review",
    description: "Assessing design, population, endpoints, and limitations.",
  },
  "debate-consensus": {
    label: "Consensus",
    description: "Reconciling agreement, contradiction, and missing evidence.",
  },
  "report-generation": {
    label: "Report assembly",
    description: "Assembling the final traceable research briefing.",
  },
};

const AGENT_TASKS: Record<AgentId, string> = {
  "literature-search": "Waiting for ranked evidence",
  "drug-interaction": "Waiting for ranked evidence",
  "adverse-reaction": "Waiting for ranked evidence",
  "trial-summarizer": "Waiting for ranked evidence",
  "debate-consensus": "Waiting for specialist perspectives",
  "report-generation": "Waiting for consensus",
};

export function createPipeline(selectedAgents: AgentId[], documents: UploadedDocument[] = []) {
  const prepared = documents.length > 0;

  return PIPELINE_STAGE_IDS.map<PipelineStageState>((id) => {
    const disabled = AGENT_IDS.includes(id as AgentId) && !selectedAgents.includes(id as AgentId);
    const uploadComplete = prepared && ["uploading", "parsing", "normalizing"].includes(id);

    return {
      id,
      label: STAGE_COPY[id].label,
      description: STAGE_COPY[id].description,
      status: disabled ? "skipped" : uploadComplete ? "completed" : "pending",
      progress: disabled || uploadComplete ? 100 : 0,
      detail: disabled ? "Not selected for this session" : null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    };
  });
}

export function createAgentExecutions(selectedAgents: AgentId[]) {
  return Object.fromEntries(
    AGENT_IDS.map((agentId) => [
      agentId,
      {
        agentId,
        status: selectedAgents.includes(agentId) ? "pending" : "skipped",
        currentTask: selectedAgents.includes(agentId)
          ? AGENT_TASKS[agentId]
          : "Disabled for this session",
        confidence: null,
        evidenceCount: 0,
        progress: selectedAgents.includes(agentId) ? 0 : 100,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
      } satisfies AgentExecution,
    ]),
  ) as Record<AgentId, AgentExecution>;
}

export function createResearchSession({
  id = nanoid(),
  question,
  selectedAgents,
  documents = [],
  mode,
}: {
  id?: string;
  question: string;
  selectedAgents: AgentId[];
  documents?: UploadedDocument[];
  mode: ResearchSession["mode"];
}): ResearchSession {
  const now = new Date().toISOString();

  return {
    id,
    question,
    createdAt: now,
    updatedAt: now,
    status: "idle",
    mode,
    selectedAgents,
    documents,
    pipeline: createPipeline(selectedAgents, documents),
    events: [],
    agentExecutions: createAgentExecutions(selectedAgents),
    evidence: [],
    reportSections: [],
    metrics: metricsFromDocuments(documents),
    confidence: undefined,
    error: null,
    results: undefined,
  };
}

export function applyResearchEvent(session: ResearchSession, event: ResearchEvent) {
  if (session.events.some((item) => item.id === event.id)) {
    return session;
  }

  const latestSequence = session.events.reduce(
    (maximum, item) => Math.max(maximum, item.sequence),
    0,
  );
  if (event.sequence <= latestSequence) {
    return session;
  }

  const next: ResearchSession = {
    ...session,
    status: event.phase,
    updatedAt: event.timestamp,
    events: [...session.events, compactResearchEvent(event)].sort(
      (left, right) => left.sequence - right.sequence,
    ),
    pipeline: session.pipeline.map((stage) => updateStage(stage, event)),
    agentExecutions: { ...session.agentExecutions },
    metrics: { ...session.metrics },
    error: event.type === "session.failed" ? event.data?.error ?? session.error : session.error,
  };

  if (event.type === "documents.ready") {
    next.documents = event.data.documents;
    next.metrics = { ...next.metrics, ...event.data.metrics };
  }

  if (event.type === "evidence.ready") {
    next.evidence = event.data.evidence;
    next.metrics = {
      ...next.metrics,
      chunkCount: event.data.chunkCount,
      retrievedEvidenceCount: event.data.evidence.length,
      retrievalMethod: event.data.retrievalMethod,
    };
  }

  if (event.type === "analysis.mode") {
    next.mode = event.data.mode;
  }

  if (
    event.type === "agent.started" ||
    event.type === "agent.completed" ||
    event.type === "agent.failed" ||
    event.type === "agent.skipped"
  ) {
    const previous = next.agentExecutions[event.agentId] ?? createAgentExecutions([event.agentId])[event.agentId];
    const completed = event.type === "agent.completed";
    const failed = event.type === "agent.failed";
    const skipped = event.type === "agent.skipped";
    const completedAt = completed || failed || skipped ? event.timestamp : previous.completedAt;
    const startedAt = event.type === "agent.started" ? event.timestamp : previous.startedAt;

    next.agentExecutions[event.agentId] = {
      ...previous,
      status: completed ? "completed" : failed ? "failed" : skipped ? "skipped" : "running",
      currentTask: event.data.currentTask,
      progress: event.data.progress,
      evidenceCount: event.data.evidenceCount,
      confidence: event.data.output?.confidence ?? previous.confidence,
      output: event.data.output ?? previous.output,
      error: event.data.error?.message ?? previous.error,
      startedAt,
      completedAt,
      durationMs: getDuration(startedAt, completedAt),
    };

    next.metrics.completedAgentCount = Object.values(next.agentExecutions).filter(
      (execution) => execution?.status === "completed",
    ).length;
  }

  if (event.type === "report.section.completed") {
    const withoutCurrent = next.reportSections.filter((section) => section.id !== event.data.section.id);
    next.reportSections = [...withoutCurrent, event.data.section];
    next.metrics.assembledSectionCount = next.reportSections.length;
  }

  if ("data" in event && event.data && "metrics" in event.data && event.data.metrics) {
    next.metrics = { ...next.metrics, ...event.data.metrics };
  }

  if (event.type === "session.completed") {
    next.status = "completed";
    next.results = event.data?.results ?? next.results;
    next.confidence = event.data?.confidence ?? next.confidence;
    next.error = null;
  }

  if (event.type === "session.failed") {
    next.status = "error";
  }

  return next;
}

function updateStage(stage: PipelineStageState, event: ResearchEvent) {
  if (!("stageId" in event) || event.stageId !== stage.id) {
    return stage;
  }

  if (event.type === "stage.started") {
    return {
      ...stage,
      status: "running" as const,
      progress: event.data?.progress ?? 8,
      startedAt: event.timestamp,
      detail: event.data?.detail ?? event.message,
    };
  }

  if (event.type === "stage.progress") {
    return {
      ...stage,
      status: "running" as const,
      progress: event.data?.progress ?? stage.progress,
      detail: event.data?.detail ?? event.message,
    };
  }

  const isAgentEvent = event.type.startsWith("agent.");
  const completed = event.type === "stage.completed" || event.type === "agent.completed";
  const failed = event.type === "stage.failed" || event.type === "agent.failed";
  const skipped = event.type === "agent.skipped";
  const explicitStatus =
    event.data && "status" in event.data ? event.data.status : undefined;
  const status: PipelineStageStatus = explicitStatus ?? (completed
    ? "completed"
    : failed
      ? "failed"
      : skipped
        ? "skipped"
        : "running");

  if (!completed && !failed && !skipped && !isAgentEvent) {
    return stage;
  }

  const startedAt = stage.startedAt ?? event.timestamp;

  return {
    ...stage,
    status,
    progress: completed || skipped || status === "partial" ? 100 : stage.progress,
    completedAt: completed || failed || skipped ? event.timestamp : stage.completedAt,
    durationMs: getDuration(startedAt, completed || failed || skipped ? event.timestamp : null),
    detail: event.message,
  };
}

function getDuration(startedAt?: string | null, completedAt?: string | null) {
  if (!startedAt || !completedAt) {
    return null;
  }

  return Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
}

function metricsFromDocuments(documents: UploadedDocument[]): ResearchMetrics {
  return {
    documentCount: documents.length,
    pageCount: documents.reduce((total, document) => total + document.pageCount, 0),
    chunkCount: 0,
    retrievedEvidenceCount: 0,
    completedAgentCount: 0,
    disagreementCount: 0,
    assembledSectionCount: 0,
    retrievalMethod: null,
    elapsedMs: null,
  };
}

export function normalizeResearchSession(value: unknown): ResearchSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Omit<Partial<ResearchSession>, "status" | "mode"> & {
    status?: SessionPhase | "draft" | "processing";
    mode?: ResearchSession["mode"] | "authenticated";
  };

  if (!raw.id || !raw.question || !raw.createdAt) {
    return null;
  }

  const documents = (raw.documents ?? []).map(normalizeDocument);
  const selectedAgents = (raw.selectedAgents ?? [...AGENT_IDS]).filter((agent): agent is AgentId =>
    AGENT_IDS.includes(agent as AgentId),
  );
  const mappedStatus = mapLegacyStatus(raw.status);
  const base = createResearchSession({
    id: raw.id,
    question: raw.question,
    selectedAgents,
    documents,
    mode: raw.mode === "authenticated" || raw.mode === "live" ? "live" : "demo",
  });

  const completedPipeline = mappedStatus === "completed"
    ? base.pipeline.map((stage) => ({
        ...stage,
        status: stage.status === "skipped" ? "skipped" as const : "completed" as const,
        progress: 100,
        detail: "Legacy session; stage timing unavailable",
      }))
    : raw.pipeline ?? base.pipeline;

  return {
    ...base,
    ...raw,
    mode: raw.mode === "authenticated" || raw.mode === "live" ? "live" : "demo",
    status: mappedStatus,
    updatedAt: raw.updatedAt ?? raw.createdAt,
    selectedAgents,
    documents,
    pipeline: completedPipeline,
    events: raw.events ?? [],
    agentExecutions: raw.agentExecutions ?? inferExecutions(raw, selectedAgents),
    evidence: (raw.evidence ?? raw.results?.evidenceIndex ?? []).map(normalizeEvidence),
    reportSections: raw.reportSections ?? raw.results?.reportGeneration.sections ?? [],
    metrics: { ...metricsFromDocuments(documents), ...raw.metrics },
    confidence: raw.confidence ?? raw.results?.confidence,
    error: normalizeInterruptedError(mappedStatus, raw.error),
  };
}

function normalizeDocument(document: UploadedDocument) {
  if (document.pages?.length) {
    return document;
  }

  const text = document.text ?? "";
  return {
    ...document,
    pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
    pageCount: document.pageCount || 1,
  };
}

function normalizeEvidence(item: Partial<EvidenceItem>): EvidenceItem {
  const documentName = item.documentName ?? "Uploaded document";
  const excerpt = item.excerpt ?? "";
  const page = item.page ?? null;
  const stable = `${documentName}:${page ?? "na"}:${excerpt.slice(0, 40)}`;

  return {
    id: item.id ?? `evidence:${stable}`,
    chunkId: item.chunkId ?? `legacy:${stable}`,
    documentId: item.documentId ?? `legacy:${documentName}`,
    excerpt,
    documentName,
    page,
    section: item.section ?? (page ? `Page ${page}` : null),
    relevance: item.relevance ?? "Legacy source evidence",
    contextBefore: item.contextBefore ?? "",
    contextAfter: item.contextAfter ?? "",
    matchedTerms: item.matchedTerms ?? [],
    lexicalScore: item.lexicalScore ?? 0,
    similarityScore: item.similarityScore ?? null,
    retrievalMethod: item.retrievalMethod ?? "lexical",
  };
}

function inferExecutions(
  raw: { results?: ResearchSession["results"] },
  selectedAgents: AgentId[],
): Partial<Record<AgentId, AgentExecution>> {
  const executions = createAgentExecutions(selectedAgents);
  const outputs = raw.results
    ? {
        "literature-search": raw.results.literatureSearch,
        "drug-interaction": raw.results.drugInteraction,
        "adverse-reaction": raw.results.adverseReaction,
        "trial-summarizer": raw.results.trialSummarizer,
        "debate-consensus": raw.results.debateConsensus,
        "report-generation": raw.results.reportGeneration,
      }
    : null;

  if (!outputs) {
    return executions;
  }

  for (const agentId of AGENT_IDS) {
    const output = outputs[agentId];
    if (!output || !selectedAgents.includes(agentId)) {
      continue;
    }

    executions[agentId] = {
      ...executions[agentId],
      status: "completed",
      progress: 100,
      currentTask: "Legacy output available",
      confidence: output.confidence,
      evidenceCount: output.evidence.length,
      output,
    };
  }

  return executions;
}

function mapLegacyStatus(status: ResearchSession["status"] | "draft" | "processing" | undefined) {
  if (status === "draft") {
    return "idle" as const;
  }

  if (
    status === "processing" ||
    status === "uploading" ||
    status === "retrieving" ||
    status === "analyzing" ||
    status === "consensus" ||
    status === "generating-report"
  ) {
    return "error" as const;
  }

  return status ?? "idle";
}

function compactResearchEvent(event: ResearchEvent): ResearchEvent {
  if (event.type === "documents.ready") {
    return { ...event, data: { ...event.data, documents: [] } };
  }

  if (
    event.type === "agent.completed" ||
    event.type === "agent.failed" ||
    event.type === "agent.started" ||
    event.type === "agent.skipped"
  ) {
    return { ...event, data: { ...event.data, output: undefined } };
  }

  if (event.type === "session.completed") {
    return { ...event, data: { ...event.data, results: undefined } };
  }

  return event;
}

function normalizeInterruptedError(
  status: ResearchSession["status"],
  error: ResearchSession["error"],
) {
  if (error) {
    return error;
  }

  if (status !== "error") {
    return null;
  }

  return {
    code: "SESSION_INTERRUPTED",
    title: "Research session interrupted",
    message: "The live connection ended before the research run completed. Your uploaded sources are preserved.",
    retryable: true,
    details: "Restart from retrieval to continue with the preserved document set.",
  };
}
