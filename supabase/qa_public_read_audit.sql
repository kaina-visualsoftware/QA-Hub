-- QA Hub / issue #37 — READ-ONLY database permission audit.
-- Safe to run for metadata inspection: does not read TF contents, execute
-- mutations, modify Auth settings or access Storage objects.
-- It only answers whether the unsafe direct public read path is open.
with target_tables(table_name) as (
  values ('qa_tarefas'), ('qa_cenarios'), ('qa_diagramas')
),
table_permissions as (
  select t.table_name,
    coalesce(c.relrowsecurity,false) as rls_enabled,
    pg_catalog.has_table_privilege(
      'anon', format('public.%I', t.table_name), 'SELECT') as anon_select,
    pg_catalog.has_table_privilege(
      'authenticated',format('public.%I', t.table_name),'SELECT') as authenticated_select,
    exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname='public' and p.tablename=t.table_name
        and p.cmd in ('SELECT','ALL')
        and p.roles && array['anon','public']::name[]
    ) as public_read_policy
  from target_tables t
  left join pg_catalog.pg_class c on c.relname = t.table_name
    and c.relnamespace='public'::pg_catalog.regnamespace
)
select table_name,rls_enabled,anon_select,authenticated_select,public_read_policy,
  (anon_select and public_read_policy) as anonymous_can_request_published_rows
from table_permissions order by table_name;

-- After the compatible clients + database lockdown are deployed,
-- anonymous_can_request_published_rows MUST be false for every table.
-- The owner and administrator paths under RLS require separate staging tests.
-- A false here does not guarantee the entire security configuration is safe.
