import { NextResponse } from "next/server";

import { fetchSessionsFromSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const accessToken = accessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Authentication is required to load saved research sessions." }, { status: 401 });
  }

  try {
    const sessions = await fetchSessionsFromSupabase(accessToken);
    return NextResponse.json(sessions);
  } catch (error) {
    console.error("[Aetheris sessions] Remote loading failed", error);
    return NextResponse.json(
      { error: "Saved research sessions could not be loaded from Supabase." },
      { status: 502 },
    );
  }
}

function accessTokenFromRequest(request: Request) {
  const value = request.headers.get("authorization");
  return value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}
