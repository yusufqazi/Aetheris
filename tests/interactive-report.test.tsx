import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InteractiveReport,
  selectStrongestEvidenceItems,
} from "@/components/workspace/report/InteractiveReport";
import { CitationLinks } from "@/components/workspace/report/CitationLinks";
import { makeDemoSession } from "@/lib/demo-data";
import { getSessionCitations } from "@/lib/research/evidence-spans";
import { buildInvestigationData } from "@/lib/research/investigation";

const workspace = vi.hoisted(() => ({
  selectInspector: vi.fn(),
  setMobileInspectorOpen: vi.fn(),
}));

vi.mock("@/components/workspace/WorkspaceProvider", () => ({
  useWorkspace: () => workspace,
}));

describe("interactive report", () => {
  beforeEach(() => {
    workspace.selectInspector.mockClear();
    workspace.setMobileInspectorOpen.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => cleanup());

  it("renders one concise local-analysis hierarchy with conditional tabs and mobile accordions", () => {
    render(<InteractiveReport session={makeDemoSession()} />);

    expect(screen.getAllByText("Primary answer", { exact: true })).toHaveLength(1);
    expect(screen.getAllByText("Local analysis", { exact: true })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Findings and unresolved evidence" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Findings/ })).toBeInTheDocument();
    expect(screen.getByText(/Findings/, { selector: "summary span" })).toBeInTheDocument();
    expect(screen.queryByText("Evidence brief ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Bottom line")).not.toBeInTheDocument();
    expect(screen.queryByText("Aetheris assessment")).not.toBeInTheDocument();
    expect(screen.queryByText(/confidence percentage/i)).not.toBeInTheDocument();
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
      { ...base, id: "efficacy", statement: "Hemoglobin improved during follow-up.", dimension: "efficacy" as const, citationIds: [citations[0].id], relationships: [] },
      { ...base, id: "safety-qt-1", statement: "QTc remained a safety concern.", dimension: "safety" as const, citationIds: [citations[1].id], relationships: [] },
      { ...base, id: "safety-qt-2", statement: "QT prolongation required review.", dimension: "safety" as const, citationIds: [citations[2].id], relationships: [] },
      { ...base, id: "limitation", statement: "Ferritin remained low during follow-up.", dimension: "limitation" as const, citationIds: [citations[3].id], relationships: [] },
    ];

    const selected = selectStrongestEvidenceItems(
      { ...investigation, findings },
      citations,
      "Assess efficacy, safety, and limitations.",
    );
    expect(selected.map((item) => item.dimension)).toEqual(["efficacy", "safety", "limitation"]);
    expect(selected.filter((item) => /\bqtc?\b|qt prolong/i.test(item.supports))).toHaveLength(1);
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
