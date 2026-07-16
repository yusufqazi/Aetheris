import { z } from "zod";

import { AGENT_IDS } from "@/lib/types";

export const documentPageSchema = z.object({
  number: z.number().int().positive(),
  text: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
});

export const uploadedDocumentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  size: z.number().nonnegative(),
  pageCount: z.number().int().positive(),
  uploadedAt: z.string(),
  preview: z.string(),
  text: z.string(),
  pages: z.array(documentPageSchema),
});

export const analyzeRequestSchema = z.object({
  sessionId: z.string().min(1),
  question: z.string().trim().min(7),
  documents: z.array(uploadedDocumentSchema).min(1),
  selectedAgents: z.array(z.enum(AGENT_IDS)).min(1),
  resumeFrom: z.string().optional(),
  startingSequence: z.number().int().nonnegative().default(0),
  priorEvents: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const evidenceItemSchema = z.object({
  id: z.string().default(""),
  chunkId: z.string().default(""),
  documentId: z.string().default(""),
  excerpt: z.string(),
  documentName: z.string(),
  page: z.number().nullable().optional(),
  section: z.string().nullable().optional(),
  relevance: z.string(),
  contextBefore: z.string().default(""),
  contextAfter: z.string().default(""),
  matchedTerms: z.array(z.string()).default([]),
  lexicalScore: z.number().default(0),
  similarityScore: z.number().nullable().optional(),
  retrievalMethod: z.enum(["embedding", "lexical"]).default("lexical"),
});

const confidenceSchema = z.enum(["low", "medium", "high"]);
const agentBaseShape = {
  agentName: z.string(),
  summary: z.string(),
  confidence: confidenceSchema,
  limitations: z.array(z.string()),
  warnings: z.array(z.string()),
  evidence: z.array(evidenceItemSchema),
};

export const literatureSearchOutputSchema = z.object({
  ...agentBaseShape,
  topRelevantExcerpts: z.array(
    z.object({
      excerpt: z.string(),
      documentName: z.string(),
      page: z.number().nullable().optional(),
      section: z.string().nullable().optional(),
      relevanceExplanation: z.string(),
    }),
  ),
});

export const drugInteractionOutputSchema = z.object({
  ...agentBaseShape,
  findings: z.array(
    z.object({
      possibleInteraction: z.string(),
      severityEstimate: z.enum(["low", "moderate", "high", "unclear"]),
      uncertaintyLevel: confidenceSchema,
      notes: z.string(),
      evidence: z.string(),
    }),
  ),
});

export const adverseReactionOutputSchema = z.object({
  ...agentBaseShape,
  findings: z.array(
    z.object({
      adverseEvent: z.string(),
      frequency: z.string(),
      affectedPopulation: z.string(),
      sourceEvidence: z.string(),
      confidenceLevel: confidenceSchema,
    }),
  ),
});

export const trialSummarizerOutputSchema = z.object({
  ...agentBaseShape,
  findings: z.array(
    z.object({
      studyObjective: z.string(),
      methods: z.string(),
      keyFindings: z.string(),
      limitations: z.string(),
      relevance: z.string(),
    }),
  ),
});

export const debateConsensusOutputSchema = z.object({
  ...agentBaseShape,
  agreements: z.array(z.string()),
  disagreements: z.array(z.string()),
  missingEvidence: z.array(z.string()),
  finalConsensus: z.string(),
});

export const researchIntelligenceSchema = z.object({
  answerStatus: z.enum(["direct", "partial", "insufficient"]),
  directAnswer: z.string(),
  strongestSupportedConclusion: z.string(),
  strongestCounterpoint: z.string(),
  evidenceTrajectory: z.array(z.object({
    sequence: z.number().int().positive(),
    label: z.string(),
    finding: z.string(),
    interpretation: z.string(),
    evidenceIds: z.array(z.string()),
  })).max(6),
  interactionPathways: z.array(z.object({
    title: z.string(),
    priority: z.enum(["critical", "high", "moderate", "low"]),
    finding: z.string(),
    observedSignal: z.string(),
    whyItMatters: z.string(),
    uncertainty: z.string(),
    evidenceIds: z.array(z.string()),
  })).max(6),
  contradictions: z.array(z.object({
    issue: z.string(),
    sourcePositions: z.array(z.string()).max(4),
    reconciliation: z.string(),
    impact: z.string(),
    evidenceIds: z.array(z.string()),
  })).max(5),
  decisionChangingUnknowns: z.array(z.object({
    unknown: z.string(),
    whyItMatters: z.string(),
    evidenceNeeded: z.string(),
    priority: z.enum(["high", "moderate", "low"]),
  })).max(6),
});

export const reportOutputSchema = z.object({
  ...agentBaseShape,
  executiveSummary: z.string(),
  keyFindings: z.array(z.string()),
  evidenceTable: z.array(
    z.object({
      topic: z.string(),
      finding: z.string(),
      supportingSource: z.string(),
      confidence: z.string(),
    }),
  ),
  risksAndUncertainties: z.array(z.string()),
  recommendedFollowUpQuestions: z.array(z.string()),
  researchDisclaimer: z.string(),
  physicianBriefing: z.string(),
  patientFriendlySummary: z.string(),
  markdownReport: z.string(),
  researchIntelligence: researchIntelligenceSchema,
});
