-- SECURITY WARNING (issue #37): LEGACY / NOT SAFE AS A PUBLIC DATA API.
-- Row-level SELECT and table-wide grants below do NOT mask private columns
-- (user_id, empresa, base_teste, testador etc.) in published records.
-- DO NOT reapply this file as a current security fix. See:
-- supabase/qa_public_read_api.sql and qa_public_read_lockdown.sql
-- for a staged, controlled migration and independent RLS verification.
-- Public QA sharing is OPT-IN. All existing TFs remain private.
alter table public.qa_tarefas
  add column if not exists publica boolean not null default false;
create index if not exists qa_tarefas_publicas_idx
  on public.qa_tarefas (executado_em desc, id) where publica = true;

-- Anonymous guests and signed-in readers may view only intentionally published TFs.
-- Existing owner/admin FOR ALL policies continue to control writes.
grant select on public.qa_tarefas, public.qa_cenarios, public.qa_diagramas to anon, authenticated;
create policy qa_tarefas_public_read
  on public.qa_tarefas for select to anon, authenticated
  using (publica = true);

create policy qa_cenarios_public_read
  on public.qa_cenarios for select to anon, authenticated
  using (
    exists (
      select 1 from public.qa_tarefas t
      where t.id = qa_cenarios.tarefa_id and t.publica = true
    )
  );

create policy qa_diagramas_public_read
  on public.qa_diagramas for select to anon, authenticated
  using (
    exists (
      select 1 from public.qa_tarefas t
      where t.id = qa_diagramas.tarefa_id and t.publica = true
    )
  );
