import { describe, expect, it } from "vitest";

import { makeDemoDocuments } from "@/lib/demo-data";
import { createEventFactory } from "@/lib/research/events";
import {
  applyResearchEvent,
  createResearchSession,
  normalizeResearchSession,
} from "@/lib/research/session";
import {
  deleteLocalSession,
  findLocalSession,
  loadLocalSessions,
  saveLocalSession,
} from "@/lib/session-store";
import { AGENT_IDS } from "@/lib/types";

describe("research session state", () => {
  it("applies valid stage transitions and ignores duplicate or stale events", () => {
    const session = createResearchSession({
      id: "session-state",
      question: "Review source safety evidence",
      selectedAgents: [...AGENT_IDS],
      documents: makeDemoDocuments(),
      mode: "demo",
    });
    const createEvent = createEventFactory(session.id);
    const started = createEvent({
      type: "stage.started",
      phase: "processing",
      stageId: "chunking",
      message: "Chunking started",
      data: { progress: 12 },
    });
    const completed = createEvent({
      type: "stage.completed",
      phase: "processing",
      stageId: "chunking",
      message: "Chunking completed",
      data: { progress: 100, metrics: { chunkCount: 18 } },
    });

    const running = applyResearchEvent(session, started);
    const finished = applyResearchEvent(running, completed);
    const duplicate = applyResearchEvent(finished, completed);
    const stale = applyResearchEvent(finished, {
      ...started,
      id: "session-state:stale",
      message: "Late duplicate start",
    });

    expect(running.pipeline.find((stage) => stage.id === "chunking")?.status).toBe("running");
    expect(finished.pipeline.find((stage) => stage.id === "chunking")).toMatchObject({
      status: "completed",
      progress: 100,
    });
    expect(finished.metrics.chunkCount).toBe(18);
    expect(duplicate).toBe(finished);
    expect(stale).toBe(finished);
  });

  it("preserves active server-owned sessions during hydration", () => {
    const legacy = normalizeResearchSession({
      id: "legacy-session",
      question: "Legacy objective",
      createdAt: "2026-01-01T00:00:00.000Z",
      status: "processing",
      mode: "authenticated",
      documents: [
        {
          id: "legacy-document",
          name: "legacy.pdf",
          size: 120,
          pageCount: 1,
          uploadedAt: "2026-01-01T00:00:00.000Z",
          preview: "Preserved source text",
          text: "Preserved source text",
        },
      ],
      selectedAgents: [...AGENT_IDS],
    });

    expect(legacy).not.toBeNull();
    expect(legacy?.status).toBe("processing");
    expect(legacy?.error).toBeNull();
    expect(legacy?.documents[0].pages[0]).toMatchObject({
      number: 1,
      text: "Preserved source text",
    });
    expect(legacy?.metrics.chunkCount).toBe(0);
    expect(legacy?.metrics.retrievalMethod).toBeNull();
  });

  it("recovers legacy client-monitoring errors without restarting the pipeline", () => {
    const interrupted = normalizeResearchSession({
      id: "monitoring-interruption",
      question: "Recover the server-owned analysis",
      createdAt: "2026-01-01T00:00:00.000Z",
      status: "error",
      mode: "live",
      documents: makeDemoDocuments(),
      selectedAgents: [...AGENT_IDS],
      error: {
        code: "RESEARCH_STREAM_FAILED",
        title: "Research monitoring interrupted",
        message: "The browser stopped monitoring the job.",
        retryable: true,
      },
    });

    expect(interrupted?.status).toBe("processing");
    expect(interrupted?.error).toBeNull();
    expect(interrupted?.documents).toHaveLength(makeDemoDocuments().length);
  });

  it("deletes a saved analysis without affecting other sessions", async () => {
    const removed = createResearchSession({
      id: "remove-this-session",
      question: "Delete this completed analysis record",
      selectedAgents: [...AGENT_IDS],
      documents: makeDemoDocuments(),
      mode: "demo",
    });
    const preserved = createResearchSession({
      id: "preserve-this-session",
      question: "Preserve this separate analysis record",
      selectedAgents: [...AGENT_IDS],
      documents: makeDemoDocuments(),
      mode: "demo",
    });
    await saveLocalSession(removed);
    await saveLocalSession(preserved);

    await deleteLocalSession(removed.id);

    expect(await findLocalSession(removed.id)).toBeNull();
    expect(await findLocalSession(preserved.id)).toMatchObject({ id: preserved.id });
  });

  it("continues loading sessions when localStorage is unavailable", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: undefined,
    });

    try {
      await expect(loadLocalSessions()).resolves.toEqual(expect.any(Array));
    } finally {
      if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
    }
  });
});
