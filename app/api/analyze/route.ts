import { after, NextResponse } from "next/server";

import { getLlmConfiguration, hasLlmAccess } from "@/lib/llm";
import { registerResearchJob, runRegisteredResearchJob } from "@/lib/research/jobs";
import {
  assertDocumentsBelongToSession,
  ResearchIsolationError,
} from "@/lib/research/isolation";
import { analyzeRequestSchema } from "@/lib/research/schemas";
import { createResearchSession } from "@/lib/research/session";
import { saveSessionToSupabase } from "@/lib/supabase";
import type { ResearchEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const configuration = getLlmConfiguration();
  const modelAssisted = configuration.enabled;

  return NextResponse.json({
    mode: modelAssisted ? "live" : "demo",
    label: modelAssisted
      ? `${configuration.providerLabel} six-specialist analysis`
      : "Local evidence extraction",
    description: modelAssisted
      ? `Semantic retrieval and structured analysis are active with ${configuration.model}. Every conclusion is checked against uploaded source passages.`
      : "No AI key is configured. Aetheris will organize source evidence locally, without claiming model interpretation.",
    provider: configuration.provider,
    model: configuration.model,
    embeddingModel: configuration.embeddingModel,
  });
}

export async function POST(request: Request) {
  const accessToken = accessTokenFromRequest(request);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The analysis request was not valid JSON." }, { status: 400 });
  }

  const parsed = analyzeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "A research question and at least one prepared document are required.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const body = parsed.data;
  try {
    assertDocumentsBelongToSession(body.sessionId, body.documents);
  } catch (error) {
    if (error instanceof ResearchIsolationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  let session = createResearchSession({
    id: body.sessionId,
    question: body.question,
    documents: body.documents,
    selectedAgents: body.selectedAgents,
    mode: hasLlmAccess() ? "live" : "demo",
  });
  session = {
    ...session,
    events: body.priorEvents
      .filter(isResearchEvent)
      .map((event) => event as unknown as ResearchEvent),
  };

  const checkpoint = await saveSessionToSupabase(session, accessToken);
  if (checkpoint?.error) {
    console.error("[Aetheris analyze] Initial session checkpoint failed", {
      sessionId: session.id,
      message: checkpoint.error.message,
    });
  }

  const job = registerResearchJob(session, accessToken);
  after(() => runRegisteredResearchJob(job.session.id, accessToken));

  return NextResponse.json({
    sessionId: session.id,
    status: job.status,
    mode: session.mode,
  }, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  });
}

function isResearchEvent(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Record<string, unknown>;
  return (
    event.version === 1 &&
    typeof event.id === "string" &&
    typeof event.sessionId === "string" &&
    typeof event.sequence === "number" &&
    typeof event.type === "string"
  );
}

function accessTokenFromRequest(request: Request) {
  const value = request.headers.get("authorization");
  return value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}
