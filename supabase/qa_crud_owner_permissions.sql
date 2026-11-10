-- QA Hub: owner-scoped CRUD on user-created records.
-- Audit events, requirement source versions and generated-document versions remain immutable.
-- All policies are role-restricted and check the signed-in owner's task.
begin;

grant update(titulo,passos,esperado,observacoes,modulo,tipo_teste)
  on public.qa_modelos_cenario to authenticated;
drop policy if exists qa_models_owner_update on public.qa_modelos_cenario;
create policy qa_models_owner_update on public.qa_modelos_cenario
  for update to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));

grant update(nome) on public.qa_equipes to authenticated;
drop policy if exists qa_teams_owner_update on public.qa_equipes;
create policy qa_teams_owner_update on public.qa_equipes
  for update to authenticated
  using (owner_id=(select auth.uid()))
  with check (owner_id=(select auth.uid()));

grant delete on public.qa_requisitos to authenticated;
drop policy if exists qa_requisitos_owner_delete on public.qa_requisitos;
create policy qa_requisitos_owner_delete on public.qa_requisitos
  for delete to authenticated
  using (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  );

grant update(descricao), delete on public.qa_evidencia_arquivos to authenticated;
drop policy if exists qa_files_owner_delete on public.qa_evidencia_arquivos;
create policy qa_files_owner_delete on public.qa_evidencia_arquivos
  for delete to authenticated
  using (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  );

grant update(tipo,resumo,referencia,cenario_id), delete
  on public.qa_evidencias to authenticated;
drop policy if exists qa_evidencias_owner_update on public.qa_evidencias;
create policy qa_evidencias_owner_update on public.qa_evidencias
  for update to authenticated
  using (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  )
  with check (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
    and (
      cenario_id is null or exists (
        select 1 from public.qa_cenarios s
        where s.id=cenario_id and s.tarefa_id=qa_evidencias.tarefa_id
      )
    )
  );
drop policy if exists qa_evidencias_owner_delete on public.qa_evidencias;
create policy qa_evidencias_owner_delete on public.qa_evidencias
  for delete to authenticated
  using (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  );

grant update(texto), delete on public.qa_tarefa_comentarios to authenticated;
drop policy if exists qa_comments_author_update on public.qa_tarefa_comentarios;
create policy qa_comments_author_update on public.qa_tarefa_comentarios
  for update to authenticated
  using (
    user_id=(select auth.uid())
    and qa_private.f5_comment_task(tarefa_id)
  )
  with check (
    user_id=(select auth.uid())
    and qa_private.f5_comment_task(tarefa_id)
  );
drop policy if exists qa_comments_author_delete on public.qa_tarefa_comentarios;
create policy qa_comments_author_delete on public.qa_tarefa_comentarios
  for delete to authenticated
  using (
    user_id=(select auth.uid())
    and qa_private.f5_view_task(tarefa_id)
  );

grant delete on public.qa_release_tarefas to authenticated;
drop policy if exists qa_release_link_owner_delete on public.qa_release_tarefas;
create policy qa_release_link_owner_delete on public.qa_release_tarefas
  for delete to authenticated
  using (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  );

-- A saved document version is immutable; editing produces a NEW version.
-- The owner can explicitly delete any specific saved version.
grant delete on public.qa_documentos to authenticated;
drop policy if exists qa_documents_owner_delete on public.qa_documentos;
create policy qa_documents_owner_delete on public.qa_documentos
  for delete to authenticated
  using (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  );

commit;
