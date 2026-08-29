import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InteractiveReport,
  primaryAnswerCitationTargets,
  selectStrongestEvidenceItems,
} from "@/components/workspace/report/InteractiveReport";
import { CitationLinks } from "@/components/workspace/report/CitationLinks";
import { makeDemoSession } from "@/lib/demo-data";
import { getSessionCitations } from "@/lib/research/evidence-spans";
import { semanticTopics } from "@/lib/research/evidence-relationships";
import { buildInvestigationData } from "@/lib/research/investigation";

const workspace = vi.hoisted(() => ({
  selectInspector: vi.fn(),
  setMobileInspectorOpen: vi.fn(),
  startAnalysis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/workspace/WorkspaceProvider", () => ({
  useWorkspace: () => workspace,
}));

describe("interactive report", () => {
  beforeEach(() => {
    workspace.selectInspector.mockClear();
    workspace.setMobileInspectorOpen.mockClear();
    workspace.startAnalysis.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => cleanup());

  it("renders one concise local-analysis hierarchy with stable tabs and mobile accordions", () => {
    render(<InteractiveReport session={makeDemoSession()} />);

    expect(screen.getAllByText("Primary answer", { exact: true })).toHaveLength(1);
    expect(screen.getAllByText("Local analysis", { exact: true })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Findings and unresolved evidence" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Findings/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Conflicts/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Open Questions/ })).toBeInTheDocument();
    expect(screen.getByText(/Findings/, { selector: "summary span" })).toBeInTheDocument();
    expect(screen.queryByText("Evidence brief ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Bottom line")).not.toBeInTheDocument();
    expect(screen.queryByText("Aetheris assessment")).not.toBeInTheDocument();
    expect(screen.queryByText(/confidence percentage/i)).not.toBeInTheDocument();
  });

  it("keeps the investigation architecture and supporting-evidence section visible when categories are empty", () => {
    const session = makeDemoSession();
    session.evidence = [];
    session.results = {
      ...session.results!,
      groundedFacts: [],
      citations: undefined,
      reportGeneration: {
        ...session.results!.reportGeneration,
        citations: undefined,
        recommendedFollowUpQuestions: [],
        researchIntelligence: undefined,
      },
    };

    render(<InteractiveReport session={session} />);

    expect(screen.getByRole("tab", { name: /Findings 0/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Conflicts 0/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Open Questions 0/ })).toBeInTheDocument();
    expect(screen.getAllByText("No reviewable findings could be grounded in the uploaded evidence.").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: /Conflicts 0/ }));
    expect(screen.getAllByText("No meaningful conflicts were detected across the uploaded evidence.").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: /Open Questions 0/ }));
    expect(screen.getAllByText("No material unanswered questions were identified from the uploaded evidence.").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "What the strongest passages establish" })).toBeInTheDocument();
    expect(screen.getByText("No individual passage was strong and distinct enough to drive the conclusion on its own.")).toBeInTheDocument();
  });

  it("labels a live session as AI-assisted without repeating the mode", () => {
    const session = { ...makeDemoSession(), mode: "live" as const };
    render(<InteractiveReport session={session} />);
    expect(screen.getAllByText("AI-assisted", { exact: true })).toHaveLength(1);
  });

  it("copies the same concise report hierarchy", async () => {
    render(<InteractiveReport session={makeDemoSession()} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledOnce());
    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    expect(copied).toContain("## Primary Answer");
    expect(copied).toContain("## Findings");
    expect(copied).not.toContain("Bottom line");
    expect(copied).not.toMatch(/\b\d+% (?:confidence|support)/i);
  });

  it("shows a clean clipboard error when browser permission blocks copying", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("NotAllowedError"));
    render(<InteractiveReport session={makeDemoSession()} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/clipboard permission/i);
  });

  it("downloads the rendered PDF through the report API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      blob: vi.fn().mockResolvedValue({ type: "application/pdf" } as Blob),
    } as unknown as Response);
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:aetheris-report");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<InteractiveReport session={makeDemoSession()} />);

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/reports/pdf", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(anchorClick).toHaveBeenCalledOnce());
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:aetheris-report");

    fetchMock.mockRestore();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    anchorClick.mockRestore();
  });

  it("explains model fallback without exposing provider errors and allows retry", async () => {
    const session = makeDemoSession();
    session.events.push({
      id: "event:model-fallback",
      version: 1,
      sessionId: session.id,
      sequence: Math.max(0, ...session.events.map((event) => event.sequence)) + 1,
      timestamp: new Date().toISOString(),
      type: "analysis.mode",
      phase: "analyzing",
      message: "Aetheris switched to local fallback mode",
      data: {
        mode: "demo",
        reason: "429 RESOURCE_EXHAUSTED: provider quota exceeded with internal request details",
      },
    });

    render(<InteractiveReport session={session} />);

    expect(screen.getByLabelText("Model analysis status")).toHaveTextContent(/completed with local source-grounded processing/i);
    expect(screen.queryByText(/RESOURCE_EXHAUSTED|internal request details/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry model analysis" }));
    await waitFor(() => expect(workspace.startAnalysis).toHaveBeenCalledWith(session, { retry: true }));
  });

  it("opens the existing source inspector from a human-readable citation", () => {
    const session = makeDemoSession();
    render(<InteractiveReport session={session} />);
    const citationButton = screen.getAllByRole("button", { name: /Open \d+ evidence excerpt.* from .+, page \d+/ })[0];
    fireEvent.click(citationButton);

    expect(workspace.selectInspector).toHaveBeenCalledWith(expect.objectContaining({
      tab: "source",
      sessionId: session.id,
      evidenceId: expect.any(String),
      citationIds: expect.any(Array),
      claimText: expect.any(String),
    }));
    const selection = workspace.selectInspector.mock.calls[0][0];
    expect(session.evidence.some((item) => item.id === selection.evidenceId)).toBe(true);
    expect(workspace.setMobileInspectorOpen).toHaveBeenCalledWith(true);
  });

  it("maps each primary-answer source to the specific finding it supports", () => {
    const session = makeDemoSession();
    const investigation = buildInvestigationData(session);
    const targets = primaryAnswerCitationTargets(investigation);

    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((target) =>
      investigation.findings.some((finding) => finding.statement === target.claim),
    )).toBe(true);
    expect(targets.every((target) => target.claim !== investigation.directAnswer)).toBe(true);
    expect(targets.every((target) => {
      const answerTopics = new Set(semanticTopics(investigation.directAnswer));
      const claimTopics = semanticTopics(target.claim);
      return claimTopics.filter((topic) => answerTopics.has(topic)).length >= 2;
    })).toBe(true);
  });

  it("groups distinct excerpts from the same source page into one citation control", () => {
    const session = makeDemoSession();
    const citation = getSessionCitations(session)[0];
    const second = {
      ...citation,
      id: `${citation.id}:second`,
      exactQuote: "A second distinct exact quote.",
      excerpt: "A second distinct exact quote.",
      startOffset: (citation.startOffset ?? 0) + 100,
      endOffset: (citation.endOffset ?? 0) + 130,
    };
    const unrelated = {
      ...citation,
      id: `${citation.id}:unrelated`,
      exactQuote: "An unrelated QTc observation.",
      excerpt: "An unrelated QTc observation.",
      startOffset: (citation.startOffset ?? 0) + 200,
      endOffset: (citation.endOffset ?? 0) + 235,
    };
    const relationships = [citation, second].map((item, index) => ({
      id: `relationship:${index}`,
      evidenceId: item.evidenceId,
      citationId: item.id,
      supportedItemId: "question:ferritin",
      relationshipType: "provides_context" as const,
      relevanceExplanation: "Documents ferritin response.",
      exactQuote: item.exactQuote ?? item.excerpt,
      documentId: item.documentId,
      documentName: item.documentName,
      page: item.page,
      confidence: "high" as const,
    }));

    render(
      <CitationLinks
        citationIds={[citation.id, second.id, unrelated.id]}
        citations={[citation, second, unrelated]}
        session={session}
        claim="A reviewed finding."
        relationships={relationships}
      />,
    );

    const button = screen.getByRole("button", { name: /Open 2 evidence excerpts/ });
    expect(screen.getByText(/2 relevant excerpts/)).toBeInTheDocument();
    fireEvent.click(button);
    expect(workspace.selectInspector).toHaveBeenCalledWith(expect.objectContaining({
      citationIds: [citation.id, second.id],
    }));
  });

  it("keeps finding content flexible and moves citations beneath it before desktop layout", () => {
    render(<InteractiveReport session={makeDemoSession()} />);

    const row = screen.getAllByTestId("finding-row")[0];
    const content = screen.getAllByTestId("finding-content")[0];
    const actions = screen.getAllByTestId("finding-citations")[0];
    expect(row).toHaveClass("lg:grid-cols-[2rem_minmax(20rem,1fr)_minmax(10rem,18rem)]");
    expect(content).toHaveClass("min-w-0");
    expect(actions).toHaveClass("col-start-2", "lg:col-start-3", "min-w-0");
  });

  it("selects diverse evidence for efficacy, safety, and limitations", () => {
    const session = makeDemoSession();
    const citations = getSessionCitations(session);
    expect(citations.length).toBeGreaterThanOrEqual(4);
    const investigation = buildInvestigationData(session);
    const base = investigation.findings[0];
    const findings = [
      { ...base, id: "efficacy", statement: "Hemoglobin improved during follow-up.", dimension: "efficacy" as const, theme: "Efficacy" as const, citationIds: [citations[0].id], relationships: [supportRelationship(citations[0], "efficacy")] },
      { ...base, id: "safety-qt-1", statement: "QTc remained a safety concern.", dimension: "safety" as const, theme: "Safety" as const, citationIds: [citations[1].id], relationships: [supportRelationship(citations[1], "safety-qt-1")] },
      { ...base, id: "safety-qt-2", statement: "QT prolongation required review.", dimension: "safety" as const, theme: "Safety" as const, citationIds: [citations[2].id], relationships: [supportRelationship(citations[2], "safety-qt-2")] },
      { ...base, id: "limitation", statement: "Ferritin remained low during follow-up.", dimension: "limitation" as const, theme: "Study limitations" as const, citationIds: [citations[3].id], relationships: [supportRelationship(citations[3], "limitation")] },
    ];

    const selected = selectStrongestEvidenceItems(
      { ...investigation, findings },
      citations,
      "Assess efficacy, safety, and limitations.",
    );
    expect(selected.map((item) => item.dimension)).toEqual(["efficacy", "safety", "limitation"]);
    expect(selected.filter((item) => /\bqtc?\b|qt prolong/i.test(item.supports))).toHaveLength(1);
  });

  it("prefers a decision-relevant follow-up passage over a bare baseline value", () => {
    const session = makeDemoSession();
    const investigation = buildInvestigationData(session);
    const source = getSessionCitations(session)[0];
    const baseline = {
      ...source,
      id: "citation:baseline-ferritin",
      exactQuote: "Baseline ferritin: 6 ng/mL.",
      excerpt: "Baseline ferritin: 6 ng/mL.",
      startOffset: 0,
      endOffset: 27,
    };
    const followUp = {
      ...source,
      id: "citation:follow-up-ferritin",
      exactQuote: "Follow-up ferritin was 14 ng/mL after four weeks and remained below the reference range.",
      excerpt: "Follow-up ferritin was 14 ng/mL after four weeks and remained below the reference range.",
      startOffset: 100,
      endOffset: 188,
    };
    const finding = {
      ...investigation.findings[0],
      id: "finding:iron-stores",
      statement: "Iron stores improved but remained depleted after treatment.",
      dimension: "limitation" as const,
      citationIds: [baseline.id, followUp.id],
      relationships: [
        supportRelationship(baseline, "finding:iron-stores"),
        supportRelationship(followUp, "finding:iron-stores"),
      ],
    };

    const selected = selectStrongestEvidenceItems(
      { ...investigation, findings: [finding] },
      [baseline, followUp],
      "Assess the limitations of the documented treatment response.",
    );

    expect(selected[0]?.citation.id).toBe(followUp.id);
  });

  it("renders strongest evidence with readable text contrast and size", () => {
    const { container } = render(<InteractiveReport session={makeDemoSession()} />);
    const section = container.querySelector("#strongest-evidence-title")?.closest("section");
    const quote = section?.querySelector("blockquote");
    const support = section?.querySelector("blockquote + p");
    expect(quote).toHaveClass("text-sm", "text-slate-300");
    expect(support).toHaveClass("text-xs", "text-slate-500");
  });
});

function supportRelationship(citation: ReturnType<typeof getSessionCitations>[number], supportedItemId: string) {
  return {
    id: `relationship:${supportedItemId}:${citation.id}`,
    evidenceId: citation.evidenceId,
    citationId: citation.id,
    supportedItemId,
    relationshipType: "supports" as const,
    relevanceExplanation: "Supports the selected test finding.",
    exactQuote: citation.exactQuote ?? citation.excerpt,
    documentId: citation.documentId,
    documentName: citation.documentName,
    page: citation.page,
    confidence: "high" as const,
  };
}
