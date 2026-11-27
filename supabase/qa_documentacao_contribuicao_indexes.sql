-- Cover the auth.users foreign keys used by attachment ownership and version authorship.
create index if not exists qa_documentacao_arquivos_user_idx
  on public.qa_documentacao_arquivos(user_id);

create index if not exists qa_documentacao_versoes_user_idx
  on public.qa_documentacao_versoes(user_id);
