import { after, NextResponse } from "next/server";

import {
  getResearchJob,
  registerResearchJob,
  runRegisteredResearchJob,
} from "@/lib/research/jobs";
import { fetchSessionByIdFromSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const STALE_RESEARCH_RUN_MS = 6 * 60_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const accessToken = accessTokenFromRequest(request);
  const url = new URL(request.url);
  const afterSequence = Math.max(0, Number(url.searchParams.get("after") ?? 0) || 0);
  const job = getResearchJob(id, accessToken);

  if (job) {
    return NextResponse.json({
      status: job.status,
      mode: job.session.mode,
      events: job.events.filter((event) => event.sequence > afterSequence),
    });
  }

  const session = await fetchSessionByIdFromSupabase(id, accessToken);
  if (!session) {
    return NextResponse.json({ error: "Research job not found." }, { status: 404 });
  }

  // Jobs are held in memory while they run. If a local server restarts (or a
  // short-lived worker is replaced), the last Supabase checkpoint can otherwise
  // look active forever. Resume only old, non-terminal checkpoints so a live
  // job is never duplicated.
  if (isStaleActiveSession(session)) {
    const resumedJob = registerResearchJob(session, accessToken);
    after(() => runRegisteredResearchJob(session.id, accessToken));
    return NextResponse.json({
      status: resumedJob.status,
      mode: resumedJob.session.mode,
      events: [],
    });
  }

  return NextResponse.json({
    status: session.status === "completed"
      ? "completed"
      : session.status === "error"
        ? "failed"
        : "running",
    mode: session.mode,
    events: [],
    session,
  });
}

export function isStaleActiveSession(session: { status: string; updatedAt: string }) {
  if (["idle", "completed", "error"].includes(session.status)) return false;
  const updatedAt = Date.parse(session.updatedAt);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt > STALE_RESEARCH_RUN_MS;
}

function accessTokenFromRequest(request: Request) {
  const value = request.headers.get("authorization");
  return value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}
