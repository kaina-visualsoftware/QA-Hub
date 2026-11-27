-- Allow authenticated users to contribute to public documentation without changing
-- ownership, visibility, or the original TF link. Anonymous access remains read-only.
begin;

-- Version history: only authenticated readers can inspect snapshots.
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

drop policy if exists qa_doc_versions_read on public.qa_documentacao_versoes;
create policy qa_doc_versions_read
  on public.qa_documentacao_versoes for select to authenticated
  using (public.qa_can_read_documentacao(documentacao_id));

drop policy if exists qa_doc_versions_insert on public.qa_documentacao_versoes;

-- Private trigger function: it snapshots the old content and prevents contributors
-- from changing owner-controlled fields. It is not exposed through the Data API.
create schema if not exists private;
create or replace function private.qa_documentacao_before_update()
returns trigger
language plpgsql
security definer
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
revoke all on function private.qa_documentacao_before_update() from public, anon, authenticated;

drop trigger if exists qa_documentacao_before_update on public.qa_referencias;
create trigger qa_documentacao_before_update
  before update on public.qa_referencias
  for each row execute function private.qa_documentacao_before_update();

-- Narrow SECURITY DEFINER RPC: authenticated users can edit only the content
-- fields of a row that is public at the time of the update. The function never
-- accepts or changes user_id, publica, or tarefa_id, and returns no owner ID.
create or replace function public.qa_contribute_public_documentacao(
  p_id uuid,
  p_titulo text,
  p_conteudo text,
  p_tipo_documentacao text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.qa_referencias%rowtype;
begin
  if v_actor is null then
    raise exception 'Autenticação obrigatória para contribuir.'
      using errcode = '42501';
  end if;

  if p_tipo_documentacao is null
     or p_tipo_documentacao not in ('nota','manual','solucao','tarefa','checklist') then
    raise exception 'Tipo de documentação inválido.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_titulo,''))) not between 3 and 160 then
    raise exception 'O título deve ter entre 3 e 160 caracteres.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_conteudo,''))) not between 3 and 80000 then
    raise exception 'O conteúdo deve ter entre 3 e 80000 caracteres.' using errcode = '22023';
  end if;

  update public.qa_referencias d
     set titulo = btrim(p_titulo),
         conteudo = btrim(p_conteudo),
         tipo_documentacao = p_tipo_documentacao,
         categoria = case when p_tipo_documentacao = 'checklist' then 'checklist' else 'nota' end
   where d.id = p_id
     and d.publica = true
   returning d.* into v_row;

  if not found then
    raise exception 'Documentação inexistente ou não pública.'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id',v_row.id,
    'categoria',v_row.categoria,
    'titulo',v_row.titulo,
    'conteudo',v_row.conteudo,
    'tipo_documentacao',v_row.tipo_documentacao,
    'publica',v_row.publica,
    'created_at',v_row.created_at,
    'updated_at',v_row.updated_at
  );
end;
$$;
revoke all on function public.qa_contribute_public_documentacao(uuid,text,text,text) from public, anon;
grant execute on function public.qa_contribute_public_documentacao(uuid,text,text,text) to authenticated;

-- Contributors may upload to public docs. Only the document owner can remove
-- attachment metadata; the owner or uploader can clean up the orphaned object.
drop policy if exists qa_doc_files_insert on public.qa_documentacao_arquivos;
create policy qa_doc_files_insert
  on public.qa_documentacao_arquivos for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.qa_can_read_documentacao(documentacao_id)
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'qa-documentacoes' and o.name = path
    )
  );

drop policy if exists qa_doc_files_delete on public.qa_documentacao_arquivos;
create policy qa_doc_files_delete
  on public.qa_documentacao_arquivos for delete to authenticated
  using (public.qa_owns_documentacao(documentacao_id::text));

-- Anonymous users can download only objects already registered as attachments
-- of a public document.
drop policy if exists qa_doc_storage_read on storage.objects;
drop policy if exists qa_doc_storage_read_anon on storage.objects;
drop policy if exists qa_doc_storage_read_authenticated on storage.objects;
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

-- An authenticated uploader can read their own object between the Storage upload
-- and metadata INSERT; all registered public attachments remain readable.
create policy qa_doc_storage_read_authenticated
  on storage.objects for select to authenticated
  using (
    bucket_id = 'qa-documentacoes'
    and (
      (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and (storage.foldername(name))[2] ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.qa_can_read_documentacao(((storage.foldername(name))[2])::uuid)
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
    and (storage.foldername(name))[2] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.qa_can_read_documentacao(((storage.foldername(name))[2])::uuid)
  );

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
      or public.qa_owns_documentacao((storage.foldername(name))[2])
    )
  );

commit;
