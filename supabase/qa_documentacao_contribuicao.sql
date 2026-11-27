-- Allow authenticated users to contribute (edit) public documentations (wiki-style).
-- Original author remains owner; any signed-in user may edit text and attachments of public docs.
begin;

-- Helper: can the current user contribute to this documentation?
create or replace function public.qa_can_contribute_documentacao(p_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.qa_referencias d
    where d.id::text = p_id
      and (d.publica or d.user_id = (select auth.uid()))
  );
$$;
revoke all on function public.qa_can_contribute_documentacao(text) from public;
grant execute on function public.qa_can_contribute_documentacao(text) to authenticated;

-- Update policy: owner always; any authenticated may edit public docs.
drop policy if exists qa_referencias_update on public.qa_referencias;
create policy qa_referencias_update on public.qa_referencias for update to authenticated
 using (user_id = (select auth.uid()) or publica)
 with check (
   (user_id = (select auth.uid()) and
     (tarefa_id is null or exists(
       select 1 from public.qa_tarefas t
       where t.id = tarefa_id and t.user_id = (select auth.uid()))))
   or
   (publica and user_id = (select d.user_id from public.qa_referencias d where d.id = id))
 );
grant update(categoria,titulo,conteudo,publica,tipo_documentacao,tarefa_id,updated_at) on public.qa_referencias to authenticated;

-- Attachments: allow insert by contributor on public docs.
drop policy if exists qa_doc_files_insert on public.qa_documentacao_arquivos;
create policy qa_doc_files_insert on public.qa_documentacao_arquivos for insert to authenticated with check(
  user_id = (select auth.uid())
  and exists(select 1 from public.qa_referencias d
     where d.id = documentacao_id
       and (d.user_id = (select auth.uid()) or d.publica))
  and exists(select 1 from storage.objects o where o.bucket_id='qa-documentacoes' and o.name=path)
);

-- Attachments: allow delete by contributor on public docs.
drop policy if exists qa_doc_files_delete on public.qa_documentacao_arquivos;
create policy qa_doc_files_delete on public.qa_documentacao_arquivos for delete to authenticated using(
  exists(select 1 from public.qa_referencias d
     where d.id = documentacao_id
       and (d.user_id = (select auth.uid()) or d.publica))
);

-- Storage: allow upload by contributor on public docs.
drop policy if exists qa_doc_storage_insert on storage.objects;
create policy qa_doc_storage_insert on storage.objects for insert to authenticated with check(
  bucket_id = 'qa-documentacoes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.qa_can_contribute_documentacao((storage.foldername(name))[2])
);

-- Version history table.
create table if not exists public.qa_documentacao_versoes(
  id uuid primary key default gen_random_uuid(),
  documentacao_id uuid not null references public.qa_referencias(id) on delete cascade,
  user_id uuid references auth.users(id),
  titulo text,
  conteudo text,
  tipo_documentacao text,
  created_at timestamptz not null default now()
);
create index if not exists qa_documentacao_versoes_doc_idx
  on public.qa_documentacao_versoes(documentacao_id, created_at desc);
alter table public.qa_documentacao_versoes enable row level security;
revoke all on public.qa_documentacao_versoes from anon,authenticated;
grant select(id,documentacao_id,user_id,titulo,conteudo,tipo_documentacao,created_at)
  on public.qa_documentacao_versoes to authenticated;
grant insert on public.qa_documentacao_versoes to authenticated;

drop policy if exists qa_doc_versions_read on public.qa_documentacao_versoes;
create policy qa_doc_versions_read on public.qa_documentacao_versoes for select to authenticated
 using (public.qa_can_read_documentacao(documentacao_id));

drop policy if exists qa_doc_versions_insert on public.qa_documentacao_versoes;
create policy qa_doc_versions_insert on public.qa_documentacao_versoes for insert to authenticated
 with check (user_id = (select auth.uid()) and public.qa_can_contribute_documentacao(documentacao_id::text));

-- Snapshot trigger: save previous version on content change.
create or replace function public.qa_documentacao_version_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (old.titulo is distinct from new.titulo
      or old.conteudo is distinct from new.conteudo
      or old.tipo_documentacao is distinct from new.tipo_documentacao) then
    insert into public.qa_documentacao_versoes(documentacao_id, user_id, titulo, conteudo, tipo_documentacao)
    values (old.id, (select auth.uid()), old.titulo, old.conteudo, old.tipo_documentacao);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists qa_documentacao_version on public.qa_referencias;
create trigger qa_documentacao_version
  before update on public.qa_referencias
  for each row execute function public.qa_documentacao_version_snapshot();

commit;
