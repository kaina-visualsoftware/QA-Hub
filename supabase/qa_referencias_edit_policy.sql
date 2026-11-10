-- Allow owners to edit private QA reference content without changing ownership.
-- Retain SELECT/INSERT/DELETE policies and never grant broad table-level UPDATE.
grant update (categoria,titulo,conteudo) on public.qa_referencias to authenticated;

create policy qa_referencias_update on public.qa_referencias
  for update to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));
