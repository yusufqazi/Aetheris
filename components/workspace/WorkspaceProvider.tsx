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

import { useAuth } from "@/components/auth/AuthProvider";
import { makeDemoSession } from "@/lib/demo-data";
import { createEventFactory } from "@/lib/research/events";
import { toUserFacingResearchError } from "@/lib/research/user-facing-errors";
import {
  applyResearchEvent,
  createAgentExecutions,
  createPipeline,
  normalizeResearchSession,
} from "@/lib/research/session";
import { deleteLocalSession, loadLocalSessions, saveLocalSession } from "@/lib/session-store";
import type {
  ResearchEvent,
  ResearchSession,
  WorkspaceInspectorSelection,
} from "@/lib/types";

interface WorkspaceState {
  sessions: ResearchSession[];
  hydrated: boolean;
  sessionSyncError: string | null;
  activeSessionId: string | null;
  inspector: WorkspaceInspectorSelection;
  mobileInspectorOpen: boolean;
}

type WorkspaceAction =
  | { type: "hydrate"; sessions: ResearchSession[]; sessionSyncError: string | null }
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
  sessionSyncError: null,
  activeSessionId: null,
  inspector: { tab: "confidence", sessionId: null, evidenceId: null, agentId: null },
  mobileInspectorOpen: false,
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  const stateRef = useRef(state);
  const pollingSessionsRef = useRef(new Set<string>());
  const startingSessionsRef = useRef(new Set<string>());
  const providerMountedRef = useRef(true);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    providerMountedRef.current = true;
    return () => {
      providerMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    async function hydrate() {
      const [local, remote] = await Promise.all([
        // Only sessions owned by the current account are loaded from the local cache.
        // Unowned legacy sessions remain readable for compatibility, but new guests
        // are never written to this cache.
        loadLocalSessions(user?.id),
        user && accessToken
          ? fetch("/api/sessions", {
              cache: "no-store",
              headers: { Authorization: `Bearer ${accessToken}` },
            }).then(async (response) => {
              const payload = await response.json().catch(() => null) as unknown;
              if (!response.ok) {
                const message = isRecord(payload) && typeof payload.error === "string"
                  ? payload.error
                  : `Saved research sessions could not be loaded (${response.status}).`;
                return { sessions: [], error: message };
              }
              return { sessions: Array.isArray(payload) ? payload : [], error: null };
            }).catch(() => ({
              sessions: [],
              error: "Saved research sessions could not be reached. Check the Supabase connection.",
            }))
          : Promise.resolve({ sessions: [], error: null }),
      ]);
      const remoteSessions = Array.isArray(remote.sessions)
        ? remote.sessions
            .map(normalizeResearchSession)
            .filter((session): session is ResearchSession => Boolean(session))
        : [];
      const sessions = mergeSessions(local, remoteSessions);

      if (active) {
        const next = workspaceReducer(stateRef.current, {
          type: "hydrate",
          sessions,
          sessionSyncError: remote.error,
        });
        stateRef.current = next;
        dispatch({ type: "hydrate", sessions, sessionSyncError: remote.error });
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [accessToken, authLoading, user]);

  const commitSession = useCallback((session: ResearchSession) => {
    const next = workspaceReducer(stateRef.current, { type: "session.upsert", session });
    stateRef.current = next;
    dispatch({ type: "session.upsert", session });
    if (user) {
      void saveLocalSession(session, user.id);
    }
  }, [user]);

  const setActiveSessionId = useCallback((sessionId: string | null) => {
    const next = workspaceReducer(stateRef.current, { type: "session.active", sessionId });
    stateRef.current = next;
    dispatch({ type: "session.active", sessionId });
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (accessToken) {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => null);
      if (!response?.ok) {
        console.error("[Aetheris sessions] Remote deletion did not complete", {
          sessionId,
          status: response?.status ?? "network-error",
        });
        return;
      }
    }

    const next = workspaceReducer(stateRef.current, { type: "session.remove", sessionId });
    stateRef.current = next;
    dispatch({ type: "session.remove", sessionId });
    await deleteLocalSession(sessionId, user?.id);
  }, [accessToken, user]);

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

  const pollResearchJob = useCallback(async (initialSession: ResearchSession) => {
    if (pollingSessionsRef.current.has(initialSession.id)) return;
    pollingSessionsRef.current.add(initialSession.id);

    let activeSession = initialSession;
    let sequence = Math.max(0, ...activeSession.events.map((event) => event.sequence));
    let transientFailures = 0;

    try {
      // Once monitoring starts, the server job status is authoritative. A stale
      // idle checkpoint can arrive while the POST that starts the job is still
      // being accepted; stopping on that local snapshot leaves the UI frozen
      // even though the server continues processing.
      while (providerMountedRef.current) {
        await waitForPollingWindow(transientFailures);
        if (!providerMountedRef.current) return;

        let response: Response;
        try {
          response = await fetch(
            `/api/analyze/${encodeURIComponent(activeSession.id)}?after=${sequence}`,
            {
              cache: "no-store",
              headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
            },
          );
        } catch (error) {
          transientFailures += 1;
          logMonitoringRetry(activeSession.id, transientFailures, error);
          continue;
        }

        if (!response.ok) {
          transientFailures += 1;
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          logMonitoringRetry(
            activeSession.id,
            transientFailures,
            new Error(payload?.error ?? `Research polling returned ${response.status}.`),
          );
          continue;
        }

        let payload: ResearchJobPollResponse;
        try {
          payload = await response.json() as ResearchJobPollResponse;
        } catch (error) {
          transientFailures += 1;
          logMonitoringRetry(activeSession.id, transientFailures, error);
          continue;
        }

        transientFailures = 0;
        const normalizedRemoteSession = normalizeResearchSession(payload.session);
        const remoteSession = normalizedRemoteSession &&
          (payload.status === "queued" || payload.status === "running") &&
          normalizedRemoteSession.status === "idle"
          ? {
              ...normalizedRemoteSession,
              status: "processing" as const,
              updatedAt: activeSession.updatedAt,
            }
          : normalizedRemoteSession;
        if (remoteSession) {
          activeSession = preferredSession(activeSession, remoteSession);
          sequence = Math.max(sequence, ...remoteSession.events.map((event) => event.sequence));
          commitSession(activeSession);
        } else if (
          (payload.status === "queued" || payload.status === "running") &&
          activeSession.status === "idle"
        ) {
          activeSession = {
            ...activeSession,
            status: "processing",
            updatedAt: new Date().toISOString(),
          };
          commitSession(activeSession);
        }

        for (const event of payload.events ?? []) {
          const current = stateRef.current.sessions.find((item) => item.id === event.sessionId)
            ?? activeSession;
          const updated = applyResearchEvent(current, event);
          activeSession = updated;
          sequence = Math.max(sequence, event.sequence);
          commitSession(updated);
        }

        if (payload.status === "completed" || payload.status === "failed") return;
        await pollingDelay(700);
      }
    } finally {
      pollingSessionsRef.current.delete(initialSession.id);
    }
  }, [accessToken, commitSession]);

  const startAnalysis = useCallback(
    async (session: ResearchSession, options?: { retry?: boolean }) => {
      if (startingSessionsRef.current.has(session.id)) return;
      startingSessionsRef.current.add(session.id);
      let activeSession = options?.retry ? prepareForRetry(session) : session;
      if (activeSession.status === "idle") {
        activeSession = {
          ...activeSession,
          status: "processing",
          updatedAt: new Date().toISOString(),
        };
      }
      commitSession(activeSession);
      setActiveSessionId(activeSession.id);
      selectInspector({ tab: "confidence", sessionId: activeSession.id });
      startTransition(() => router.push(`/research/${activeSession.id}`));

      const startingSequence = Math.max(0, ...activeSession.events.map((event) => event.sequence));
      let jobAccepted = false;

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
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

        const job = await response.json() as { mode?: ResearchSession["mode"] };
        if (job.mode === "live" || job.mode === "demo") {
          activeSession = { ...activeSession, mode: job.mode };
          commitSession(activeSession);
        }
        jobAccepted = true;
        await pollResearchJob(activeSession);
      } catch (error) {
        if (jobAccepted) {
          console.warn("[Aetheris research monitor] Monitoring paused; reconnect will continue", {
            sessionId: activeSession.id,
            message: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        // A rejected start request is different from a later monitoring disconnect.
        // pollResearchJob handles transient monitoring failures internally and never
        // turns them into pipeline failures.
        const current =
          stateRef.current.sessions.find((item) => item.id === activeSession.id) ?? activeSession;
        const createEvent = createEventFactory(
          current.id,
          Math.max(0, ...current.events.map((event) => event.sequence)),
        );
        const userFacingError = toUserFacingResearchError(error, {
          code: "RESEARCH_START_FAILED",
          defaultTitle: "Research analysis could not start",
          defaultMessage: "Aetheris could not start the server-side research job. Your prepared documents are preserved.",
        });
        const failure = createEvent({
          type: "session.failed",
          phase: "error",
          message: "The research job could not be started",
          data: { error: userFacingError },
        });
        commitSession(applyResearchEvent(current, failure));
      } finally {
        startingSessionsRef.current.delete(session.id);
      }
    },
    [accessToken, commitSession, pollResearchJob, router, selectInspector, setActiveSessionId],
  );

  useEffect(() => {
    if (!state.hydrated) return;
    for (const session of state.sessions) {
      if (!isActiveResearchSession(session)) continue;
      void pollResearchJob(session).catch(() => null);
    }
  }, [pollResearchJob, state.hydrated, state.sessions]);

  useEffect(() => {
    if (!state.hydrated) return;
    const reconnect = () => {
      for (const session of stateRef.current.sessions) {
        if (isActiveResearchSession(session)) {
          void pollResearchJob(session).catch(() => null);
        }
      }
    };
    document.addEventListener("visibilitychange", reconnect);
    window.addEventListener("online", reconnect);
    return () => {
      document.removeEventListener("visibilitychange", reconnect);
      window.removeEventListener("online", reconnect);
    };
  }, [pollResearchJob, state.hydrated]);

  const openDemoSession = useCallback(async () => {
    const session = makeDemoSession();
    commitSession(session);
    setActiveSessionId(session.id);
    selectInspector({ tab: "confidence", sessionId: session.id });
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

interface ResearchJobPollResponse {
  status: "queued" | "running" | "completed" | "failed";
  mode: ResearchSession["mode"];
  events?: ResearchEvent[];
  session?: unknown;
}

function pollingDelay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function waitForPollingWindow(transientFailures: number) {
  if (document.visibilityState === "hidden") {
    return new Promise<void>((resolve) => {
      const resume = () => {
        if (document.visibilityState !== "hidden") {
          document.removeEventListener("visibilitychange", resume);
          resolve();
        }
      };
      document.addEventListener("visibilitychange", resume);
    });
  }

  if (!navigator.onLine) {
    return new Promise<void>((resolve) => {
      window.addEventListener("online", () => resolve(), { once: true });
    });
  }

  if (transientFailures === 0) return Promise.resolve();
  return pollingDelay(Math.min(10_000, 700 * 2 ** Math.min(transientFailures, 4)));
}

function isActiveResearchSession(session: ResearchSession) {
  return !["idle", "completed", "error"].includes(session.status);
}

function logMonitoringRetry(sessionId: string, attempt: number, error: unknown) {
  if (attempt !== 1 && attempt % 5 !== 0) return;
  console.warn("[Aetheris research monitor] Reconnecting to server-owned job", {
    sessionId,
    attempt,
    message: error instanceof Error ? error.message : String(error),
  });
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
      return {
        ...state,
        sessions: mergeSessions(state.sessions, action.sessions),
        hydrated: true,
        sessionSyncError: action.sessionSyncError,
      };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function mergeSessions(local: ResearchSession[], remote: ResearchSession[]) {
  const merged = new Map<string, ResearchSession>();

  for (const session of [...local, ...remote]) {
    const existing = merged.get(session.id);
    merged.set(session.id, existing ? preferredSession(existing, session) : session);
  }

  return Array.from(merged.values()).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function preferredSession(
  existing: ResearchSession,
  candidate: ResearchSession,
) {
  if (existing.status !== "idle" && candidate.status === "idle") return existing;
  if (existing.status === "idle" && candidate.status !== "idle") return candidate;

  const existingSequence = Math.max(0, ...existing.events.map((event) => event.sequence));
  const candidateSequence = Math.max(0, ...candidate.events.map((event) => event.sequence));
  if (existingSequence !== candidateSequence) {
    return candidateSequence > existingSequence ? candidate : existing;
  }

  return candidate.updatedAt > existing.updatedAt ? candidate : existing;
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
