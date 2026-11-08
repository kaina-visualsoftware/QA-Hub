-- PostgreSQL contract tests BEFORE revoking old SELECT permissions.
-- Run only against the disposable fixture created by qa_public_fixture.sql.
select public.qa_assert(
  not pg_catalog.has_function_privilege('unrelated_role',
      'public.qa_public_tasks_v1()','EXECUTE')
  and not pg_catalog.has_function_privilege('unrelated_role',
      'public.qa_public_task_v1(uuid)','EXECUTE'),
  'Unrelated database roles must not inherit access to privileged RPCs');

-- The deliberately vulnerable fixture MUST expose a published row through
-- the old path, or the lockdown tests would not prove anything meaningful.
set role anon;
select public.qa_assert(
  (select count(*) from public.qa_tarefas
   where empresa='PRIVATE_COMPANY_MARKER')=1,
  'Fixture should reproduce pre-cutover broad column grants');
select public.qa_assert(
  (select count(*) from public.qa_public_tasks_v1())=1,
  'Anonymous list RPC should expose exactly one published fixture');
select public.qa_assert(
  (select bool_and(public.qa_keys_exact(t.value,
    array['id','titulo','codigo','tipo_teste','sistema','versao','executado_em']))
   from public.qa_public_tasks_v1() as t(value)),
  'Anonymous list must expose exactly its public columns');
select public.qa_assert(
  (select public.qa_public_task_v1(
    '44444444-4444-4444-8444-444444444444'::uuid) is null),
  'Private owner-A task must not be exposed through detail RPC');
select public.qa_assert(
  (select public.qa_public_task_v1(
    '55555555-5555-4555-8555-555555555555'::uuid) is null),
  'Private owner-B task must not be exposed through detail RPC');

select public.qa_assert(
  public.qa_keys_exact(
    (public.qa_public_task_v1(
      '33333333-3333-4333-8333-333333333333'::uuid))->'task',
    array['id','titulo','codigo','tipo_teste','sistema','versao',
          'executado_em','status','descricao','explicacao','causa','correcao',
          'conclusao','observacoes']),
  'Published task detail must expose exactly its allowlisted fields');
select public.qa_assert(
  ((public.qa_public_task_v1(
    '33333333-3333-4333-8333-333333333333'::uuid))->'task'->>'descricao')
      ='Public fixture description',
  'Public task detail must preserve allowed description');
select public.qa_assert(
  pg_catalog.jsonb_array_length((public.qa_public_task_v1(
    '33333333-3333-4333-8333-333333333333'::uuid))->'scenarios')=1,
  'Only published scenario is returned');
select public.qa_assert(
  pg_catalog.jsonb_array_length((public.qa_public_task_v1(
    '33333333-3333-4333-8333-333333333333'::uuid))->'diagrams')=1,
  'Only published diagram is returned');
select public.qa_assert(
  public.qa_keys_exact(
    (public.qa_public_task_v1(
      '33333333-3333-4333-8333-333333333333'::uuid))->'scenarios'->0,
    array['id','titulo','ordem','passos','esperado','obtido','observacoes','status']),
  'Scenario RPC fields must be strictly allowlisted');
select public.qa_assert(
  public.qa_keys_exact(
    (public.qa_public_task_v1(
      '33333333-3333-4333-8333-333333333333'::uuid))->'diagrams'->0,
    array['id','titulo','conteudo']),
  'Diagram RPC fields must be strictly allowlisted');
reset role;

-- A user who is not the publisher must still see the public projection,
-- without gaining private-task access.
set role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
select public.qa_assert(
  (select count(*) from public.qa_public_tasks_v1())=1,
  'Authenticated non-owner should see published RPC list');
select public.qa_assert(
  public.qa_public_task_v1('44444444-4444-4444-8444-444444444444'::uuid) is null,
  'Authenticated non-owner must not see private task via RPC');
reset role;

\echo 'PASS: public RPC projection and privacy contract before lockdown'
