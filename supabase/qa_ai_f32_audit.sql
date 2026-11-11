-- QA Hub F3.2: append-only private source/version and AI decision provenance.
-- Stores only SHA-256 fingerprints and bounded identifiers; never source text,
-- evidence bytes, model responses, credentials or authorization headers.
-- Must be applied after qa_r4_requirement_coverage.sql.
create table if not exists public.qa_ai_audit_trail(
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null,
  user_id uuid not null,
  event_type text not null check(event_type in (
    'source_snapshot','conflict_decision','post_revision_applied',
    'test_revision_applied','coverage_generation_requested')),
  resource text not null check(resource in ('contexto','requisito','post','teste')),
  reference_hash text not null check(reference_hash ~ '^[a-f0-9]{64}$'),
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  before_hash text check(before_hash is null or before_hash ~ '^[a-f0-9]{64}$'),
  after_hash text check(after_hash is null or after_hash ~ '^[a-f0-9]{64}$'),
  requirement_code text check(requirement_code is null or requirement_code ~ '^(RF|RNF|RN|CA)-[0-9]{3,4}$'),
  decision text check(decision is null or decision in (
    'keep_both','prefer_left','prefer_right','pending')),
  created_at timestamptz not null default now(),
  constraint qa_ai_audit_owner foreign key(tarefa_id,user_id)
    references public.qa_tarefas(id,user_id) on delete cascade,
  constraint qa_ai_audit_event_shape check (
    (event_type='conflict_decision' and resource='contexto' and decision is not null)
    or
    (event_type='source_snapshot' and resource in ('contexto','requisito') and decision is null)
    or
    (event_type='post_revision_applied' and resource='post' and decision is null)
    or
    (event_type in ('test_revision_applied','coverage_generation_requested') and resource='teste' and decision is null)
  )
);
create index if not exists qa_ai_audit_recent_idx
  on public.qa_ai_audit_trail(tarefa_id,user_id,created_at desc,id desc);
create index if not exists qa_ai_audit_requirement_idx
  on public.qa_ai_audit_trail(tarefa_id,requirement_code,created_at desc)
  where requirement_code is not null;

alter table public.qa_ai_audit_trail enable row level security;
revoke all on public.qa_ai_audit_trail from public,anon,authenticated;
grant select on public.qa_ai_audit_trail to authenticated;
-- Do not grant INSERT to created_at or id: always use DB timestamps and IDs.
grant insert(tarefa_id,user_id,event_type,resource,reference_hash,
  source_hash,before_hash,after_hash,requirement_code,decision)
  on public.qa_ai_audit_trail to authenticated;

create policy qa_ai_audit_read on public.qa_ai_audit_trail
  for select to authenticated
  using (
    user_id=(select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false
    and exists(select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  );
create policy qa_ai_audit_insert on public.qa_ai_audit_trail
  for insert to authenticated
  with check (
    user_id=(select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false
    and exists(select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  );

comment on table public.qa_ai_audit_trail is
 'F3.2 private append-only QA audit. Only hashes, event types, reviewed decisions and requirement codes; never raw source/model outputs. No UPDATE/DELETE permissions.';
