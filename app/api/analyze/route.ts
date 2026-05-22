import { NextResponse } from "next/server";
import { nanoid } from "nanoid";

import { runMultiAgentAnalysis } from "@/lib/agents";
import { saveSessionToSupabase } from "@/lib/supabase";
import type { AgentId, ResearchSession, UploadedDocument } from "@/lib/types";

export const runtime = "nodejs";

interface AnalyzeRequest {
  question: string;
  documents: UploadedDocument[];
  selectedAgents: AgentId[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequest;

    if (!body.question?.trim() || !body.documents?.length) {
      return NextResponse.json(
        { error: "A research question and at least one document are required." },
        { status: 400 },
      );
    }

    const results = await runMultiAgentAnalysis({
      question: body.question,
      documents: body.documents,
      selectedAgents: body.selectedAgents,
    });

    const now = new Date().toISOString();
    const session: ResearchSession = {
      id: nanoid(),
      question: body.question,
      createdAt: now,
      updatedAt: now,
      status: "completed",
      mode: process.env.NEXT_PUBLIC_SUPABASE_URL ? "authenticated" : "demo",
      selectedAgents: body.selectedAgents,
      documents: body.documents,
      results,
    };

    await saveSessionToSupabase(session);

    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Analysis failed.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
