import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewResearchClient } from "@/components/NewResearchClient";
import { ResultsClient } from "@/components/ResultsClient";
import { makeDemoSession } from "@/lib/demo-data";

const workspace = vi.hoisted(() => ({
  sessions: [] as ReturnType<typeof makeDemoSession>[],
  hydrated: true,
  setActiveSessionId: vi.fn(),
  startAnalysis: vi.fn(),
}));

vi.mock("@/components/workspace/WorkspaceProvider", () => ({
  useWorkspace: () => workspace,
}));

vi.mock("@/components/FileUploader", () => ({
  FileUploader: () => <div>Prepared source uploader</div>,
}));

describe("results flow hardening", () => {
  beforeEach(() => {
    workspace.sessions = [];
    workspace.setActiveSessionId.mockClear();
    workspace.startAnalysis.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        mode: "live",
        label: "Gemini analysis ready",
        description: "Model-assisted analysis is configured.",
      }),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("accepts only one analysis start while the first submission is pending", async () => {
    let releaseAnalysis: (() => void) | undefined;
    workspace.startAnalysis.mockImplementation(() => new Promise<void>((resolve) => {
      releaseAnalysis = resolve;
    }));
    render(<NewResearchClient />);

    fireEvent.click(screen.getByRole("button", { name: /Try Aetheris with example clinical documents/ }));
    const runButton = await screen.findByRole("button", { name: /Run six-agent analysis/ });
    fireEvent.click(runButton);
    fireEvent.click(runButton);

    expect(workspace.startAnalysis).toHaveBeenCalledOnce();
    expect(runButton).toBeDisabled();
    expect(runButton).toHaveAttribute("aria-busy", "true");

    releaseAnalysis?.();
    await waitFor(() => expect(runButton).not.toBeDisabled());
  });

  it("shows the active pipeline detail and elapsed progress while analysis runs", () => {
    const session = makeDemoSession();
    session.status = "processing";
    session.pipeline = session.pipeline.map((stage) => ({
      ...stage,
      status: stage.id === "retrieval" ? "running" : stage.id === "uploading" ? "completed" : "pending",
      progress: stage.id === "retrieval" ? 42 : stage.id === "uploading" ? 100 : 0,
      detail: stage.id === "retrieval" ? "Ranking passages against the research question" : stage.detail,
      startedAt: stage.id === "retrieval" ? new Date().toISOString() : stage.startedAt,
    }));
    workspace.sessions = [session];

    render(<ResultsClient sessionId={session.id} />);

    expect(screen.getByRole("heading", { name: /Turning source documents into a verifiable brief/ })).toBeInTheDocument();
    expect(screen.getByText("Ranking passages against the research question")).toBeInTheDocument();
    expect(screen.getByText(/elapsed/i)).toBeInTheDocument();
  });

  it("starts elapsed analysis time from the current pipeline run", () => {
    const now = new Date();
    const session = makeDemoSession();
    session.status = "processing";
    session.pipeline = session.pipeline.map((stage) => ({
      ...stage,
      status: stage.id === "chunking" ? "running" : stage.status,
      startedAt: stage.id === "uploading"
        ? new Date(now.getTime() - 120_000).toISOString()
        : stage.id === "chunking"
          ? now.toISOString()
          : stage.startedAt,
    }));
    workspace.sessions = [session];

    render(<ResultsClient sessionId={session.id} />);

    expect(screen.getByText("0s elapsed")).toBeInTheDocument();
    expect(screen.queryByText(/2m .* elapsed/)).not.toBeInTheDocument();
  });
});
