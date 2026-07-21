import { NextResponse } from "next/server";

import { deleteSessionFromSupabase, fetchSessionByIdFromSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await fetchSessionByIdFromSupabase(id, accessTokenFromRequest(request));

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json(session);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await deleteSessionFromSupabase(id, accessTokenFromRequest(request));
  if (result?.error) {
    console.error("[Aetheris sessions] Remote deletion failed", result.error);
    return NextResponse.json({ error: "The analysis could not be deleted from remote storage." }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}

function accessTokenFromRequest(request: Request) {
  const value = request.headers.get("authorization");
  return value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}
