import { NextResponse } from "next/server";

import { fetchSessionByIdFromSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await fetchSessionByIdFromSupabase(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json(session);
}
