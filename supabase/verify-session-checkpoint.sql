begin;

do $$
begin
  if not exists (select 1 from auth.users) then
    raise exception 'An authenticated user is required for the checkpoint verification.';
  end if;
end
$$;

select set_config(
  'aetheris.owner_id',
  (select id::text from auth.users order by created_at limit 1),
  true
);
select set_config('request.jwt.claim.sub', current_setting('aetheris.owner_id'), true);
set local role authenticated;

insert into public.research_sessions (
  id,
  question,
  status,
  mode,
  selected_agents,
  documents,
  pipeline,
  events,
  agent_executions,
  evidence,
  report_sections,
  metrics,
  confidence,
  error,
  results,
  created_at,
  updated_at
) values (
  '__aetheris_checkpoint_verification__',
  'Verify authenticated research session checkpointing.',
  'processing',
  'live',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  null,
  null,
  null,
  now(),
  now()
)
on conflict (id) do update
set status = excluded.status,
    updated_at = excluded.updated_at;

select set_config(
  'aetheris.owner_checkpoint_ok',
  (
    select (
      count(*) = 1 and
      bool_and(user_id = auth.uid())
    )::text
    from public.research_sessions
    where id = '__aetheris_checkpoint_verification__'
  ),
  true
);

select set_config(
  'request.jwt.claim.sub',
  case
    when current_setting('aetheris.owner_id') = '00000000-0000-0000-0000-000000000001'
      then '00000000-0000-0000-0000-000000000002'
    else '00000000-0000-0000-0000-000000000001'
  end,
  true
);

select
  current_setting('aetheris.owner_checkpoint_ok')::boolean as owner_can_checkpoint,
  count(*) = 0 as different_user_cannot_read_checkpoint
from public.research_sessions
where id = '__aetheris_checkpoint_verification__';

rollback;
