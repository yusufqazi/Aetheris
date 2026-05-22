import { nanoid } from "nanoid";

import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import type { AnalysisBundle, ResearchSession } from "@/lib/types";

function makeResults(): AnalysisBundle {
  return {
    literatureSearch: {
      agentName: "Literature Search Agent",
      summary: "Retrieved the most relevant passages discussing safety language, endpoints, and patient subgroup notes.",
      confidence: "medium",
      limitations: ["Demo content is illustrative and not derived from real uploaded files."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: [
        {
          excerpt: "Treatment-emergent nausea and dizziness were noted more frequently in the combination arm.",
          documentName: "Phase-II-oncology-study.pdf",
          page: 7,
          section: "Safety",
          relevance: "Directly addresses adverse events for cross-study comparison.",
        },
      ],
      topRelevantExcerpts: [
        {
          excerpt: "Treatment-emergent nausea and dizziness were noted more frequently in the combination arm.",
          documentName: "Phase-II-oncology-study.pdf",
          page: 7,
          section: "Safety",
          relevanceExplanation: "Closest match to the safety-focused research prompt.",
        },
      ],
    },
    drugInteraction: {
      agentName: "Drug Interaction Agent",
      summary: "The uploaded evidence suggests interaction language is discussed cautiously rather than as a confirmed clinical effect.",
      confidence: "medium",
      limitations: ["No mechanistic PK tables were available in the demo dataset."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: [],
      findings: [
        {
          possibleInteraction: "Potential CYP3A4-mediated exposure increase when used alongside strong inhibitors.",
          severityEstimate: "moderate",
          uncertaintyLevel: "medium",
          notes: "Language is framed as a possible risk requiring monitoring, not a confirmed contraindication.",
          evidence: "Labeling excerpt references exposure increase with co-administered inhibitors.",
        },
      ],
    },
    adverseReaction: {
      agentName: "Adverse Reaction Agent",
      summary: "Common safety signals center on GI symptoms and fatigue, with contraindication wording reserved for narrow populations.",
      confidence: "medium",
      limitations: ["Frequency reporting in the demo dataset is partial."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: [],
      findings: [
        {
          adverseEvent: "Nausea",
          frequency: "Common",
          affectedPopulation: "Combination-treatment cohort",
          sourceEvidence: "Observed in the safety results section.",
          confidenceLevel: "medium",
        },
      ],
    },
    trialSummarizer: {
      agentName: "Clinical Trial Summarizer Agent",
      summary: "The primary study appears to be a mid-stage randomized trial focused on response and tolerability in a pretreated population.",
      confidence: "medium",
      limitations: ["Demo mode does not reproduce exact study tables."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: [],
      findings: [
        {
          studyObjective: "Evaluate efficacy and safety of the combination regimen in previously treated adults.",
          methods: "Randomized parallel-group trial with scheduled safety follow-up.",
          keyFindings: "Signals of improved response came with a higher adverse event burden.",
          limitations: "Short follow-up and limited subgroup detail.",
          relevance: "Useful for briefing clinicians on benefit-risk framing.",
        },
      ],
    },
    debateConsensus: {
      agentName: "Debate / Consensus Agent",
      summary: "Agents align on the presence of meaningful safety language but disagree on how strongly the documents support severe interaction risk.",
      confidence: "medium",
      limitations: ["Consensus is based on demo content and should be treated as illustrative."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: [],
      agreements: [
        "Safety findings are prominent across the source set.",
        "Evidence supports a cautious rather than definitive interpretation of interaction risk.",
      ],
      disagreements: [
        "Interaction severity could not be elevated above moderate without more PK or post-market evidence.",
      ],
      missingEvidence: [
        "Exposure-response tables",
        "Post-marketing pharmacovigilance context",
      ],
      finalConsensus:
        "The document set supports a research hypothesis of moderate safety and interaction concerns, but it does not justify firm clinical action without further review.",
    },
    reportGeneration: {
      agentName: "Report Generation Agent",
      summary: "Generated an executive-ready synthesis with evidence framing and next-step questions.",
      confidence: "medium",
      limitations: ["Demo report is illustrative."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: [],
      executiveSummary:
        "Aetheris identified recurring safety considerations related to GI adverse events, fatigue, and a possible exposure interaction pathway. The documents are more supportive of cautious monitoring language than strong contraindication claims.",
      keyFindings: [
        "Safety findings recur across trial and labeling language.",
        "Potential interaction risk is discussed but remains uncertain.",
        "A structured physician briefing can emphasize benefit-risk tradeoffs and evidence gaps.",
      ],
      evidenceTable: [
        {
          topic: "Safety",
          finding: "Nausea and dizziness occurred more often in the combination arm.",
          supportingSource: "Phase-II-oncology-study.pdf p.7",
          confidence: "medium",
        },
      ],
      risksAndUncertainties: [
        "Interaction severity is not definitively established in the source set.",
        "Frequency reporting is incomplete in the demo content.",
      ],
      recommendedFollowUpQuestions: [
        "Are there PK or exposure-response appendices available?",
        "Do subgroup analyses change the perceived benefit-risk balance?",
      ],
      researchDisclaimer: RESEARCH_DISCLAIMER,
      physicianBriefing:
        "Research summary for clinicians: consider the combination as a candidate for closer medication review given the documented safety burden and possible exposure interactions.",
      patientFriendlySummary:
        "The uploaded studies suggest the medicines may have side effects like nausea and fatigue, and researchers may want to look more closely at how the medicines behave together.",
      markdownReport: `# Aetheris Research Brief\n\n## Executive Summary\nAetheris identified recurring safety considerations related to GI adverse events, fatigue, and a possible exposure interaction pathway.\n\n## Disclaimer\n${RESEARCH_DISCLAIMER}`,
    },
  };
}

export function makeDemoSession(): ResearchSession {
  const createdAt = new Date().toISOString();

  return {
    id: nanoid(),
    question: "Compare adverse event profiles across these studies.",
    createdAt,
    updatedAt: createdAt,
    mode: "demo",
    status: "completed",
    selectedAgents: [
      "literature-search",
      "drug-interaction",
      "adverse-reaction",
      "trial-summarizer",
      "debate-consensus",
      "report-generation",
    ],
    documents: [
      {
        id: nanoid(),
        name: "Phase-II-oncology-study.pdf",
        size: 820_000,
        pageCount: 14,
        uploadedAt: createdAt,
        preview: "Treatment-emergent nausea and dizziness were noted more frequently in the combination arm.",
        text: "Demo content for Aetheris.",
      },
    ],
    results: makeResults(),
  };
}
