import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceInspector } from "@/components/workspace/WorkspaceInspector";
import { makeDemoSession } from "@/lib/demo-data";
import { getSessionCitations } from "@/lib/research/evidence-spans";

const workspace = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock("@/components/workspace/WorkspaceProvider", () => ({
  useWorkspace: () => workspace.current,
}));

afterEach(() => cleanup());

describe("workspace evidence inspector", () => {
  it("shows only the exact selected quote by default and keeps broader context collapsed", () => {
    const session = makeDemoSession();
    const citation = getSessionCitations(session).find((item) => typeof item.startOffset === "number");
    expect(citation).toBeDefined();
    workspace.current = {
      sessions: [session],
      activeSession: session,
      inspector: {
        tab: "source",
        sessionId: session.id,
        evidenceId: citation!.evidenceId,
        citationIds: [citation!.id],
        claimText: "A reviewed analytical conclusion.",
      },
      setMobileInspectorOpen: vi.fn(),
    };

    render(<WorkspaceInspector />);

    const exactEvidence = screen.getAllByText(citation!.exactQuote!, { selector: "mark" })[0];
    expect(exactEvidence).toBeInTheDocument();
    expect(exactEvidence.textContent).not.toContain("This randomized phase II study");
    expect(screen.getByText("A reviewed analytical conclusion.")).toBeInTheDocument();
    expect(screen.getByText("Mapped evidence")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Relevant evidence" })).toBeInTheDocument();
    expect(screen.getByText("Supports")).toBeInTheDocument();
    expect(screen.getByText("Mapped to")).toBeInTheDocument();
    expect(screen.getByText("Show more context")).toBeInTheDocument();
    expect(screen.getByText("View full page text")).toBeInTheDocument();
    expect(screen.getByText("Show more context").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("View full page text").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText(/source observation that directly|materially change the evidence-based conclusion/i)).not.toBeInTheDocument();
  });
});
