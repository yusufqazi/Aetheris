begin;

create table if not exists public.research_sessions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
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

create index if not exists research_sessions_user_created_idx
  on public.research_sessions (user_id, created_at desc);

alter table public.research_sessions enable row level security;
alter table public.research_sessions force row level security;

revoke all on table public.research_sessions from anon;
grant select, insert, update, delete on table public.research_sessions to authenticated;

drop policy if exists "Users can read their own research sessions" on public.research_sessions;
create policy "Users can read their own research sessions"
  on public.research_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own research sessions" on public.research_sessions;
create policy "Users can create their own research sessions"
  on public.research_sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own research sessions" on public.research_sessions;
create policy "Users can update their own research sessions"
  on public.research_sessions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own research sessions" on public.research_sessions;
create policy "Users can delete their own research sessions"
  on public.research_sessions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

commit;
