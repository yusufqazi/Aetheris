import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useWorkspace,
  WorkspaceProvider,
} from "@/components/workspace/WorkspaceProvider";
import { makeDemoDocuments, makeDemoSession } from "@/lib/demo-data";
import { createResearchSession } from "@/lib/research/session";
import { AGENT_IDS, type ResearchSession } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: null, accessToken: null, loading: false }),
}));

vi.mock("@/lib/session-store", () => ({
  loadLocalSessions: vi.fn().mockResolvedValue([]),
  saveLocalSession: vi.fn().mockResolvedValue(undefined),
  deleteLocalSession: vi.fn().mockResolvedValue(undefined),
}));

describe("workspace research monitoring", () => {
  beforeEach(() => vi.useRealTimers());

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("continues polling after a stale idle checkpoint and updates without reload", async () => {
    const session = createResearchSession({
      id: "polling-race-session",
      question: "What does the supplied evidence establish?",
      selectedAgents: [...AGENT_IDS],
      documents: makeDemoDocuments(),
      mode: "live",
    });
    const completed = makeDemoSession();
    completed.id = session.id;
    completed.question = session.question;
    let pollCount = 0;

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/analyze" && init?.method === "POST") {
        return jsonResponse({ sessionId: session.id, status: "queued", mode: "live" }, 202);
      }
      if (url.startsWith(`/api/analyze/${session.id}`)) {
        pollCount += 1;
        return pollCount === 1
          ? jsonResponse({ status: "running", mode: "live", events: [], session })
          : jsonResponse({ status: "completed", mode: "live", events: [], session: completed });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(
      <WorkspaceProvider>
        <PollingHarness session={session} />
      </WorkspaceProvider>,
    );

    await waitFor(
      () => expect(screen.getByTestId("session-status")).toHaveTextContent("completed"),
      { timeout: 4_000 },
    );
    expect(pollCount).toBeGreaterThanOrEqual(2);
  });
});

function PollingHarness({ session }: { session: ResearchSession }) {
  const { sessions, startAnalysis } = useWorkspace();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startAnalysis(session);
  }, [session, startAnalysis]);

  return (
    <span data-testid="session-status">
      {sessions.find((item) => item.id === session.id)?.status ?? "missing"}
    </span>
  );
}

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}
