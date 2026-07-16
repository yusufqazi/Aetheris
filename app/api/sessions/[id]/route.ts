import { NextResponse } from "next/server";

import { deleteSessionFromSupabase, fetchSessionByIdFromSupabase } from "@/lib/supabase";

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await deleteSessionFromSupabase(id);
  if (result?.error) {
    console.error("[Aetheris sessions] Remote deletion failed", result.error);
    return NextResponse.json({ error: "The analysis could not be deleted from remote storage." }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
