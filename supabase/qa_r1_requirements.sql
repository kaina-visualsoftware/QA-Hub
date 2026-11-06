-- QA Hub R1: sources (text only in R1) and reviewed, task-scoped requirements.
-- Additive migration; existing TFs, scenarios and documents remain unchanged.
-- Files/Storage and immutable revision history are planned for R2/R4.

create unique index if not exists qa_tarefas_id_owner_uq on public.qa_tarefas(id,user_id);

create table if not exists public.qa_requisito_fontes (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null,
  user_id uuid not null,
  tipo_fonte text not null default 'texto'
    check(tipo_fonte in ('texto','arquivo')),
  nome_arquivo text,
  mime text,
  storage_path text,
  hash text,
  versao integer not null default 1 check(versao >= 1),
  texto_extraido text not null default ''
    check(char_length(texto_extraido) <= 30000),
  created_at timestamptz not null default now(),
  unique(id,tarefa_id,user_id),
  foreign key (tarefa_id,user_id)
    references public.qa_tarefas(id,user_id) on delete cascade,
  constraint qa_fonte_texto_nao_vazio check (
    tipo_fonte <> 'texto' or char_length(btrim(texto_extraido)) >= 5
  )
);
create index if not exists qa_requisito_fontes_tf_idx on public.qa_requisito_fontes(tarefa_id,created_at desc);

create table if not exists public.qa_requisitos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null,
  user_id uuid not null,
  fonte_id uuid,
  codigo text not null check(codigo ~ '^(RF|RNF|RN|CA)-[0-9]{3,4}$'),
  tipo text not null check(tipo in ('RF','RNF','RN','CA')),
  titulo text not null check(char_length(btrim(titulo)) between 3 and 240),
  descricao text not null check(char_length(btrim(descricao)) between 5 and 6000),
  criterios_aceite text not null default '' check(char_length(criterios_aceite) <= 4000),
  estado text not null default 'rascunho' check(estado in ('rascunho','aprovado','arquivado')),
  origem_trecho text not null default '' check(char_length(origem_trecho) <= 1200),
  ordem integer not null default 0 check(ordem between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tarefa_id,codigo),
  foreign key (tarefa_id,user_id)
    references public.qa_tarefas(id,user_id) on delete cascade,
  foreign key (fonte_id,tarefa_id,user_id)
    references public.qa_requisito_fontes(id,tarefa_id,user_id)
);
create index if not exists qa_requisitos_tf_order_idx on public.qa_requisitos(tarefa_id,ordem,created_at);
create index if not exists qa_requisitos_tf_estado_idx on public.qa_requisitos(tarefa_id,estado);
create index if not exists qa_requisitos_owner_idx on public.qa_requisitos(user_id);

alter table public.qa_requisito_fontes enable row level security;
alter table public.qa_requisitos enable row level security;

revoke all on public.qa_requisito_fontes,public.qa_requisitos from anon,authenticated;
grant select,insert on public.qa_requisito_fontes to authenticated;
grant select,insert,update on public.qa_requisitos to authenticated;

create policy qa_requisito_fontes_read on public.qa_requisito_fontes
  for select to authenticated
  using(
    user_id=(select auth.uid())
    and exists(select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  );
create policy qa_requisito_fontes_insert on public.qa_requisito_fontes
  for insert to authenticated
  with check(
    user_id=(select auth.uid())
    and exists(select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  );
create policy qa_requisitos_read on public.qa_requisitos
  for select to authenticated
  using(
    user_id=(select auth.uid())
    and exists(select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  );
create policy qa_requisitos_insert on public.qa_requisitos
  for insert to authenticated
  with check(
    user_id=(select auth.uid())
    and exists(select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  );
create policy qa_requisitos_update on public.qa_requisitos
  for update to authenticated
  using(
    user_id=(select auth.uid())
    and exists(select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  )
  with check(
    user_id=(select auth.uid())
    and exists(select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  );

-- One transactional operation. No unowned TF, duplicate TF, or orphan source.
-- Only explicitly selected preview items are passed by the client.
create or replace function public.qa_import_requisitos(
  p_tarefa_id uuid,p_texto text,p_itens jsonb
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_fonte uuid;
  v_item jsonb;
  v_count integer := 0;
  v_skipped integer := 0;
  v_codigo text;
  v_tipo text;
  v_titulo text;
  v_descricao text;
  v_criterios text;
  v_estado text;
  v_origem text;
  v_ordem integer;
  v_saved uuid;
begin
  if v_user is null or not exists (
    select 1 from public.qa_tarefas t
    where t.id=p_tarefa_id and t.user_id=v_user
  ) then
    raise exception 'TF não encontrada ou sem permissão' using errcode='42501';
  end if;
  if p_texto is null or char_length(btrim(p_texto)) < 5
    or char_length(p_texto) > 30000 then
    raise exception 'Texto-fonte deve conter de 5 a 30000 caracteres'
      using errcode='22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
    or jsonb_array_length(p_itens) not between 1 and 100 then
    raise exception 'Selecione de 1 a 100 requisitos revisados'
      using errcode='22023';
  end if;
  insert into public.qa_requisito_fontes(tarefa_id,user_id,tipo_fonte,texto_extraido)
    values(p_tarefa_id,v_user,'texto',p_texto) returning id into v_fonte;
  for v_item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Requisito inválido' using errcode='22023';
    end if;
    v_codigo := upper(btrim(v_item->>'codigo'));
    v_tipo := upper(btrim(v_item->>'tipo'));
    v_titulo := btrim(v_item->>'titulo');
    v_descricao := btrim(v_item->>'descricao');
    v_criterios := coalesce(btrim(v_item->>'criterios_aceite'),'');
    v_estado := coalesce(btrim(v_item->>'estado'),'rascunho');
    v_origem := coalesce(left(btrim(v_item->>'origem_trecho'),1200),'');
    v_ordem := coalesce((v_item->>'ordem')::integer,0);
    if v_tipo not in ('RF','RNF','RN','CA')
      or v_codigo !~ '^(RF|RNF|RN|CA)-[0-9]{3,4}$'
      or split_part(v_codigo,'-',1) <> v_tipo
      or char_length(v_titulo) not between 3 and 240
      or char_length(v_descricao) not between 5 and 6000
      or char_length(v_criterios) > 4000
      or v_estado not in ('rascunho','aprovado')
      or v_ordem not between 0 and 100000 then
      raise exception 'Campos do requisito inválidos (%).',v_codigo using errcode='22023';
    end if;
    v_saved := null;
    insert into public.qa_requisitos(
      tarefa_id,user_id,fonte_id,codigo,tipo,titulo,descricao,
      criterios_aceite,estado,origem_trecho,ordem)
    values(p_tarefa_id,v_user,v_fonte,v_codigo,v_tipo,v_titulo,
      v_descricao,v_criterios,v_estado,v_origem,v_ordem)
    on conflict(tarefa_id,codigo) do nothing returning id into v_saved;
    if v_saved is not null then v_count := v_count+1;
    else v_skipped := v_skipped+1; end if;
  end loop;
  if v_count=0 then
    delete from public.qa_requisito_fontes where id=v_fonte;
    v_fonte := null;
  end if;
  return jsonb_build_object('inserted',v_count,'skipped',v_skipped,
    'tarefa_id',p_tarefa_id,'fonte_id',v_fonte);
end;
$$;
revoke all on function public.qa_import_requisitos(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.qa_import_requisitos(uuid,text,jsonb) to authenticated;
comment on table public.qa_requisitos is
  'Private, reviewed TF requirements. Never exposed by publication of a TF; R2 enables file sources.';
