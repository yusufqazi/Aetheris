import { createClient } from "@supabase/supabase-js";

import { normalizeResearchSession } from "@/lib/research/session";
import type { ResearchSession } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && (serviceRoleKey || anonKey));
}

export function createBrowserSupabaseClient() {
  if (!supabaseUrl || !anonKey) {
    return null;
  }

  return createClient(supabaseUrl, anonKey);
}

function createAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function saveSessionToSupabase(session: ResearchSession) {
  const supabase = createAdminClient();
  if (!supabase) {
    return null;
  }

  return supabase.from("research_sessions").upsert(
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
}

export async function fetchSessionsFromSupabase() {
  const supabase = createAdminClient();
  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("research_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []).map(mapSessionRow);
}

export async function fetchSessionByIdFromSupabase(id: string) {
  const supabase = createAdminClient();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("research_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return data ? mapSessionRow(data) : null;
}

export async function deleteSessionFromSupabase(id: string) {
  const supabase = createAdminClient();
  if (!supabase) {
    return null;
  }

  return supabase.from("research_sessions").delete().eq("id", id);
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
