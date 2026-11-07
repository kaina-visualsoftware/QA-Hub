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
