create table if not exists public.research_sessions (
  id text primary key,
  question text not null,
  status text not null,
  mode text not null,
  selected_agents jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  pipeline jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  agent_executions jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  report_sections jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  confidence jsonb,
  error jsonb,
  results jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.research_sessions
  add column if not exists pipeline jsonb not null default '[]'::jsonb,
  add column if not exists events jsonb not null default '[]'::jsonb,
  add column if not exists agent_executions jsonb not null default '{}'::jsonb,
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists report_sections jsonb not null default '[]'::jsonb,
  add column if not exists metrics jsonb not null default '{}'::jsonb,
  add column if not exists confidence jsonb,
  add column if not exists error jsonb;

alter table public.research_sessions enable row level security;
