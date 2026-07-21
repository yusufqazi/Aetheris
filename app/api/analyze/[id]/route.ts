import { NextResponse } from "next/server";

import { getResearchJob } from "@/lib/research/jobs";
import { fetchSessionByIdFromSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function accessTokenFromRequest(request: Request) {
  const value = request.headers.get("authorization");
  return value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

