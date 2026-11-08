-- After Phase B, test actual PostgreSQL privileges, RLS and RPC behavior.
-- These are synthetic rows in a disposable PostgreSQL Actions service.
select public.qa_assert(
  (select count(*) from pg_catalog.pg_policies
   where schemaname='public' and tablename in
     ('qa_tarefas','qa_cenarios','qa_diagramas')
     and cmd in ('SELECT','ALL')
     and roles && array['anon','public']::name[])=0,
  'Lockdown must leave no anonymous/public SELECT policies');
select public.qa_assert(
  not pg_catalog.has_table_privilege('anon','public.qa_tarefas','SELECT')
  and not pg_catalog.has_table_privilege('anon','public.qa_cenarios','SELECT')
  and not pg_catalog.has_table_privilege('anon','public.qa_diagramas','SELECT'),
  'Anonymous readers must lose direct table SELECT');
select public.qa_assert(
  (select count(*) from pg_catalog.pg_class c
   where c.relnamespace='public'::pg_catalog.regnamespace
     and c.relname in ('qa_tarefas','qa_cenarios','qa_diagramas')
     and c.relrowsecurity)=3,
  'All operational tables must retain RLS');
select public.qa_assert(
  pg_catalog.has_function_privilege('anon','public.qa_public_tasks_v1()','EXECUTE')
  and pg_catalog.has_function_privilege('authenticated','public.qa_public_task_v1(uuid)','EXECUTE'),
  'Public projection RPCs must remain callable after lockdown');

set role anon;
do $test$
declare target text;
begin
  foreach target in array array['qa_tarefas','qa_cenarios','qa_diagramas'] loop
    begin
      execute format('select 1 from public.%I limit 1',target);
      raise exception 'Anonymous direct table SELECT unexpectedly allowed: %',target;
    exception when insufficient_privilege then
      null; -- This is the required outcome.
    end;
  end loop;
end;
$test$;

select public.qa_assert((select count(*) from public.qa_public_tasks_v1())=1,
  'Anonymous RPC list still works without direct table grants');
select public.qa_assert(
  (public.qa_public_task_v1(
    '33333333-3333-4333-8333-333333333333'::uuid))->'task'->>'titulo'
    ='Public synthetic QA task',
  'Anonymous RPC detail still works without direct table grants');
select public.qa_assert(
  public.qa_public_task_v1('44444444-4444-4444-8444-444444444444'::uuid) is null,
  'Anonymous RPC cannot read private owner-A task');
reset role;

-- User B is NOT the publisher. This checks the row-level policies still
-- isolate raw tables while the allowlisted public RPC remains usable.
set role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);
select public.qa_assert(
  (select count(*) from public.qa_tarefas)=1,
  'User B must read only its own raw task (not published A)');
select public.qa_assert(
  (select count(*) from public.qa_cenarios)=1,
  'User B must read only its own raw scenario');
select public.qa_assert(
  (select count(*) from public.qa_diagramas)=1,
  'User B must read only its own raw diagram');
select public.qa_assert(
  (select count(*) from public.qa_public_tasks_v1())=1,
  'User B must retain public list RPC');
select public.qa_assert(
  public.qa_public_task_v1('33333333-3333-4333-8333-333333333333'::uuid)
    is not null,
  'User B must retain published detail RPC');
select public.qa_assert(
  public.qa_public_task_v1('44444444-4444-4444-8444-444444444444'::uuid)
    is null,
  'User B cannot read private A data through RPC');
with attempted as (
  update public.qa_tarefas set publica=false
  where id='33333333-3333-4333-8333-333333333333'::uuid
  returning id
)
select public.qa_assert((select count(*) from attempted)=0,
  'User B must not unpublish A task through raw table UPDATE');
reset role;

-- User A may update only their own task. Publication revocation must
-- hide the task immediately from the RPC, and restore it when re-published.
set role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
select public.qa_assert(
  (select count(*) from public.qa_tarefas)=2,
  'User A must read its own published and private tasks');
update public.qa_tarefas set publica=false
where id='33333333-3333-4333-8333-333333333333'::uuid;
select public.qa_assert(
  (select count(*) from public.qa_public_tasks_v1())=0,
  'Unpublishing must remove task from RPC list');
select public.qa_assert(
  public.qa_public_task_v1('33333333-3333-4333-8333-333333333333'::uuid) is null,
  'Unpublishing must remove task from RPC detail');
update public.qa_tarefas set publica=true
where id='33333333-3333-4333-8333-333333333333'::uuid;
select public.qa_assert(
  (select count(*) from public.qa_public_tasks_v1())=1,
  'Republishing fixture should restore public visibility');
reset role;

\echo 'PASS: revoked anonymous table access, owner isolation, public RPC and unpublish invalidation'
