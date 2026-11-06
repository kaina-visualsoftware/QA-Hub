-- R4 follow-up: index for the composite requirement FK in immutable revisions.
-- Helps cascade and referential checks without changing existing data.
create index if not exists qa_r4_revision_owner_fk_idx
  on public.qa_requisito_revisoes(requisito_id,tarefa_id,user_id);
