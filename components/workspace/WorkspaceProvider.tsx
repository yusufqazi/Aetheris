"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  use,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";

import { makeDemoSession } from "@/lib/demo-data";
import { createEventFactory, readResearchEventStream } from "@/lib/research/events";
import {
  applyResearchEvent,
  createAgentExecutions,
  createPipeline,
  normalizeResearchSession,
} from "@/lib/research/session";
import { deleteLocalSession, loadLocalSessions, saveLocalSession } from "@/lib/session-store";
import type {
  ResearchSession,
  WorkspaceInspectorSelection,
} from "@/lib/types";

interface WorkspaceState {
  sessions: ResearchSession[];
  hydrated: boolean;
  activeSessionId: string | null;
  inspector: WorkspaceInspectorSelection;
  mobileInspectorOpen: boolean;
}

type WorkspaceAction =
  | { type: "hydrate"; sessions: ResearchSession[] }
  | { type: "session.upsert"; session: ResearchSession }
  | { type: "session.remove"; sessionId: string }
  | { type: "session.active"; sessionId: string | null }
  | { type: "inspector.select"; selection: WorkspaceInspectorSelection }
  | { type: "inspector.mobile"; open: boolean };

interface WorkspaceContextValue extends WorkspaceState {
  activeSession: ResearchSession | null;
  upsertSession: (session: ResearchSession) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  setActiveSessionId: (sessionId: string | null) => void;
  selectInspector: (selection: WorkspaceInspectorSelection) => void;
  setMobileInspectorOpen: (open: boolean) => void;
  startAnalysis: (session: ResearchSession, options?: { retry?: boolean }) => Promise<void>;
  openDemoSession: () => Promise<void>;
}

const initialState: WorkspaceState = {
  sessions: [],
  hydrated: false,
  activeSessionId: null,
  inspector: { tab: "confidence", sessionId: null, evidenceId: null, agentId: null },
  mobileInspectorOpen: false,
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const [local, remote] = await Promise.all([
        loadLocalSessions(),
        fetch("/api/sessions", { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : []))
          .catch(() => []),
      ]);
      const remoteSessions = Array.isArray(remote)
        ? remote
            .map(normalizeResearchSession)
            .filter((session): session is ResearchSession => Boolean(session))
        : [];
      const sessions = mergeSessions(local, remoteSessions);

      if (active) {
        const next = workspaceReducer(stateRef.current, { type: "hydrate", sessions });
        stateRef.current = next;
        dispatch({ type: "hydrate", sessions });
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const commitSession = useCallback((session: ResearchSession) => {
    const next = workspaceReducer(stateRef.current, { type: "session.upsert", session });
    stateRef.current = next;
    dispatch({ type: "session.upsert", session });
    void saveLocalSession(session);
  }, []);

  const setActiveSessionId = useCallback((sessionId: string | null) => {
    const next = workspaceReducer(stateRef.current, { type: "session.active", sessionId });
    stateRef.current = next;
    dispatch({ type: "session.active", sessionId });
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    const next = workspaceReducer(stateRef.current, { type: "session.remove", sessionId });
    stateRef.current = next;
    dispatch({ type: "session.remove", sessionId });
    await deleteLocalSession(sessionId);
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => null);
  }, []);

  const selectInspector = useCallback((selection: WorkspaceInspectorSelection) => {
    const next = workspaceReducer(stateRef.current, { type: "inspector.select", selection });
    stateRef.current = next;
    dispatch({ type: "inspector.select", selection });
  }, []);

  const setMobileInspectorOpen = useCallback((open: boolean) => {
    const next = workspaceReducer(stateRef.current, { type: "inspector.mobile", open });
    stateRef.current = next;
    dispatch({ type: "inspector.mobile", open });
  }, []);

  const startAnalysis = useCallback(
    async (session: ResearchSession, options?: { retry?: boolean }) => {
      let activeSession = options?.retry ? prepareForRetry(session) : session;
      commitSession(activeSession);
      setActiveSessionId(activeSession.id);
      selectInspector({ tab: "confidence", sessionId: activeSession.id });
      startTransition(() => router.push(`/research/${activeSession.id}`));

      const startingSequence = Math.max(0, ...activeSession.events.map((event) => event.sequence));

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSession.id,
            question: activeSession.question,
            selectedAgents: activeSession.selectedAgents,
            documents: activeSession.documents,
            startingSequence,
            priorEvents: activeSession.events,
            resumeFrom: options?.retry ? "retrieval" : undefined,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "The research stream could not be started.");
        }

        const engineMode = response.headers.get("X-Aetheris-Mode");
        if (engineMode === "live" || engineMode === "demo") {
          activeSession = { ...activeSession, mode: engineMode };
          commitSession(activeSession);
        }

        await readResearchEventStream(response, (event) => {
          const current =
            stateRef.current.sessions.find((item) => item.id === event.sessionId) ?? activeSession;
          const updated = applyResearchEvent(current, event);
          activeSession = updated;
          commitSession(updated);
        });
      } catch (error) {
        const current =
          stateRef.current.sessions.find((item) => item.id === activeSession.id) ?? activeSession;
        const createEvent = createEventFactory(
          current.id,
          Math.max(0, ...current.events.map((event) => event.sequence)),
        );
        const failure = createEvent({
          type: "session.failed",
          phase: "error",
          message: "The research connection ended before the session completed",
          data: {
            error: {
              code: "RESEARCH_STREAM_FAILED",
              title: "Research session interrupted",
              message: "Your prepared documents and completed work are preserved.",
              retryable: true,
              details: error instanceof Error ? error.message : "Unknown stream error",
            },
          },
        });
        commitSession(applyResearchEvent(current, failure));
      }
    },
    [commitSession, router, selectInspector, setActiveSessionId],
  );

  const openDemoSession = useCallback(async () => {
    const session = makeDemoSession();
    commitSession(session);
    setActiveSessionId(session.id);
    selectInspector({ tab: "confidence", sessionId: session.id });
    await saveLocalSession(session);
    startTransition(() => router.push(`/research/${session.id}`));
  }, [commitSession, router, selectInspector, setActiveSessionId]);

  const activeSession = state.activeSessionId
    ? state.sessions.find((session) => session.id === state.activeSessionId) ?? null
    : null;

  return (
    <WorkspaceContext
      value={{
        ...state,
        activeSession,
        upsertSession: commitSession,
        deleteSession,
        setActiveSessionId,
        selectInspector,
        setMobileInspectorOpen,
        startAnalysis,
        openDemoSession,
      }}
    >
      {children}
    </WorkspaceContext>
  );
}

export function useWorkspace() {
  const context = use(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider.");
  }
  return context;
}

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "hydrate":
      return { ...state, sessions: action.sessions, hydrated: true };
    case "session.upsert":
      return {
        ...state,
        sessions: [
          action.session,
          ...state.sessions.filter((session) => session.id !== action.session.id),
        ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      };
    case "session.remove":
      return {
        ...state,
        sessions: state.sessions.filter((session) => session.id !== action.sessionId),
        activeSessionId: state.activeSessionId === action.sessionId ? null : state.activeSessionId,
        inspector: state.inspector.sessionId === action.sessionId
          ? { tab: "confidence", sessionId: null, evidenceId: null, agentId: null }
          : state.inspector,
      };
    case "session.active":
      if (state.activeSessionId === action.sessionId) return state;
      return { ...state, activeSessionId: action.sessionId };
    case "inspector.select":
      if (sameInspectorSelection(state.inspector, action.selection)) return state;
      return { ...state, inspector: action.selection };
    case "inspector.mobile":
      if (state.mobileInspectorOpen === action.open) return state;
      return { ...state, mobileInspectorOpen: action.open };
  }
}

function sameInspectorSelection(
  left: WorkspaceInspectorSelection,
  right: WorkspaceInspectorSelection,
) {
  return (
    left.tab === right.tab &&
    left.sessionId === right.sessionId &&
    left.evidenceId === right.evidenceId &&
    left.agentId === right.agentId
  );
}

function mergeSessions(local: ResearchSession[], remote: ResearchSession[]) {
  const merged = new Map<string, ResearchSession>();

  for (const session of [...local, ...remote]) {
    const existing = merged.get(session.id);
    if (!existing || session.updatedAt > existing.updatedAt) {
      merged.set(session.id, session);
    }
  }

  return Array.from(merged.values()).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function prepareForRetry(session: ResearchSession): ResearchSession {
  const preservedStages = new Set(["uploading", "parsing", "normalizing"]);
  const pipeline = createPipeline(session.selectedAgents, session.documents).map((stage) =>
    preservedStages.has(stage.id)
      ? { ...stage, status: "completed" as const, progress: 100, detail: "Preserved from prior run" }
      : stage,
  );

  return {
    ...session,
    status: "processing",
    updatedAt: new Date().toISOString(),
    pipeline,
    agentExecutions: createAgentExecutions(session.selectedAgents),
    evidence: [],
    reportSections: [],
    results: undefined,
    confidence: undefined,
    error: null,
    metrics: {
      ...session.metrics,
      chunkCount: 0,
      retrievedEvidenceCount: 0,
      completedAgentCount: 0,
      disagreementCount: 0,
      assembledSectionCount: 0,
      elapsedMs: null,
    },
  };
}
