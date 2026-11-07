-- Issue #37: public-read lockdown (Phase B, staging FIRST).
-- Precondition: the React and legacy public pages use qa_public_tasks_v1 /
-- qa_public_task_v1 and both work with anon + authenticated sessions.
-- Review all current policies and privilege inheritance BEFORE applying.
-- Do not apply to production until verified with two isolated test accounts.
begin;

-- These old policies exposed every column in a published row to any caller
-- holding the table-level SELECT permission; frontend projections cannot fix it.
drop policy if exists qa_tarefas_public_read on public.qa_tarefas;
drop policy if exists qa_cenarios_public_read on public.qa_cenarios;
drop policy if exists qa_diagramas_public_read on public.qa_diagramas;

-- Anonymous visitors only need the explicitly granted RPC endpoint.
revoke select on public.qa_tarefas from anon;
revoke select on public.qa_cenarios from anon;
revoke select on public.qa_diagramas from anon;

-- Fail the entire transaction if an unexpected grant or public SELECT
-- policy still exposes operational records. Do not treat a successful DROP
-- of three known policies as proof there are no others.
do $lockdown_guard$
declare
  table_name text;
begin
  if to_regprocedure('public.qa_public_tasks_v1()') is null
      or to_regprocedure('public.qa_public_task_v1(uuid)') is null then
    raise exception 'Public allowlist RPCs are not installed; aborting lockdown';
  end if;
  if not pg_catalog.has_function_privilege('anon','public.qa_public_tasks_v1()','EXECUTE')
      or not pg_catalog.has_function_privilege('anon','public.qa_public_task_v1(uuid)','EXECUTE') then
    raise exception 'Public read RPCs are not granted to anonymous visitors';
  end if;

  foreach table_name in array array['qa_tarefas','qa_cenarios','qa_diagramas'] loop
    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name
        and c.relrowsecurity is true
    ) then
      raise exception 'RLS missing on %. Abort', table_name;
    end if;
    if pg_catalog.has_table_privilege('anon', format('public.%I',table_name),'SELECT') then
      raise exception 'Anonymous SELECT privilege remains on %. Abort', table_name;
    end if;
    if exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = table_name
        and p.cmd in ('SELECT','ALL')
        and p.roles && array['anon','public']::name[]
    ) then
      raise exception 'Other public SELECT policies remain on %. Abort', table_name;
    end if;
    -- Explicitly reject unfamiliar SELECT/ALL policies for authenticated
    -- users too. A newly added TO authenticated USING (publica = true)
    -- would otherwise expose all columns of another user's published TF.
    -- Existing owner and admin policies from this project are the ONLY
    -- read-capable policies permitted after removing the public-read ones.
    if exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = table_name
        and p.cmd in ('SELECT','ALL')
        and p.policyname not in (
          table_name || '_por_proprietario',
          'qa_admin_' || substring(table_name from 4) || '_full_access'
        )
    ) then
      raise exception 'Unexpected SELECT/ALL policy remains on %. Abort', table_name;
    end if;
    -- Check the known policies have not silently changed to permissive
    -- SELECT rules (USING true), or been granted to a broader role.
    -- These simple catalog guards do not replace real two-user RLS tests.
    if exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = table_name
        and p.cmd in ('SELECT','ALL')
        and p.policyname in (
          table_name || '_por_proprietario',
          'qa_admin_' || substring(table_name from 4) || '_full_access'
        )
        and (
          p.roles <> array['authenticated']::name[]
          or p.qual is null
          or p.qual not like '%auth.uid%'
          or (
            p.policyname = table_name || '_por_proprietario'
            and p.qual not like '%user_id%'
          )
          or (
            p.policyname = 'qa_admin_' || substring(table_name from 4) || '_full_access'
            and p.qual not like '%qa_admins%'
          )
        )
    ) then
      raise exception 'Known owner/admin policy is unexpectedly broad on %. Abort', table_name;
    end if;
  end loop;
end
$lockdown_guard$;

-- Authenticated owner/admin read policies and all writes remain untouched.
-- Their existing row-level policies MUST be inspected and verified in staging:
-- a different permissive SELECT policy may still reveal published records.
commit;

-- POST-CUTOVER VERIFICATION (staging, NOT a substitute for DB policy audit):
-- 1. anon + unrelated authenticated: public RPC reads listed allowed fields,
--    published child rows and returns null for a private / unpublished TF.
-- 2. anon + unrelated authenticated: direct qa_tarefas/qa_cenarios/qa_diagramas
--    SELECT (including user_id, empresa, base_teste, testador) is denied.
-- 3. owner can read/write own TF; unrelated user cannot read private TF.
-- 4. admin continues to see only records authorized by current RLS;
--    public.html / React #/publicas work without login.
-- 5. Other permissive RLS policies / inherited grants are checked manually.
