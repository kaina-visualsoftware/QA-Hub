-- QA Hub R2: private, immutable attachment versions for TF requirements.
-- R1 must already be installed. No existing requirements are modified.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('qa-requisitos','qa-requisitos',false,10485760,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown'])
on conflict(id) do update
set public=false,file_size_limit=10485760,
    allowed_mime_types=excluded.allowed_mime_types;

-- Path format: <auth.uid>/<owned task UUID>/<new object UUID>.(pdf|docx|txt|md).
create policy qa_r2_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id='qa-requisitos'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    and storage.filename(name) ~* '^[0-9a-f-]{36}\.(pdf|docx|txt|md)$'
    and exists (
      select 1 from public.qa_tarefas t
      where t.id::text=(storage.foldername(name))[2]
        and t.user_id=(select auth.uid())
    )
  );

create policy qa_r2_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id='qa-requisitos'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    and exists (
      select 1 from public.qa_tarefas t
      where t.id::text=(storage.foldername(name))[2]
        and t.user_id=(select auth.uid())
    )
  );

-- Only unregistered failed uploads can be cleaned up. Existing versions
-- cannot be overwritten or deleted, even by their author via Storage SDK.
create policy qa_r2_storage_cleanup_unregistered on storage.objects
  for delete to authenticated
  using (
    bucket_id='qa-requisitos'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    and exists (
      select 1 from public.qa_tarefas t
      where t.id::text=(storage.foldername(name))[2]
        and t.user_id=(select auth.uid())
    )
    and not exists(
      select 1 from public.qa_requisito_fontes f
      where f.storage_path=storage.objects.name
    )
  );

alter table public.qa_requisito_fontes
  add column if not exists tamanho_arquivo bigint;
alter table public.qa_requisito_fontes
  add constraint qa_r2_file_metadata_check check (
    tipo_fonte <> 'arquivo' or
    (
      nome_arquivo is not null and length(btrim(nome_arquivo)) between 1 and 180
      and mime in ('application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain','text/markdown')
      and storage_path is not null
      and hash ~ '^[0-9a-f]{64}$'
      and tamanho_arquivo between 1 and 10485760
    )
  );
create unique index if not exists qa_r2_file_sha_per_task_uniq
  on public.qa_requisito_fontes(tarefa_id,hash)
  where tipo_fonte='arquivo';
create unique index if not exists qa_r2_file_name_version_uniq
  on public.qa_requisito_fontes(tarefa_id,lower(nome_arquivo),versao)
  where tipo_fonte='arquivo';
create unique index if not exists qa_r2_file_storage_path_uniq
  on public.qa_requisito_fontes(storage_path)
  where tipo_fonte='arquivo';

-- Extend R1 source RLS: typed sources can still be inserted; file-backed
-- rows require a real uploaded object in the owner's private folder.
drop policy if exists qa_requisito_fontes_insert on public.qa_requisito_fontes;
create policy qa_requisito_fontes_insert on public.qa_requisito_fontes
  for insert to authenticated
  with check(
    user_id=(select auth.uid())
    and exists (
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
    and (
      tipo_fonte='texto'
      or (
        tipo_fonte='arquivo'
        and storage_path = user_id::text || '/' || tarefa_id::text || '/' ||
          storage.filename(storage_path)
        and exists (
          select 1 from storage.objects obj
          where obj.bucket_id='qa-requisitos' and obj.name=storage_path
        )
      )
    )
  );

-- The file must already be uploaded through Storage. This function verifies
-- its path, size and content type and allocates a new immutable version.
create or replace function public.qa_register_requirement_file(
  p_tarefa_id uuid,
  p_path text,
  p_nome text,
  p_mime text,
  p_sha256 text,
  p_tamanho bigint,
  p_texto_extraido text default ''
) returns jsonb
language plpgsql security invoker
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_bucket record;
  v_version integer;
  v_id uuid;
begin
  if v_uid is null or not exists(
    select 1 from public.qa_tarefas t
    where t.id=p_tarefa_id and t.user_id=v_uid
  ) then
    raise exception 'TF não encontrada ou sem permissão' using errcode='42501';
  end if;
  if p_path is null or p_path !~* (
    '^'||v_uid::text||'/'||p_tarefa_id::text||
    '/[0-9a-f-]{36}\.(pdf|docx|txt|md)$'
  ) then
    raise exception 'Caminho do anexo inválido' using errcode='22023';
  end if;
  if p_nome is null or char_length(btrim(p_nome)) not between 1 and 180
    or p_nome like '%/%' or position(chr(92) in p_nome)>0 or
    p_mime not in ('application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain','text/markdown') or
    p_sha256 !~ '^[0-9a-f]{64}$' or
    p_tamanho not between 1 and 10485760 or
    char_length(coalesce(p_texto_extraido,'')) > 30000 then
      raise exception 'Metadados inválidos' using errcode='22023';
  end if;
  select obj.metadata into v_bucket
    from storage.objects obj
    where obj.bucket_id='qa-requisitos' and obj.name=p_path
    limit 1;
  if not found then
    raise exception 'Arquivo não encontrado no bucket privado' using errcode='22023';
  end if;
  if coalesce((v_bucket.metadata->>'size')::bigint,-1)<>p_tamanho or
    coalesce(v_bucket.metadata->>'mimetype','')<>p_mime then
    raise exception 'Tamanho ou tipo do arquivo não confere com o upload'
      using errcode='22023';
  end if;
  if exists(
    select 1 from public.qa_requisito_fontes f
    where f.tarefa_id=p_tarefa_id and f.tipo_fonte='arquivo' and f.hash=p_sha256
  ) then
    raise exception 'Este arquivo já foi anexado à TF' using errcode='23505';
  end if;
  select coalesce(max(f.versao),0)+1 into v_version
    from public.qa_requisito_fontes f
    where f.tarefa_id=p_tarefa_id and f.tipo_fonte='arquivo'
      and lower(f.nome_arquivo)=lower(p_nome);
  insert into public.qa_requisito_fontes(
    tarefa_id,user_id,tipo_fonte,nome_arquivo,mime,storage_path,hash,
    tamanho_arquivo,versao,texto_extraido
  )
  values(
    p_tarefa_id,v_uid,'arquivo',btrim(p_nome),p_mime,p_path,p_sha256,
    p_tamanho,v_version,coalesce(p_texto_extraido,'')
  ) returning id into v_id;
  return jsonb_build_object(
    'id',v_id,'tarefa_id',p_tarefa_id,'versao',v_version);
end;
$$;
revoke all on function public.qa_register_requirement_file(uuid,text,text,text,text,bigint,text)
  from public,anon,authenticated;
grant execute on function public.qa_register_requirement_file(uuid,text,text,text,text,bigint,text)
  to authenticated;

-- Import reviewed requirements into a previously stored file source.
-- One statement/RPC is atomic: any invalid item rejects the entire batch.
create or replace function public.qa_import_requisitos_da_fonte(
  p_tarefa_id uuid, p_fonte_id uuid, p_itens jsonb
) returns jsonb
language plpgsql security invoker
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer := 0;
  v_skipped integer := 0;
  v_item jsonb;
  v_code text;
  v_type text;
  v_title text;
  v_description text;
  v_acceptance text;
  v_state text;
  v_origin text;
  v_order integer;
  v_id uuid;
begin
  if v_uid is null or not exists(
    select 1 from public.qa_tarefas t
    where t.id=p_tarefa_id and t.user_id=v_uid
  ) or not exists (
    select 1 from public.qa_requisito_fontes f
    where f.id=p_fonte_id and f.tarefa_id=p_tarefa_id
      and f.user_id=v_uid and f.tipo_fonte='arquivo'
  ) then
    raise exception 'Arquivo ou TF sem permissão' using errcode='42501';
  end if;
  if p_itens is null or jsonb_typeof(p_itens)<>'array'
    or jsonb_array_length(p_itens) not between 1 and 100 then
    raise exception 'Selecione de 1 a 100 requisitos'
      using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item)<>'object' then
      raise exception 'Requisito inválido' using errcode='22023';
    end if;
    v_code := upper(btrim(v_item->>'codigo'));
    v_type := upper(btrim(v_item->>'tipo'));
    v_title := btrim(v_item->>'titulo');
    v_description := btrim(v_item->>'descricao');
    v_acceptance := coalesce(btrim(v_item->>'criterios_aceite'),'');
    v_state := coalesce(btrim(v_item->>'estado'),'rascunho');
    v_origin := coalesce(left(btrim(v_item->>'origem_trecho'),1200),'');
    v_order := coalesce((v_item->>'ordem')::integer,0);
    if v_type not in ('RF','RNF','RN','CA')
      or v_code !~ '^(RF|RNF|RN|CA)-[0-9]{3,4}$'
      or split_part(v_code,'-',1)<>v_type
      or char_length(v_title) not between 3 and 240
      or char_length(v_description) not between 5 and 6000
      or char_length(v_acceptance)>4000
      or v_state not in ('rascunho','aprovado')
      or v_order not between 0 and 100000 then
      raise exception 'Requisito inválido (%)',v_code using errcode='22023';
    end if;
    v_id:=null;
    insert into public.qa_requisitos(
      tarefa_id,user_id,fonte_id,codigo,tipo,titulo,descricao,
      criterios_aceite,estado,origem_trecho,ordem
    ) values (
      p_tarefa_id,v_uid,p_fonte_id,v_code,v_type,v_title,v_description,
      v_acceptance,v_state,v_origin,v_order
    ) on conflict(tarefa_id,codigo) do nothing
      returning id into v_id;
    if v_id is null then v_skipped:=v_skipped+1;
    else v_count:=v_count+1;end if;
  end loop;
  return jsonb_build_object(
    'tarefa_id',p_tarefa_id,'fonte_id',p_fonte_id,
    'inserted',v_count,'skipped',v_skipped);
end;
$$;
revoke all on function public.qa_import_requisitos_da_fonte(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.qa_import_requisitos_da_fonte(uuid,uuid,jsonb)
  to authenticated;

comment on table public.qa_requisito_fontes is
  'Private TF source documents: text (R1) or immutable versioned files in qa-requisitos (R2).';
