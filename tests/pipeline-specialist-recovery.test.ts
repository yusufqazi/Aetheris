import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({
  getLlmConfiguration: () => ({
    enabled: true,
    provider: "google",
    providerLabel: "Google Gemini",
    model: "test-model",
    embeddingModel: null,
  }),
}));

const specialistBase = {
  confidence: "medium" as const,
  limitations: [],
  warnings: [],
  evidence: [],
};

vi.mock("@/lib/agents/literatureSearchAgent", () => ({
  runLiteratureSearchAgent: vi.fn(async () => ({
    ...specialistBase,
    agentName: "Literature Retrieval Agent",
    summary: "The directly relevant evidence was retrieved.",
    topRelevantExcerpts: [],
  })),
}));

vi.mock("@/lib/agents/drugInteractionAgent", () => ({
  runDrugInteractionAgent: vi.fn(async () => {
    throw new Error("Google Gemini could not validate the specialist response.");
  }),
}));

vi.mock("@/lib/agents/adverseReactionAgent", () => ({
  runAdverseReactionAgent: vi.fn(async () => ({
    ...specialistBase,
    agentName: "Adverse Reaction Agent",
    summary: "No additional safety limitation was established.",
    findings: [],
  })),
}));

vi.mock("@/lib/agents/trialSummarizerAgent", () => ({
  runTrialSummarizerAgent: vi.fn(async () => ({
    ...specialistBase,
    agentName: "Clinical Trial Summarizer",
    summary: "The available records define the relevant clinical context.",
    findings: [],
  })),
}));

vi.mock("@/lib/agents/debateAgent", () => ({
  runDebateAgent: vi.fn(async ({ drug }: { drug?: { summary?: string } }) => {
    if (!drug?.summary) {
      throw new Error("Consensus received an incomplete specialist input set.");
    }
    return {
      ...specialistBase,
      agentName: "Debate / Consensus Agent",
      summary: "Consensus completed with one unavailable specialist clearly bounded.",
      agreements: ["The available specialists support the retrieved evidence."],
      disagreements: [],
      missingEvidence: [drug.summary],
      finalConsensus: "The available evidence supports a cautious, source-grounded conclusion.",
    };
  }),
}));

vi.mock("@/lib/agents/reportAgent", () => ({
  runReportAgent: vi.fn(async ({ debate, evidence }: {
    debate: { finalConsensus: string; missingEvidence: string[] };
    evidence: unknown[];
  }) => ({
    ...specialistBase,
    agentName: "Report Generation Agent",
    summary: debate.finalConsensus,
    evidence: evidence.slice(0, 4),
    executiveSummary: debate.finalConsensus,
    keyFindings: [debate.finalConsensus],
    evidenceTable: [],
    risksAndUncertainties: debate.missingEvidence,
    recommendedFollowUpQuestions: [],
    researchDisclaimer: "For research support only.",
    physicianBriefing: debate.finalConsensus,
    patientFriendlySummary: debate.finalConsensus,
    markdownReport: `# Research briefing\n\n${debate.finalConsensus}`,
  })),
}));

import { makeDemoDocuments } from "@/lib/demo-data";
import { runDebateAgent } from "@/lib/agents/debateAgent";
import { runReportAgent } from "@/lib/agents/reportAgent";
import type { ResearchEventInput } from "@/lib/research/events";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { createResearchSession } from "@/lib/research/session";
import { AGENT_IDS } from "@/lib/types";

describe("specialist failure recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues consensus and report assembly when one live specialist fails", async () => {
    const session = createResearchSession({
      id: "live-specialist-recovery",
      question: "What does the evidence establish and what remains uncertain?",
      selectedAgents: [...AGENT_IDS],
      documents: makeDemoDocuments(),
      mode: "live",
    });
    const events: ResearchEventInput[] = [];

    const result = await runResearchPipeline({
      session,
      emit: (event) => {
        events.push(event);
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: "agent.failed",
      agentId: "drug-interaction",
      data: expect.objectContaining({
        output: expect.objectContaining({
          confidence: "low",
          summary: expect.stringContaining("could not validate"),
        }),
      }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "agent.completed",
      agentId: "debate-consensus",
    }));
    expect(events.at(-1)?.type).toBe("session.completed");
    expect(result.results.drugInteraction.confidence).toBe("low");
    expect(result.results.debateConsensus.finalConsensus).toMatch(/source-grounded conclusion/i);
  });

  it("recovers from a live consensus timeout and completes the report without another provider call", async () => {
    vi.mocked(runDebateAgent).mockRejectedValueOnce(
      new Error(
        "Google Gemini could not complete debate_consensus_output generation. The AI provider did not respond before the request timeout.",
      ),
    );
    const session = createResearchSession({
      id: "live-consensus-recovery",
      question: "What does the evidence establish and what remains uncertain?",
      selectedAgents: [...AGENT_IDS],
      documents: makeDemoDocuments(),
      mode: "live",
    });
    const events: ResearchEventInput[] = [];

    const result = await runResearchPipeline({
      session,
      emit: (event) => {
        events.push(event);
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: "stage.progress",
      stageId: "debate-consensus",
      message: "Consensus recovered from the completed specialist review",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "agent.completed",
      agentId: "debate-consensus",
      message: "Consensus completed from preserved specialist evidence",
    }));
    expect(events.at(-1)?.type).toBe("session.completed");
    expect(result.results.debateConsensus.finalConsensus.length).toBeGreaterThan(30);
    expect(result.results.reportGeneration.executiveSummary.length).toBeGreaterThan(30);
    expect(result.mode).toBe("live");

    const reportPayload = vi.mocked(runReportAgent).mock.calls[0]?.[0];
    expect(reportPayload?.shouldUseProvider?.()).toBe(false);
  });
});
