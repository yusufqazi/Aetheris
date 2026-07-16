import { NextResponse } from "next/server";

import { getLlmConfiguration, hasLlmAccess } from "@/lib/llm";
import { createEventFactory, encodeResearchEvent } from "@/lib/research/events";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { analyzeRequestSchema } from "@/lib/research/schemas";
import { applyResearchEvent, createResearchSession } from "@/lib/research/session";
import { saveSessionToSupabase } from "@/lib/supabase";
import type { ResearchEvent } from "@/lib/types";

export const runtime = "nodejs";

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
  const encoder = new TextEncoder();
  const createEvent = createEventFactory(body.sessionId, body.startingSequence);
  const priorEvents = body.priorEvents.filter(isResearchEvent) as unknown as ResearchEvent[];
  let session = createResearchSession({
    id: body.sessionId,
    question: body.question,
    documents: body.documents,
    selectedAgents: body.selectedAgents,
    mode: hasLlmAccess() ? "live" : "demo",
  });
  session = { ...session, events: priorEvents };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = async (input: Parameters<typeof createEvent>[0]) => {
        const event = createEvent(input);
        session = applyResearchEvent(session, event);
        controller.enqueue(encoder.encode(encodeResearchEvent(event)));

        if (
          event.type === "stage.completed" ||
          event.type === "agent.completed" ||
          event.type === "session.completed" ||
          event.type === "session.failed"
        ) {
          await saveSessionToSupabase(session);
        }
      };

      try {
        await saveSessionToSupabase(session);
        await runResearchPipeline({ session, emit });
        controller.close();
      } catch (error) {
        const researchError = {
          code: "PIPELINE_FAILED",
          title: "Research pipeline interrupted",
          message: "Aetheris preserved the completed work, but the research run did not finish.",
          retryable: true,
          details: error instanceof Error ? error.message : "Unknown pipeline error",
        };

        await emit({
          type: "session.failed",
          phase: "error",
          message: researchError.message,
          data: { error: researchError },
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
      "X-Aetheris-Mode": hasLlmAccess() ? "live" : "demo",
    },
  });
}

function isResearchEvent(value: unknown): value is ResearchEvent {
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
