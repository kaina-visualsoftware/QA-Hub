-- R3 supplemental index identified by the Supabase performance advisor.
-- Covers the composite foreign key on (tarefa_id,user_id).
create index if not exists qa_r3_context_task_owner_fk_idx
  on public.qa_geracao_contextos(tarefa_id,user_id);
