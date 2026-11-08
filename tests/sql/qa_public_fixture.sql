-- Disposable PostgreSQL 17 fixture for GitHub Actions only.
-- These rows and roles are invented. NEVER run against Supabase production.
-- Reproduces the vulnerable initial grants / public-read policies and
-- a minimal Supabase-like auth.uid() for owner RLS tests.
create role anon nologin;
create role authenticated nologin;
create role unrelated_role nologin;
create schema if not exists auth;
grant usage on schema public to anon,authenticated,unrelated_role;
grant usage on schema auth to authenticated;

create function auth.uid()
returns uuid language sql stable
as $fn$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$fn$;
grant execute on function auth.uid() to authenticated;

create table public.qa_tarefas (
  id uuid primary key,
  user_id uuid not null,
  titulo text not null,
  codigo text,
  tipo_teste text,
  sistema text,
  versao text,
  executado_em date,
  status text,
  descricao text,
  explicacao text,
  causa text,
  correcao text,
  conclusao text,
  observacoes text,
  empresa text,
  base_teste text,
  testador text,
  publica boolean not null default false,
  updated_at timestamptz default now()
);
create table public.qa_cenarios (
  id uuid primary key,
  tarefa_id uuid not null references public.qa_tarefas(id),
  user_id uuid not null,
  titulo text not null,
  ordem integer not null,
  passos text,
  esperado text,
  obtido text,
  observacoes text,
  status text
);
create table public.qa_diagramas (
  id uuid primary key,
  tarefa_id uuid not null references public.qa_tarefas(id),
  user_id uuid not null,
  titulo text not null,
  conteudo text not null,
  created_at timestamptz not null default now()
);

insert into public.qa_tarefas (
  id,user_id,titulo,codigo,tipo_teste,sistema,versao,executado_em,
  status,descricao,empresa,base_teste,testador,publica
) values
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',
  'Public synthetic QA task','PUB-1','BUILD','Fixture','1.0','2026-11-07',
  'rascunho','Public fixture description','PRIVATE_COMPANY_MARKER',
  'PRIVATE_TEST_DB_MARKER','PRIVATE_TESTER_MARKER',true),
 ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',
  'Private A fixture','A-1','BUILD','Fixture','1.0','2026-11-07',
  'rascunho','Owner A private content',null,null,null,false),
 ('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222',
  'Private B fixture','B-1','RELEASE','Fixture','1.0','2026-11-07',
  'rascunho','Owner B private content',null,null,null,false);

insert into public.qa_cenarios(id,tarefa_id,user_id,titulo,ordem,passos,esperado,obtido,status)
values
 ('66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111','Public scenario fixture',1,
  'Check fixture screen','Shows fixture','Observed fixture','nao_executado'),
 ('88888888-8888-4888-8888-888888888888','55555555-5555-4555-8555-555555555555',
  '22222222-2222-4222-8222-222222222222','Private scenario fixture',1,
  'Private step','Private expectation',null,'nao_executado');

insert into public.qa_diagramas(id,tarefa_id,user_id,titulo,conteudo)
values
 ('77777777-7777-4777-8777-777777777777','33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111','Public diagram fixture','flowchart LR; A-->B'),
 ('99999999-9999-4999-8999-999999999999','55555555-5555-4555-8555-555555555555',
  '22222222-2222-4222-8222-222222222222','Private diagram fixture','flowchart LR; X-->Y');

alter table public.qa_tarefas enable row level security;
alter table public.qa_cenarios enable row level security;
alter table public.qa_diagramas enable row level security;

create policy qa_tarefas_por_proprietario on public.qa_tarefas
  for all to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));
create policy qa_cenarios_por_proprietario on public.qa_cenarios
  for all to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));
create policy qa_diagramas_por_proprietario on public.qa_diagramas
  for all to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));

-- Intentionally reproduce the broad legacy published-row policies.
create policy qa_tarefas_public_read on public.qa_tarefas
  for select to anon,authenticated using (publica=true);
create policy qa_cenarios_public_read on public.qa_cenarios
  for select to anon,authenticated using (
    exists (select 1 from public.qa_tarefas t where t.id=tarefa_id and t.publica=true));
create policy qa_diagramas_public_read on public.qa_diagramas
  for select to anon,authenticated using (
    exists (select 1 from public.qa_tarefas t where t.id=tarefa_id and t.publica=true));

grant select on public.qa_tarefas,public.qa_cenarios,public.qa_diagramas to anon,authenticated;
grant insert,update,delete on public.qa_tarefas,public.qa_cenarios,public.qa_diagramas to authenticated;

-- Test-only invoker assertions. Not part of the actual deployed migrations.
create function public.qa_assert(pass boolean,description text)
returns void language plpgsql security invoker as $fn$
begin
  if pass is distinct from true then
    raise exception 'QA public contract failed: %', description;
  end if;
end;
$fn$;
create function public.qa_keys_exact(payload jsonb,expected text[])
returns boolean language sql immutable security invoker as $fn$
  select (select coalesce(array_agg(v.k order by v.k),array[]::text[])
          from pg_catalog.jsonb_object_keys(payload) as v(k))
       = (select coalesce(array_agg(v.k order by v.k),array[]::text[])
          from pg_catalog.unnest(expected) as v(k));
$fn$;
grant execute on function public.qa_assert(boolean,text) to anon,authenticated;
grant execute on function public.qa_keys_exact(jsonb,text[]) to anon,authenticated;
