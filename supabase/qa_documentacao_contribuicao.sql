-- Allow authenticated users to contribute to public documentation without changing ownership,
-- visibility, or the original TF link. Anonymous readers continue using the allowlisted RPC.
begin;

-- UPDATE needs a matching SELECT policy. Keep anonymous access on the safe RPC only.
drop policy if exists qa_referencias_public_read_authenticated on public.qa_referencias;
create policy qa_referencias_public_read_authenticated
  on public.qa_referencias for select to authenticated
  using (publica = true);

drop policy if exists qa_referencias_update on public.qa_referencias;
create policy qa_referencias_update
  on public.qa_referencias for update to authenticated
  using (user_id = (select auth.uid()) or publica = true)
  with check (user_id = (select auth.uid()) or publica = true);

grant update(categoria,titulo,conteudo,publica,tipo_documentacao,tarefa_id,updated_at)
  on public.qa_referencias to authenticated;

-- Version history is readable only by authenticated users who can read the document.
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
revoke all on table public.qa_documentacao_versoes from public, anon, authenticated;
grant select(id,documentacao_id,user_id,titulo,conteudo,tipo_documentacao,created_at)
  on public.qa_documentacao_versoes to authenticated;
grant insert(documentacao_id,user_id,titulo,conteudo,tipo_documentacao)
  on public.qa_documentacao_versoes to authenticated;

drop policy if exists qa_doc_versions_read on public.qa_documentacao_versoes;
create policy qa_doc_versions_read
  on public.qa_documentacao_versoes for select to authenticated
  using (exists (
    select 1 from public.qa_referencias d
    where d.id = documentacao_id
      and (d.user_id = (select auth.uid()) or d.publica = true)
  ));

drop policy if exists qa_doc_versions_insert on public.qa_documentacao_versoes;
create policy qa_doc_versions_insert
  on public.qa_documentacao_versoes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.qa_referencias d
      where d.id = documentacao_id
        and (d.user_id = (select auth.uid()) or d.publica = true)
    )
  );

-- The trigger runs as the caller. It records the previous content and protects
-- owner-controlled fields when another authenticated user contributes.
create or replace function public.qa_documentacao_before_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is not null and v_actor is distinct from old.user_id then
    if old.publica is not true then
      raise exception 'Somente o proprietário pode editar uma documentação privada.'
        using errcode = '42501';
    end if;

    if new.user_id is distinct from old.user_id
       or new.publica is distinct from old.publica
       or new.tarefa_id is distinct from old.tarefa_id then
      raise exception 'Colaboradores não podem alterar proprietário, visibilidade ou vínculo com TF.'
        using errcode = '42501';
    end if;
  end if;

  if old.titulo is distinct from new.titulo
     or old.conteudo is distinct from new.conteudo
     or old.tipo_documentacao is distinct from new.tipo_documentacao then
    insert into public.qa_documentacao_versoes(
      documentacao_id,user_id,titulo,conteudo,tipo_documentacao
    )
    values (
      old.id,v_actor,old.titulo,old.conteudo,old.tipo_documentacao
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.qa_documentacao_before_update() from public, anon;
grant execute on function public.qa_documentacao_before_update() to authenticated;

drop trigger if exists qa_documentacao_before_update on public.qa_referencias;
create trigger qa_documentacao_before_update
  before update on public.qa_referencias
  for each row execute function public.qa_documentacao_before_update();

-- Contributors may upload to public docs. Keep metadata deletion owner-only.
drop policy if exists qa_doc_files_insert on public.qa_documentacao_arquivos;
create policy qa_doc_files_insert
  on public.qa_documentacao_arquivos for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.qa_referencias d
      where d.id = documentacao_id
        and (d.user_id = (select auth.uid()) or d.publica = true)
    )
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'qa-documentacoes' and o.name = path
    )
  );

drop policy if exists qa_doc_files_delete on public.qa_documentacao_arquivos;
create policy qa_doc_files_delete
  on public.qa_documentacao_arquivos for delete to authenticated
  using (exists (
    select 1 from public.qa_referencias d
    where d.id = documentacao_id
      and d.user_id = (select auth.uid())
  ));

-- A contributor must be able to see their own just-uploaded object before its
-- metadata row is inserted; registered objects remain readable only through
-- the document's existing public/owner read rule.
drop policy if exists qa_doc_storage_read on storage.objects;
drop policy if exists qa_doc_storage_read_anon on storage.objects;
drop policy if exists qa_doc_storage_read_authenticated on storage.objects;

-- Anonymous readers can download only objects already registered as attachments
-- of a public document. This path uses the existing, allowlisted read helper.
create policy qa_doc_storage_read_anon
  on storage.objects for select to anon
  using (
    bucket_id = 'qa-documentacoes'
    and exists (
      select 1 from public.qa_documentacao_arquivos f
      where f.path = objects.name
        and public.qa_can_read_documentacao(f.documentacao_id)
    )
  );

-- An authenticated uploader can also read their own object between the Storage
-- upload and the metadata INSERT. Other users see only registered public files.
create policy qa_doc_storage_read_authenticated
  on storage.objects for select to authenticated
  using (
    bucket_id = 'qa-documentacoes'
    and (
      (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and exists (
          select 1 from public.qa_referencias d
          where d.id::text = (storage.foldername(name))[2]
            and (d.user_id = (select auth.uid()) or d.publica = true)
        )
      )
      or exists (
        select 1 from public.qa_documentacao_arquivos f
        where f.path = objects.name
          and public.qa_can_read_documentacao(f.documentacao_id)
      )
    )
  );

drop policy if exists qa_doc_storage_insert on storage.objects;
create policy qa_doc_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'qa-documentacoes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.qa_referencias d
      where d.id::text = (storage.foldername(name))[2]
        and (d.user_id = (select auth.uid()) or d.publica = true)
    )
  );

-- The document owner can clean up a contributor's object after removing its
-- metadata; the uploader can also clean up their own unregistered object.
drop policy if exists qa_doc_storage_delete on storage.objects;
create policy qa_doc_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'qa-documentacoes'
    and not exists (
      select 1 from public.qa_documentacao_arquivos f
      where f.path = objects.name
    )
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.qa_referencias d
        where d.id::text = (storage.foldername(name))[2]
          and d.user_id = (select auth.uid())
      )
    )
  );

commit;
