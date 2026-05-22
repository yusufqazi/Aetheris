export const AGENT_IDS = [
  "literature-search",
  "drug-interaction",
  "adverse-reaction",
  "trial-summarizer",
  "debate-consensus",
  "report-generation",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export type SessionStatus = "draft" | "processing" | "completed" | "error";
export type SessionMode = "demo" | "authenticated";

export interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  uploadedAt: string;
  preview: string;
  text: string;
}

export interface EvidenceItem {
  excerpt: string;
  documentName: string;
  page?: number | null;
  section?: string | null;
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

export interface DebateConsensusOutput extends AgentBaseOutput {
  agreements: string[];
  disagreements: string[];
  missingEvidence: string[];
  finalConsensus: string;
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

export interface AnalysisBundle {
  literatureSearch: LiteratureSearchAgentOutput;
  drugInteraction: DrugInteractionAgentOutput;
  adverseReaction: AdverseReactionAgentOutput;
  trialSummarizer: TrialSummarizerAgentOutput;
  debateConsensus: DebateConsensusOutput;
  reportGeneration: ReportOutput;
}

export interface ResearchSession {
  id: string;
  question: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  mode: SessionMode;
  selectedAgents: AgentId[];
  documents: UploadedDocument[];
  results?: AnalysisBundle;
}

export interface SearchChunk {
  id: string;
  documentId: string;
  documentName: string;
  page?: number | null;
  text: string;
  score: number;
}
