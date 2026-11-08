-- QA Hub F3: anexos de evidência em bucket PRIVADO, com metadados append-only.
-- Migração aditiva, sem alteração das evidências e TFs já gravadas.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('qa-evidence-private','qa-evidence-private',false,10485760,
  array['image/png','image/jpeg','image/webp','application/pdf','text/plain'])
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.qa_evidencia_arquivos (
  id uuid primary key,
  tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
  cenario_id uuid references public.qa_cenarios(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome_original text not null check (char_length(btrim(nome_original)) between 1 and 240),
  mime_type text not null check (mime_type in
    ('image/png','image/jpeg','image/webp','application/pdf','text/plain')),
  tamanho_bytes integer not null check (tamanho_bytes between 1 and 10485760),
  objeto_path text not null unique,
  descricao text not null default '' check (char_length(descricao) <= 1000),
  created_at timestamptz not null default now(),
  constraint qa_f3_path_matches_metadata check (
    objeto_path = user_id::text || '/' || tarefa_id::text || '/' || id::text ||
      case mime_type
        when 'image/png' then '.png'
        when 'image/jpeg' then '.jpg'
        when 'image/webp' then '.webp'
        when 'application/pdf' then '.pdf'
        when 'text/plain' then '.txt'
      end
  )
);
create index if not exists qa_evidencia_arquivos_tf_idx
  on public.qa_evidencia_arquivos(tarefa_id,created_at desc);
alter table public.qa_evidencia_arquivos enable row level security;
revoke all on public.qa_evidencia_arquivos from anon,authenticated;
grant select,insert on public.qa_evidencia_arquivos to authenticated;

create policy qa_f3_files_read on public.qa_evidencia_arquivos
for select to authenticated using (
  user_id=(select auth.uid()) and exists (
    select 1 from public.qa_tarefas t
    where t.id=tarefa_id and t.user_id=(select auth.uid())
  )
);
create policy qa_f3_files_insert on public.qa_evidencia_arquivos
for insert to authenticated with check (
  user_id=(select auth.uid()) and exists (
    select 1 from public.qa_tarefas t
    where t.id=tarefa_id and t.user_id=(select auth.uid())
  ) and (cenario_id is null or exists (
    select 1 from public.qa_cenarios s
    where s.id=cenario_id and s.tarefa_id=qa_evidencia_arquivos.tarefa_id
      and s.user_id=(select auth.uid())
  ))
);

-- storage.foldername('user-uuid/task-uuid/file-uuid.pdf') -> [user, task].
-- SELECT reads only own objects. No upsert/UPDATE. DELETE is only for
-- orphan cleanup if the subsequent metadata INSERT fails.
create policy qa_f3_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id='qa-evidence-private'
  and owner_id=(select auth.uid())::text
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and array_length(storage.foldername(name),1)=2
  and exists (
    select 1 from public.qa_tarefas t
    where t.id::text=(storage.foldername(name))[2]
      and t.user_id=(select auth.uid())
  )
  and storage.filename(name) ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp|pdf|txt)$'
);
create policy qa_f3_storage_read on storage.objects
for select to authenticated using (
  bucket_id='qa-evidence-private'
  and owner_id=(select auth.uid())::text
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.qa_tarefas t
    where t.id::text=(storage.foldername(name))[2]
      and t.user_id=(select auth.uid())
  )
);
create policy qa_f3_storage_orphan_cleanup on storage.objects
for delete to authenticated using (
  bucket_id='qa-evidence-private'
  and owner_id=(select auth.uid())::text
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.qa_tarefas t
    where t.id::text=(storage.foldername(name))[2]
      and t.user_id=(select auth.uid())
  )
  and not exists (
    select 1 from public.qa_evidencia_arquivos a
    where a.objeto_path=name
  )
);

-- Audita apenas tipo e tamanho; nunca registra conteúdo ou nome do anexo.
create or replace function qa_private.audit_qa_file()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if (select auth.uid()) is not null then
    insert into public.qa_eventos(tarefa_id,user_id,actor_id,acao,detalhes)
    values(new.tarefa_id,new.user_id,(select auth.uid()),'evidencia.arquivo',
      jsonb_build_object('tipo',new.mime_type,'bytes',new.tamanho_bytes));
  end if;
  return new;
end;
$$;
revoke all on function qa_private.audit_qa_file() from public,anon,authenticated;
create trigger qa_audit_evidence_file
  after insert on public.qa_evidencia_arquivos
  for each row execute function qa_private.audit_qa_file();

comment on table public.qa_evidencia_arquivos is
  'Metadados de anexos privados associados a TFs; sem UPDATE/DELETE pela API.';
