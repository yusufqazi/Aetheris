create table if not exists public.research_sessions (
  id text primary key,
  question text not null,
  status text not null,
  mode text not null,
  selected_agents jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  results jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.research_sessions enable row level security;
