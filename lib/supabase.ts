import { createClient } from "@supabase/supabase-js";

import { normalizeResearchSession } from "@/lib/research/session";
import type { ResearchSession } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase now calls this a Publishable Key. Retain the legacy anon variable
// so existing deployments continue to work during migration.
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let browserClient: ReturnType<typeof createClient> | null | undefined;
let sessionsTableRetryAfter = 0;
let missingTableWarningLogged = false;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && publishableKey);
}

export function createBrowserSupabaseClient() {
  if (!supabaseUrl || !publishableKey) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, publishableKey);
  }
  return browserClient;
}

function createUserRequestClient(accessToken: string | null | undefined) {
  if (!supabaseUrl || !publishableKey || !accessToken) {
    return null;
  }

  return createClient(supabaseUrl, publishableKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function saveSessionToSupabase(
  session: ResearchSession,
  accessToken?: string | null,
) {
  const supabase = createUserRequestClient(accessToken);
  if (!supabase) {
    return null;
  }

  if (sessionsTableRetryAfter > Date.now()) {
    return null;
  }

  const result = await supabase.from("research_sessions").upsert(
    {
      id: session.id,
      question: session.question,
      status: session.status,
      mode: session.mode,
      selected_agents: session.selectedAgents,
      documents: session.documents,
      pipeline: session.pipeline,
      events: session.events,
      agent_executions: session.agentExecutions,
      evidence: session.evidence,
      report_sections: session.reportSections,
      metrics: session.metrics,
      confidence: session.confidence,
      error: session.error,
      results: session.results,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
    },
    { onConflict: "id" },
  );
  return handleSessionsTableResult(result);
}

export async function fetchSessionsFromSupabase(accessToken?: string | null) {
  const supabase = createUserRequestClient(accessToken);
  if (!supabase) {
    return [];
  }

  if (sessionsTableRetryAfter > Date.now()) {
    return [];
  }

  const result = await supabase
    .from("research_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  const handled = handleSessionsTableResult(result);
  if (handled.error) {
    throw handled.error;
  }

  return (handled.data ?? []).map(mapSessionRow);
}

export async function fetchSessionByIdFromSupabase(id: string, accessToken?: string | null) {
  const supabase = createUserRequestClient(accessToken);
  if (!supabase) {
    return null;
  }

  if (sessionsTableRetryAfter > Date.now()) {
    return null;
  }

  const result = await supabase
    .from("research_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const { data } = handleSessionsTableResult(result);

  return data ? mapSessionRow(data) : null;
}

export async function deleteSessionFromSupabase(id: string, accessToken?: string | null) {
  const supabase = createUserRequestClient(accessToken);
  if (!supabase) {
    return null;
  }

  if (sessionsTableRetryAfter > Date.now()) {
    return null;
  }

  const result = await supabase.from("research_sessions").delete().eq("id", id);
  return handleSessionsTableResult(result);
}

export function isMissingResearchSessionsTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return candidate.code === "PGRST205" || (
    /research_sessions/i.test(message) &&
    /schema cache|could not find the table|relation .* does not exist/i.test(message)
  );
}

function handleSessionsTableResult<T extends { error: unknown }>(result: T): T {
  if (!isMissingResearchSessionsTableError(result.error)) {
    if (!result.error) sessionsTableRetryAfter = 0;
    return result;
  }

  sessionsTableRetryAfter = Date.now() + 60_000;
  if (!missingTableWarningLogged) {
    missingTableWarningLogged = true;
    console.error(
      "[Aetheris Supabase] public.research_sessions is missing. Apply supabase/migrations/20260720203000_create_research_sessions.sql; remote checkpoints are paused for 60 seconds.",
    );
  }
  return { ...result, error: null };
}

function mapSessionRow(row: Record<string, unknown>): ResearchSession {
  const normalized = normalizeResearchSession({
    id: String(row.id),
    question: String(row.question),
    status: row.status as ResearchSession["status"],
    mode: row.mode as ResearchSession["mode"],
    selectedAgents: (row.selected_agents as ResearchSession["selectedAgents"]) ?? [],
    documents: (row.documents as ResearchSession["documents"]) ?? [],
    pipeline: row.pipeline as ResearchSession["pipeline"],
    events: row.events as ResearchSession["events"],
    agentExecutions: row.agent_executions as ResearchSession["agentExecutions"],
    evidence: row.evidence as ResearchSession["evidence"],
    reportSections: row.report_sections as ResearchSession["reportSections"],
    metrics: row.metrics as ResearchSession["metrics"],
    confidence: row.confidence as ResearchSession["confidence"],
    error: row.error as ResearchSession["error"],
    results: row.results as ResearchSession["results"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  });

  if (!normalized) {
    throw new Error(`Invalid research session row: ${String(row.id)}`);
  }

  return normalized;
}
