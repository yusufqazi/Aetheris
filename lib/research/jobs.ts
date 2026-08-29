import { createHash } from "node:crypto";

import { createEventFactory, type ResearchEventInput } from "@/lib/research/events";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { applyResearchEvent } from "@/lib/research/session";
import { toUserFacingResearchError } from "@/lib/research/user-facing-errors";
import { saveSessionToSupabase } from "@/lib/supabase";
import type { ResearchEvent, ResearchSession } from "@/lib/types";

type ResearchJobStatus = "queued" | "running" | "completed" | "failed";

interface ResearchJob {
  session: ResearchSession;
  status: ResearchJobStatus;
  events: ResearchEvent[];
  ownerTokenHash: string | null;
  createdAt: number;
}

interface ResearchJobStore {
  jobs: Map<string, ResearchJob>;
}

const globalJobs = globalThis as typeof globalThis & {
  __aetherisResearchJobs?: ResearchJobStore;
};

const store = globalJobs.__aetherisResearchJobs ?? { jobs: new Map<string, ResearchJob>() };
globalJobs.__aetherisResearchJobs = store;

export function registerResearchJob(session: ResearchSession, accessToken?: string | null) {
  pruneJobs();
  const existing = store.jobs.get(session.id);
  if (existing && ["queued", "running"].includes(existing.status)) {
    return existing;
  }

  const job: ResearchJob = {
    session,
    status: "queued",
    events: [],
    ownerTokenHash: tokenHash(accessToken),
    createdAt: Date.now(),
  };
  store.jobs.set(session.id, job);
  return job;
}

export function getResearchJob(
  sessionId: string,
  accessToken?: string | null,
) {
  const job = store.jobs.get(sessionId);
  if (!job || job.ownerTokenHash !== tokenHash(accessToken)) return null;
  return job;
}

export async function runRegisteredResearchJob(
  sessionId: string,
  accessToken?: string | null,
) {
  const job = getResearchJob(sessionId, accessToken);
  if (!job || job.status !== "queued") return;

  job.status = "running";
  const startingSequence = Math.max(0, ...job.session.events.map((event) => event.sequence));
  const createEvent = createEventFactory(job.session.id, startingSequence);

  const emit = async (input: ResearchEventInput) => {
    const event = createEvent(input);
    job.events.push(event);
    job.session = applyResearchEvent(job.session, event);

    if (
      event.type === "analysis.mode" ||
      event.type === "stage.started" ||
      event.type === "stage.completed" ||
      event.type === "agent.started" ||
      event.type === "agent.completed" ||
      event.type === "agent.failed" ||
      event.type === "session.completed" ||
      event.type === "session.failed"
    ) {
      await persistCheckpoint(job.session, accessToken);
    }
  };

  try {
    await persistCheckpoint(job.session, accessToken);
    await runResearchPipeline({ session: job.session, emit });
    job.status = "completed";
  } catch (error) {
    const activeStage = job.session.pipeline.find((stage) => stage.status === "running")?.id ?? null;
    const researchError = toUserFacingResearchError(error, {
      code: "PIPELINE_FAILED",
      stageId: activeStage,
      defaultTitle: "Research pipeline interrupted",
      defaultMessage: "Aetheris preserved the completed work, but the research run did not finish.",
    });

    if (activeStage) {
      await emit({
        type: "stage.failed",
        phase: "error",
        stageId: activeStage,
        message: researchError.message,
        data: { error: researchError },
      });
    }

    await emit({
      type: "session.failed",
      phase: "error",
      message: researchError.message,
      data: { error: researchError },
    });
    job.status = "failed";
    console.error("[Aetheris research job] Pipeline failed", {
      sessionId,
      error: researchError.details,
    });
  }
}

async function persistCheckpoint(session: ResearchSession, accessToken?: string | null) {
  const result = await saveSessionToSupabase(session, accessToken);
  if (result?.error) {
    console.error("[Aetheris research job] Session checkpoint failed", {
      sessionId: session.id,
      message: result.error.message,
    });
  }
}

function tokenHash(accessToken?: string | null) {
  return accessToken
    ? createHash("sha256").update(accessToken).digest("hex")
    : null;
}

function pruneJobs() {
  const cutoff = Date.now() - 6 * 60 * 60 * 1_000;
  for (const [sessionId, job] of store.jobs) {
    if (job.createdAt < cutoff && ["completed", "failed"].includes(job.status)) {
      store.jobs.delete(sessionId);
    }
  }
}
