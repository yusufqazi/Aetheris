-- Run after schema.sql in the Supabase SQL Editor.
-- This makes every research session belong to the authenticated user who
-- created it and prevents one account from reading another account's data.

alter table public.research_sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.research_sessions
  alter column user_id set default auth.uid();

create index if not exists research_sessions_user_updated_idx
  on public.research_sessions (user_id, updated_at desc);

alter table public.research_sessions enable row level security;

drop policy if exists "Users can read their own research sessions" on public.research_sessions;
create policy "Users can read their own research sessions"
  on public.research_sessions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create their own research sessions" on public.research_sessions;
create policy "Users can create their own research sessions"
  on public.research_sessions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own research sessions" on public.research_sessions;
create policy "Users can update their own research sessions"
  on public.research_sessions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their own research sessions" on public.research_sessions;
create policy "Users can delete their own research sessions"
  on public.research_sessions
  for delete
  to authenticated
  using (user_id = auth.uid());
