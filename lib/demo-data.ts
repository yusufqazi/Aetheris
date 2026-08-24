import { nanoid } from "nanoid";

import { chunkDocument } from "@/lib/pdf.shared";
import { chunksToEvidence } from "@/lib/embeddings";
import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import { assembleResearchArtifacts } from "@/lib/research/artifacts";
import { normalizeEvidenceItems } from "@/lib/research/evidence-normalization";
import { extractGroundedFactsFromNormalizedEvidence } from "@/lib/research/normalized-grounding";
import { createAgentExecutions, createResearchSession } from "@/lib/research/session";
import { AGENT_IDS, type AnalysisBundle, type ResearchEvent, type ResearchSession } from "@/lib/types";

export function makeDemoDocuments() {
  const uploadedAt = new Date().toISOString();
  return [
    createDemoDocument(
      "Phase-II-oncology-study.pdf",
      uploadedAt,
      [
        "This randomized phase II study evaluated combination therapy in previously treated adults with advanced solid tumors. The primary endpoint was objective response at 24 weeks. The combination arm showed a stronger response signal, although the study population was narrow and median follow-up was limited.",
        "Treatment-emergent nausea, dizziness, and fatigue occurred more frequently in the combination arm. Grade 3 or higher events were uncommon, but discontinuation due to tolerability was observed. Subgroup estimates were imprecise because of limited sample size.",
      ],
    ),
    createDemoDocument(
      "Safety-label.pdf",
      uploadedAt,
      [
        "Safety labeling advises monitoring when the therapy is co-administered with strong CYP3A4 inhibitors. Exposure may increase, but the available language does not establish the clinical severity of the interaction. Dose adjustment should be reviewed against the complete prescribing information.",
        "Common adverse reactions include nausea, fatigue, dizziness, and rash. Contraindication language is limited to patients with documented hypersensitivity. Post-marketing frequency and long-term safety context remain incomplete in the provided source.",
      ],
    ),
    createDemoDocument(
      "Exposure-appendix.pdf",
      uploadedAt,
      [
        "Exploratory exposure analyses suggest higher systemic exposure with concomitant inhibitor use. Confidence intervals overlap because the evaluated subgroup was small. The appendix supports a monitoring hypothesis but not a definitive severity classification.",
      ],
    ),
  ];
}

export function makeDemoSession(): ResearchSession {
  const question = "Compare adverse event profiles and interaction concerns across these studies.";
  const documents = makeDemoDocuments();
  const chunks = documents.flatMap((document) => chunkDocument(document)).map((chunk, index) => ({
    ...chunk,
    score: Math.max(0.52, 0.91 - index * 0.06),
    lexicalScore: Math.max(0.52, 0.91 - index * 0.06),
    matchedTerms: ["safety", "adverse", "exposure"].filter((term) =>
      chunk.text.toLowerCase().includes(term),
    ),
    rank: index + 1,
    retrievalMethod: "lexical" as const,
  }));
  const evidence = chunksToEvidence(chunks, "Ranked within the explicit Aetheris demo source set");
  const normalizedEvidence = normalizeEvidenceItems(evidence);
  const bundle = {
    ...makeResults(evidence),
    groundedFacts: extractGroundedFactsFromNormalizedEvidence(
      normalizedEvidence,
      evidence,
      question,
    ),
  };
  const artifacts = assembleResearchArtifacts(bundle, evidence, documents);
  const session = createResearchSession({
    id: nanoid(),
    question,
    selectedAgents: [...AGENT_IDS],
    documents,
    mode: "demo",
  });
  const now = new Date().toISOString();
  const executions = createAgentExecutions([...AGENT_IDS]);
  const outputs = {
    "literature-search": artifacts.bundle.literatureSearch,
    "drug-interaction": artifacts.bundle.drugInteraction,
    "adverse-reaction": artifacts.bundle.adverseReaction,
    "trial-summarizer": artifacts.bundle.trialSummarizer,
    "debate-consensus": artifacts.bundle.debateConsensus,
    "report-generation": artifacts.bundle.reportGeneration,
  } as const;

  for (const agentId of AGENT_IDS) {
    const output = outputs[agentId];
    executions[agentId] = {
      ...executions[agentId],
      status: "completed",
      progress: 100,
      currentTask: "Demo analysis complete",
      confidence: output.confidence,
      evidenceCount: output.evidence.length,
      output,
      startedAt: now,
      completedAt: now,
      durationMs: 0,
    };
  }

  return {
    ...session,
    status: "completed",
    updatedAt: now,
    pipeline: session.pipeline.map((stage) => ({
      ...stage,
      status: "completed",
      progress: 100,
      detail: "Completed in the explicit demo source set",
      startedAt: now,
      completedAt: now,
      durationMs: 0,
    })),
    events: createDemoEvents(session.id, documents.length, documents.reduce((sum, item) => sum + item.pageCount, 0), chunks.length),
    agentExecutions: executions,
    evidence,
    reportSections: artifacts.sections,
    metrics: {
      documentCount: documents.length,
      pageCount: documents.reduce((sum, item) => sum + item.pageCount, 0),
      chunkCount: chunks.length,
      retrievedEvidenceCount: evidence.length,
      completedAgentCount: AGENT_IDS.length,
      disagreementCount: artifacts.bundle.debateConsensus.disagreements.length,
      assembledSectionCount: artifacts.sections.length,
      retrievalMethod: "lexical",
      elapsedMs: 0,
    },
    confidence: artifacts.confidence,
    results: artifacts.bundle,
  };
}

function makeResults(evidence: ReturnType<typeof chunksToEvidence>): AnalysisBundle {
  return {
    literatureSearch: {
      agentName: "Literature Retrieval Agent",
      summary: "Retrieved the passages most directly addressing safety, interaction language, and study limitations.",
      confidence: "high",
      limitations: ["The demo source set is intentionally small and illustrative."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: evidence.slice(0, 4),
      topRelevantExcerpts: evidence.slice(0, 4).map((item) => ({
        excerpt: item.excerpt,
        documentName: item.documentName,
        page: item.page,
        section: item.section,
        relevanceExplanation: item.relevance,
      })),
    },
    drugInteraction: {
      agentName: "Drug Interaction Agent",
      summary: "The sources support a possible exposure interaction with strong CYP3A4 inhibitors, but not a definitive severity classification.",
      confidence: "medium",
      limitations: ["The evaluated interaction subgroup is small."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: evidence.filter((item) => item.documentName !== "Phase-II-oncology-study.pdf"),
      findings: [{
        possibleInteraction: "Potential CYP3A4-mediated exposure increase",
        severityEstimate: "moderate",
        uncertaintyLevel: "medium",
        notes: "Labeling and exposure analysis support monitoring language rather than a confirmed contraindication.",
        evidence: "Higher exposure is described with concomitant strong inhibitor use.",
      }],
    },
    adverseReaction: {
      agentName: "Adverse Reaction Agent",
      summary: "Nausea, dizziness, fatigue, and rash recur across the study and safety-label evidence.",
      confidence: "high",
      limitations: ["Long-term and post-marketing frequency data are not represented."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: evidence.slice(0, 4),
      findings: [{
        adverseEvent: "Nausea and dizziness",
        frequency: "More frequent in the combination arm",
        affectedPopulation: "Previously treated adults in the phase II cohort",
        sourceEvidence: "The study and label both identify recurring tolerability signals.",
        confidenceLevel: "high",
      }],
    },
    trialSummarizer: {
      agentName: "Clinical Trial Summarizer",
      summary: "The source describes a randomized mid-stage trial with a response signal and meaningful population and follow-up limitations.",
      confidence: "medium",
      limitations: ["Subgroup estimates are imprecise and follow-up is limited."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: evidence.filter((item) => item.documentName === "Phase-II-oncology-study.pdf"),
      findings: [{
        studyObjective: "Evaluate efficacy and tolerability of combination therapy.",
        methods: "Randomized phase II comparison with a 24-week response endpoint.",
        keyFindings: "A response signal was accompanied by a higher adverse-event burden.",
        limitations: "Narrow population, small subgroups, and limited follow-up.",
        relevance: "Supports benefit-risk framing for the active research question.",
      }],
    },
    debateConsensus: {
      agentName: "Debate / Consensus Agent",
      summary: "Specialists agree on recurring safety signals and preserve uncertainty around interaction severity.",
      confidence: "medium",
      limitations: ["Consensus inherits the scope limits of the uploaded sources."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: evidence.slice(0, 4),
      agreements: [
        "Nausea, dizziness, and fatigue form a recurring safety signal across sources.",
        "The trial population and follow-up limit broad generalization.",
      ],
      disagreements: [
        "The available exposure evidence does not establish whether the interaction should be classified above moderate concern.",
      ],
      missingEvidence: ["Larger pharmacokinetic subgroup analysis", "Long-term post-marketing safety evidence"],
      finalConsensus: "The source set supports cautious monitoring for recurring tolerability and possible exposure concerns, while preserving uncertainty about clinical severity.",
    },
    reportGeneration: {
      agentName: "Report Generation Agent",
      summary: "Assembled a structured briefing with visible evidence, limitations, contradictions, and confidence.",
      confidence: "medium",
      limitations: ["This demo briefing requires review against complete source documents."],
      warnings: [RESEARCH_DISCLAIMER],
      evidence: evidence.slice(0, 4),
      executiveSummary: "Aetheris identified recurring nausea, dizziness, and fatigue across the source set, alongside a possible CYP3A4-mediated exposure concern whose clinical severity remains uncertain.",
      keyFindings: [
        "Safety findings recur across trial and labeling language.",
        "Potential exposure interaction language is present but not definitive.",
        "Population size and follow-up materially limit confidence.",
      ],
      evidenceTable: evidence.slice(0, 3).map((item) => ({
        topic: "Source evidence",
        finding: item.excerpt,
        supportingSource: `${item.documentName} p.${item.page ?? "n/a"}`,
        confidence: "medium",
      })),
      risksAndUncertainties: ["Interaction severity remains uncertain", "Long-term safety context is missing"],
      recommendedFollowUpQuestions: [
        "Would a larger exposure-response analysis change the interaction classification?",
        "Do longer follow-up data alter the observed tolerability profile?",
      ],
      researchDisclaimer: RESEARCH_DISCLAIMER,
      physicianBriefing: "Review the recurring tolerability burden and possible exposure interaction against full prescribing and patient context.",
      patientFriendlySummary: "The documents describe recurring side effects and a possible medicine interaction that needs further professional review.",
      markdownReport: `# Aetheris Research Brief\n\nRecurring safety signals and a possible exposure interaction were identified.\n\n${RESEARCH_DISCLAIMER}`,
    },
  };
}

function createDemoDocument(name: string, uploadedAt: string, pageTexts: string[]) {
  let offset = 0;
  const pages = pageTexts.map((text, index) => {
    const startOffset = offset;
    const endOffset = startOffset + text.length;
    offset = endOffset + 2;
    return { number: index + 1, text, startOffset, endOffset };
  });
  const text = pageTexts.join("\n\n");

  return {
    id: nanoid(),
    name,
    size: text.length,
    pageCount: pages.length,
    uploadedAt,
    preview: text.slice(0, 280),
    text,
    pages,
  };
}

function createDemoEvents(
  sessionId: string,
  documentCount: number,
  pageCount: number,
  chunkCount: number,
): ResearchEvent[] {
  const timestamp = new Date().toISOString();
  const messages = [
    `${documentCount} demo documents prepared`,
    `${pageCount} pages parsed and ${chunkCount} evidence passages created`,
    "Six-agent demo analysis and report assembly completed",
  ];

  return messages.map((message, index) => ({
    version: 1,
    id: `${sessionId}:demo:${index + 1}`,
    sessionId,
    sequence: index + 1,
    timestamp,
    type: "timeline.note",
    phase: index === messages.length - 1 ? "completed" : "processing",
    message,
    data: index === 1 ? { metrics: { pageCount, chunkCount } } : undefined,
  }));
}
