export const AGENT_IDS = [
  "literature-search",
  "drug-interaction",
  "adverse-reaction",
  "trial-summarizer",
  "debate-consensus",
  "report-generation",
] as const;

export const SPECIALIST_AGENT_IDS = [
  "literature-search",
  "drug-interaction",
  "adverse-reaction",
  "trial-summarizer",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export const SESSION_PHASES = [
  "idle",
  "uploading",
  "processing",
  "retrieving",
  "analyzing",
  "consensus",
  "generating-report",
  "completed",
  "error",
] as const;

export type SessionPhase = (typeof SESSION_PHASES)[number];
export type SessionStatus = SessionPhase;
export type SessionMode = "demo" | "live";

export const PIPELINE_STAGE_IDS = [
  "uploading",
  "parsing",
  "normalizing",
  "chunking",
  "indexing",
  "retrieval",
  "evidence-ranking",
  ...AGENT_IDS,
] as const;

export type PipelineStageId = (typeof PIPELINE_STAGE_IDS)[number];
export type PipelineStageStatus =
  | "pending"
  | "running"
  | "completed"
  | "partial"
  | "skipped"
  | "failed";

export interface DocumentPage {
  number: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  uploadedAt: string;
  preview: string;
  text: string;
  pages: DocumentPage[];
}

export type RetrievalMethod = "embedding" | "lexical";

export interface SearchChunk {
  id: string;
  documentId: string;
  documentName: string;
  page?: number | null;
  text: string;
  score: number;
  startOffset: number;
  endOffset: number;
  contextBefore: string;
  contextAfter: string;
  matchedTerms: string[];
  lexicalScore: number;
  similarityScore?: number | null;
  rank?: number | null;
  retrievalMethod?: RetrievalMethod;
}

export interface EvidenceItem {
  id: string;
  chunkId: string;
  documentId: string;
  excerpt: string;
  documentName: string;
  page?: number | null;
  section?: string | null;
  relevance: string;
  contextBefore: string;
  contextAfter: string;
  matchedTerms: string[];
  lexicalScore: number;
  similarityScore?: number | null;
  retrievalMethod: RetrievalMethod;
}

export interface Citation {
  id: string;
  evidenceId: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  page?: number | null;
  excerpt: string;
  label: string;
}

export type GroundedFactCategory =
  | "interaction"
  | "efficacy"
  | "safety"
  | "study-design"
  | "limitation"
  | "exclusion"
  | "statistical";

export interface GroundedFact {
  id: string;
  category: GroundedFactCategory;
  text: string;
  evidenceId: string;
  documentId: string;
  documentName: string;
  page?: number | null;
  excerpt: string;
  relevance: string;
}

export interface AgentBaseOutput {
  agentName: string;
  summary: string;
  confidence: "low" | "medium" | "high";
  limitations: string[];
  warnings: string[];
  evidence: EvidenceItem[];
}

export interface DrugInteractionFinding {
  possibleInteraction: string;
  severityEstimate: "low" | "moderate" | "high" | "unclear";
  uncertaintyLevel: "low" | "medium" | "high";
  notes: string;
  evidence: string;
}

export interface AdverseReactionFinding {
  adverseEvent: string;
  frequency: string;
  affectedPopulation: string;
  sourceEvidence: string;
  confidenceLevel: "low" | "medium" | "high";
}

export interface TrialSummaryFinding {
  studyObjective: string;
  methods: string;
  keyFindings: string;
  limitations: string;
  relevance: string;
}

export interface LiteratureExcerpt {
  excerpt: string;
  documentName: string;
  page?: number | null;
  section?: string | null;
  relevanceExplanation: string;
}

export type ConsensusStance = "agree" | "caution" | "disagree" | "insufficient";

export interface ConsensusPosition {
  agentId: AgentId;
  stance: ConsensusStance;
  confidence: "low" | "medium" | "high";
  rationale: string;
  evidenceIds: string[];
}

export interface ConsensusClaim {
  id: string;
  claim: string;
  positions: ConsensusPosition[];
  confidence: number;
  uncertaintyReasons: string[];
  citationIds: string[];
}

export interface DebateConsensusOutput extends AgentBaseOutput {
  agreements: string[];
  disagreements: string[];
  missingEvidence: string[];
  finalConsensus: string;
  claims?: ConsensusClaim[];
}

export const REPORT_SECTION_IDS = [
  "executive-summary",
  "key-findings",
  "safety-findings",
  "study-design",
  "limitations",
  "confidence",
  "follow-up-questions",
  "source-evidence",
  "disclaimer",
] as const;

export type ReportSectionId = (typeof REPORT_SECTION_IDS)[number];

export interface ReportItem {
  id: string;
  text: string;
  citationIds: string[];
  agentIds: AgentId[];
  documentIds: string[];
}

export interface ReportSection {
  id: ReportSectionId;
  title: string;
  body?: string;
  items: ReportItem[];
  citationIds: string[];
  agentIds: AgentId[];
  documentIds: string[];
  status: "pending" | "assembled";
}

export type ResearchAnswerStatus = "direct" | "partial" | "insufficient";
export type ResearchPriority = "critical" | "high" | "moderate" | "low";

export interface EvidenceTrajectoryItem {
  sequence: number;
  label: string;
  finding: string;
  interpretation: string;
  evidenceIds: string[];
}

export interface InteractionPathway {
  title: string;
  priority: ResearchPriority;
  finding: string;
  observedSignal: string;
  whyItMatters: string;
  uncertainty: string;
  evidenceIds: string[];
}

export interface ResearchContradiction {
  issue: string;
  sourcePositions: string[];
  reconciliation: string;
  impact: string;
  evidenceIds: string[];
}

export interface DecisionChangingUnknown {
  unknown: string;
  whyItMatters: string;
  evidenceNeeded: string;
  priority: Exclude<ResearchPriority, "critical">;
}

export interface ResearchIntelligence {
  answerStatus: ResearchAnswerStatus;
  directAnswer: string;
  strongestSupportedConclusion: string;
  strongestCounterpoint: string;
  evidenceTrajectory: EvidenceTrajectoryItem[];
  interactionPathways: InteractionPathway[];
  contradictions: ResearchContradiction[];
  decisionChangingUnknowns: DecisionChangingUnknown[];
}

export interface ReportOutput extends AgentBaseOutput {
  executiveSummary: string;
  keyFindings: string[];
  evidenceTable: Array<{
    topic: string;
    finding: string;
    supportingSource: string;
    confidence: string;
  }>;
  risksAndUncertainties: string[];
  recommendedFollowUpQuestions: string[];
  researchDisclaimer: string;
  physicianBriefing: string;
  patientFriendlySummary: string;
  markdownReport: string;
  sections?: ReportSection[];
  citations?: Citation[];
  researchIntelligence?: ResearchIntelligence;
}

export interface DrugInteractionAgentOutput extends AgentBaseOutput {
  findings: DrugInteractionFinding[];
}

export interface AdverseReactionAgentOutput extends AgentBaseOutput {
  findings: AdverseReactionFinding[];
}

export interface TrialSummarizerAgentOutput extends AgentBaseOutput {
  findings: TrialSummaryFinding[];
}

export interface LiteratureSearchAgentOutput extends AgentBaseOutput {
  topRelevantExcerpts: LiteratureExcerpt[];
}

export type AgentOutput =
  | LiteratureSearchAgentOutput
  | DrugInteractionAgentOutput
  | AdverseReactionAgentOutput
  | TrialSummarizerAgentOutput
  | DebateConsensusOutput
  | ReportOutput;

export interface ConfidenceDimension {
  id:
    | "evidence-coverage"
    | "citation-strength"
    | "agent-agreement"
    | "reasoning-confidence"
    | "missing-evidence"
    | "contradictions";
  label: string;
  score: number;
  detail: string;
  riskCount?: number;
}

export interface ConfidenceProfile {
  overall: number;
  dimensions: ConfidenceDimension[];
  generatedAt: string;
}

export interface AnalysisBundle {
  literatureSearch: LiteratureSearchAgentOutput;
  drugInteraction: DrugInteractionAgentOutput;
  adverseReaction: AdverseReactionAgentOutput;
  trialSummarizer: TrialSummarizerAgentOutput;
  debateConsensus: DebateConsensusOutput;
  reportGeneration: ReportOutput;
  evidenceIndex?: EvidenceItem[];
  citations?: Citation[];
  consensusClaims?: ConsensusClaim[];
  confidence?: ConfidenceProfile;
  groundedFacts?: GroundedFact[];
}

export interface AgentExecution {
  agentId: AgentId;
  status: PipelineStageStatus;
  currentTask: string;
  confidence?: "low" | "medium" | "high" | null;
  evidenceCount: number;
  progress: number;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  output?: AgentOutput;
  error?: string | null;
}

export interface PipelineStageState {
  id: PipelineStageId;
  label: string;
  description: string;
  status: PipelineStageStatus;
  progress: number;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  detail?: string | null;
}

export interface ResearchMetrics {
  documentCount: number;
  pageCount: number;
  chunkCount: number;
  retrievedEvidenceCount: number;
  completedAgentCount: number;
  disagreementCount: number;
  assembledSectionCount: number;
  retrievalMethod?: RetrievalMethod | null;
  elapsedMs?: number | null;
}

export interface ResearchError {
  code: string;
  title: string;
  message: string;
  stageId?: PipelineStageId | null;
  retryable: boolean;
  details?: string | null;
}

interface ResearchEventBase {
  version: 1;
  id: string;
  sessionId: string;
  sequence: number;
  timestamp: string;
  phase: SessionPhase;
  message: string;
}

export type StageResearchEvent = ResearchEventBase & {
  type: "stage.started" | "stage.progress" | "stage.completed" | "stage.failed";
  stageId: PipelineStageId;
  data?: {
    progress?: number;
    detail?: string;
    status?: PipelineStageStatus;
    metrics?: Partial<ResearchMetrics>;
    error?: ResearchError;
  };
};

export type AgentResearchEvent = ResearchEventBase & {
  type: "agent.started" | "agent.completed" | "agent.failed" | "agent.skipped";
  stageId: AgentId;
  agentId: AgentId;
  data: {
    currentTask: string;
    progress: number;
    evidenceCount: number;
    output?: AgentOutput;
    error?: ResearchError;
  };
};

export type EvidenceResearchEvent = ResearchEventBase & {
  type: "evidence.ready";
  stageId: "evidence-ranking";
  data: {
    evidence: EvidenceItem[];
    retrievalMethod: RetrievalMethod;
    chunkCount: number;
  };
};

export type DocumentsResearchEvent = ResearchEventBase & {
  type: "documents.ready";
  stageId: "normalizing";
  data: {
    documents: UploadedDocument[];
    metrics: Partial<ResearchMetrics>;
  };
};

export type ReportResearchEvent = ResearchEventBase & {
  type: "report.section.completed";
  stageId: "report-generation";
  data: {
    section: ReportSection;
  };
};

export type SessionResearchEvent = ResearchEventBase & {
  type: "session.completed" | "session.failed" | "timeline.note";
  data?: {
    results?: AnalysisBundle;
    confidence?: ConfidenceProfile;
    metrics?: Partial<ResearchMetrics>;
    error?: ResearchError;
  };
};

export type AnalysisModeResearchEvent = ResearchEventBase & {
  type: "analysis.mode";
  data: {
    mode: SessionMode;
    reason: string;
  };
};

export type ResearchEvent =
  | StageResearchEvent
  | AgentResearchEvent
  | EvidenceResearchEvent
  | DocumentsResearchEvent
  | ReportResearchEvent
  | SessionResearchEvent
  | AnalysisModeResearchEvent;

export interface ResearchSession {
  id: string;
  question: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  mode: SessionMode;
  selectedAgents: AgentId[];
  documents: UploadedDocument[];
  pipeline: PipelineStageState[];
  events: ResearchEvent[];
  agentExecutions: Partial<Record<AgentId, AgentExecution>>;
  evidence: EvidenceItem[];
  reportSections: ReportSection[];
  metrics: ResearchMetrics;
  confidence?: ConfidenceProfile;
  error?: ResearchError | null;
  results?: AnalysisBundle;
}

export type WorkspaceInspectorTab = "evidence" | "source" | "confidence" | "agent";

export interface WorkspaceInspectorSelection {
  tab: WorkspaceInspectorTab;
  sessionId?: string | null;
  evidenceId?: string | null;
  agentId?: AgentId | null;
}
