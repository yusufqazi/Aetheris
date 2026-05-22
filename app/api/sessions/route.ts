import { NextResponse } from "next/server";

import { fetchSessionsFromSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const sessions = await fetchSessionsFromSupabase();
  return NextResponse.json(sessions);
}
