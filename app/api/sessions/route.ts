import { NextResponse } from "next/server";

import { fetchSessionsFromSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const sessions = await fetchSessionsFromSupabase(accessTokenFromRequest(request));
  return NextResponse.json(sessions);
}

function accessTokenFromRequest(request: Request) {
  const value = request.headers.get("authorization");
  return value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}
