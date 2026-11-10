-- Extend existing account notes without copying or losing their IDs.
begin;
alter table public.qa_referencias
 add column if not exists publica boolean not null default false,
 add column if not exists tipo_documentacao text not null default 'nota',
 add column if not exists tarefa_id uuid references public.qa_tarefas(id) on delete set null,
 add column if not exists updated_at timestamptz not null default now();
alter table public.qa_referencias drop constraint if exists qa_referencias_conteudo_check;
alter table public.qa_referencias add constraint qa_referencias_conteudo_check
 check(char_length(btrim(conteudo)) between 3 and 80000);
alter table public.qa_referencias drop constraint if exists qa_documentacao_tipo;
alter table public.qa_referencias add constraint qa_documentacao_tipo
 check(tipo_documentacao in ('nota','manual','solucao','tarefa','checklist'));
create index if not exists qa_documentacao_publica_idx on public.qa_referencias(updated_at desc,id) where publica;
create index if not exists qa_documentacao_tf_idx on public.qa_referencias(tarefa_id) where tarefa_id is not null;
revoke all on public.qa_referencias from anon;
-- Existing owner policies remain; a link never grants edit access to a TF.
drop policy if exists qa_referencias_write on public.qa_referencias;
create policy qa_referencias_write on public.qa_referencias for insert to authenticated
 with check(user_id=(select auth.uid()) and (tarefa_id is null or exists(
  select 1 from public.qa_tarefas t where t.id=tarefa_id and t.user_id=(select auth.uid()))));
drop policy if exists qa_referencias_update on public.qa_referencias;
create policy qa_referencias_update on public.qa_referencias for update to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and
 (tarefa_id is null or exists(select 1 from public.qa_tarefas t where t.id=tarefa_id and t.user_id=(select auth.uid()))));
grant update(categoria,titulo,conteudo,publica,tipo_documentacao,tarefa_id,updated_at) on public.qa_referencias to authenticated;

create or replace function public.qa_public_documentacoes_v1(p_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'titulo',d.titulo,
 'conteudo',d.conteudo,
 'categoria',d.categoria,'tipo_documentacao',d.tipo_documentacao,'publica',d.publica,
 'tarefa_id',case when exists(select 1 from public.qa_tarefas t where t.id=d.tarefa_id and t.publica) then d.tarefa_id else null end,'created_at',d.created_at,'updated_at',d.updated_at)
 order by d.updated_at desc,d.id),'[]'::jsonb)
 from public.qa_referencias d where d.publica and (p_id is null or d.id=p_id);
$$;
revoke all on function public.qa_public_documentacoes_v1(uuid) from public;
grant execute on function public.qa_public_documentacoes_v1(uuid) to anon,authenticated;

create or replace function public.qa_can_read_documentacao(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.qa_referencias d where d.id=p_id
 and (d.publica or d.user_id=(select auth.uid())));
$$;
revoke all on function public.qa_can_read_documentacao(uuid) from public;
grant execute on function public.qa_can_read_documentacao(uuid) to anon,authenticated;

create or replace function public.qa_owns_documentacao(p_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.qa_referencias d where d.id::text=p_id and d.user_id=(select auth.uid()));
$$;
revoke all on function public.qa_owns_documentacao(text) from public;
grant execute on function public.qa_owns_documentacao(text) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('qa-documentacoes','qa-documentacoes',false,52428800,array[
 'image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/ogg',
 'application/pdf','text/plain','text/markdown','text/csv',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create table if not exists public.qa_documentacao_arquivos(
 id uuid primary key default gen_random_uuid(),documentacao_id uuid not null references public.qa_referencias(id) on delete restrict,
 user_id uuid not null references auth.users(id),nome text not null check(length(nome) between 1 and 240),
 mime text not null,tamanho bigint not null check(tamanho between 1 and 52428800),
 path text not null unique,created_at timestamptz not null default now(),
 constraint qa_doc_path check(path like user_id::text||'/'||documentacao_id::text||'/'||id::text||'.%'
 and path !~ '(\.\.|\\)' and array_length(string_to_array(path,'/'),1)=3)
);
create index if not exists qa_documentacao_arquivos_doc_idx on public.qa_documentacao_arquivos(documentacao_id);
alter table public.qa_documentacao_arquivos enable row level security;
revoke all on public.qa_documentacao_arquivos from anon,authenticated;
grant select(id,documentacao_id,nome,mime,tamanho,path,created_at) on public.qa_documentacao_arquivos to anon,authenticated;
grant insert,delete on public.qa_documentacao_arquivos to authenticated;
drop policy if exists qa_doc_files_read on public.qa_documentacao_arquivos;
create policy qa_doc_files_read on public.qa_documentacao_arquivos for select to anon,authenticated
 using(public.qa_can_read_documentacao(documentacao_id));
drop policy if exists qa_doc_files_insert on public.qa_documentacao_arquivos;
create policy qa_doc_files_insert on public.qa_documentacao_arquivos for insert to authenticated with check(
 user_id=(select auth.uid()) and exists(select 1 from public.qa_referencias d
 where d.id=documentacao_id and d.user_id=(select auth.uid()))
 and exists(select 1 from storage.objects o where o.bucket_id='qa-documentacoes' and o.name=path));
drop policy if exists qa_doc_files_delete on public.qa_documentacao_arquivos;
create policy qa_doc_files_delete on public.qa_documentacao_arquivos for delete to authenticated using(
 exists(select 1 from public.qa_referencias d where d.id=documentacao_id and d.user_id=(select auth.uid())));

-- The object must have registered metadata; uploaded orphans cannot be read.
drop policy if exists qa_doc_storage_read on storage.objects;
create policy qa_doc_storage_read on storage.objects for select to anon,authenticated using(
 bucket_id='qa-documentacoes' and (
 ((storage.foldername(name))[1]=(select auth.uid())::text and public.qa_owns_documentacao((storage.foldername(name))[2]))
 or exists(select 1 from public.qa_documentacao_arquivos f where f.path=name and public.qa_can_read_documentacao(f.documentacao_id))));
drop policy if exists qa_doc_storage_insert on storage.objects;
create policy qa_doc_storage_insert on storage.objects for insert to authenticated with check(
 bucket_id='qa-documentacoes' and (storage.foldername(name))[1]=(select auth.uid())::text
 and public.qa_owns_documentacao((storage.foldername(name))[2]));
drop policy if exists qa_doc_storage_delete on storage.objects;
create policy qa_doc_storage_delete on storage.objects for delete to authenticated using(
 bucket_id='qa-documentacoes' and (storage.foldername(name))[1]=(select auth.uid())::text
 and not exists(select 1 from public.qa_documentacao_arquivos f where f.path=name));
commit;
