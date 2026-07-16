import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResearchIntelligence } from "@/components/workspace/report/ResearchIntelligence";
import { makeDemoSession } from "@/lib/demo-data";
import type { Citation, ResearchIntelligence as ResearchIntelligenceData } from "@/lib/types";

vi.mock("@/components/workspace/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    selectInspector: vi.fn(),
    setMobileInspectorOpen: vi.fn(),
  }),
}));

describe("research intelligence report", () => {
  it("presents the answer, evidence trajectory, pathways, contradictions, and unknowns in one surface", () => {
    const session = makeDemoSession();
    const citation: Citation = {
      id: "citation:evidence:one",
      evidenceId: "evidence:one",
      chunkId: "chunk:one",
      documentId: session.documents[0].id,
      documentName: session.documents[0].name,
      page: 1,
      excerpt: "A source-linked observation.",
      label: "[1]",
    };

    render(<ResearchIntelligence intelligence={intelligence} citations={[citation]} session={session} />);

    expect(screen.getByText("Research intelligence")).toBeInTheDocument();
    expect(screen.getByText(intelligence.directAnswer)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How the evidence changes across the record" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What appears connected, and why it matters" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where the sources differ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What could change the answer" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /\[1\] p\.1/i }).length).toBeGreaterThan(0);
  });
});

const intelligence: ResearchIntelligenceData = {
  answerStatus: "direct",
  directAnswer: "The uploaded records support a time-linked safety signal, but they do not establish a single cause.",
  strongestSupportedConclusion: "The measured signal improved after the documented intervention.",
  strongestCounterpoint: "A second intervention occurred during the same period.",
  evidenceTrajectory: [{
    sequence: 1,
    label: "Follow-up",
    finding: "The measured signal improved.",
    interpretation: "The sequence supports reversibility, not exclusive causality.",
    evidenceIds: ["evidence:one"],
  }],
  interactionPathways: [{
    title: "Exposure and measured signal",
    priority: "high",
    finding: "The exposure and signal overlap in time.",
    observedSignal: "A measurable change occurred.",
    whyItMatters: "The sequence may influence attribution.",
    uncertainty: "Concurrent intervention limits causal separation.",
    evidenceIds: ["evidence:one"],
  }],
  contradictions: [{
    issue: "Attribution differs across records",
    sourcePositions: ["One record associates the signal with exposure.", "Another notes a concurrent factor."],
    reconciliation: "Both factors overlap in the available timeline.",
    impact: "A single cause cannot be assigned from these documents.",
    evidenceIds: ["evidence:one"],
  }],
  decisionChangingUnknowns: [{
    unknown: "Exact intervention timing",
    whyItMatters: "It would distinguish competing explanations.",
    evidenceNeeded: "Timestamped administration and measurement records.",
    priority: "high",
  }],
};
