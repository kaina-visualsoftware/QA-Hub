-- QA Hub F4: server-side search, saved filters and immutable execution history.
-- Additive; all authenticated reads use caller RLS (never a public privileged search).

create index if not exists qa_f4_tasks_recent_idx
 on public.qa_tarefas(user_id,executado_em desc,created_at desc,id desc);
create index if not exists qa_f4_tasks_status_idx
 on public.qa_tarefas(user_id,status,executado_em desc,id desc);
create index if not exists qa_f4_tasks_module_version_idx
 on public.qa_tarefas(user_id,sistema,versao);

-- Index accelerates word-based search. Substring matching also supports
-- partial ticket codes and versions that don't tokenize like prose.
create index if not exists qa_f4_tasks_search_idx
 on public.qa_tarefas using gin(
   to_tsvector('simple',
     coalesce(titulo,'')||' '||coalesce(codigo,'')||' '||
     coalesce(sistema,'')||' '||coalesce(versao,'')||' '||
     coalesce(descricao,'')
   )
 );

create or replace function public.qa_search_tasks(
  p_search text default '',
  p_status text default '',
  p_type text default '',
  p_page integer default 0,
  p_page_size integer default 30
)
returns jsonb language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_search text := lower(btrim(coalesce(p_search,'')));
  v_status text := btrim(coalesce(p_status,''));
  v_type text := btrim(coalesce(p_type,''));
  v_page integer := greatest(coalesce(p_page,0),0);
  v_size integer := least(greatest(coalesce(p_page_size,30),1),50);
  v_offset bigint;
  v_total bigint;
  v_rows jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Acesso autenticado obrigatório';
  end if;
  if length(v_search)>120 or v_page>100000 then
    raise exception 'Pesquisa ou página fora do limite';
  end if;
  if v_status<>'' and v_status not in
    ('rascunho','em_teste','aprovado','reprovado','bloqueado') then
    raise exception 'Situação inválida';
  end if;
  if v_type<>'' and v_type not in ('BUILD','RELEASE') then
    raise exception 'Tipo inválido';
  end if;
  v_offset := v_page::bigint*v_size;

  with matched as (
    select t.*
    from public.qa_tarefas t
    where (v_status='' or t.status=v_status)
      and (v_type='' or t.tipo_teste=v_type)
      and (
        v_search=''
        or to_tsvector('simple',
          coalesce(t.titulo,'')||' '||coalesce(t.codigo,'')||' '||
          coalesce(t.sistema,'')||' '||coalesce(t.versao,'')||' '||
          coalesce(t.descricao,'')
        ) @@ websearch_to_tsquery('simple',v_search)
        or position(v_search in lower(
          coalesce(t.titulo,'')||' '||coalesce(t.codigo,'')||' '||
          coalesce(t.sistema,'')||' '||coalesce(t.versao,'')||' '||
          coalesce(t.descricao,'')
        ))>0
      )
  )
  select count(*)::bigint into v_total from matched;

  with matched as (
    select t.*
    from public.qa_tarefas t
    where (v_status='' or t.status=v_status)
      and (v_type='' or t.tipo_teste=v_type)
      and (
        v_search=''
        or to_tsvector('simple',
          coalesce(t.titulo,'')||' '||coalesce(t.codigo,'')||' '||
          coalesce(t.sistema,'')||' '||coalesce(t.versao,'')||' '||
          coalesce(t.descricao,'')
        ) @@ websearch_to_tsquery('simple',v_search)
        or position(v_search in lower(
          coalesce(t.titulo,'')||' '||coalesce(t.codigo,'')||' '||
          coalesce(t.sistema,'')||' '||coalesce(t.versao,'')||' '||
          coalesce(t.descricao,'')
        ))>0
      )
  )
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
  into v_rows from (
    select * from matched
    order by executado_em desc nulls last, created_at desc, id desc
    limit v_size offset v_offset
  ) s;
  return jsonb_build_object('items',v_rows,'total',v_total,
    'page',v_page,'page_size',v_size);
end
$$;
revoke all on function public.qa_search_tasks(text,text,text,integer,integer)
 from public,anon;
grant execute on function public.qa_search_tasks(text,text,text,integer,integer)
 to authenticated;
comment on function public.qa_search_tasks(text,text,text,integer,integer)
 is 'Pesquisa paginada por situação, tipo e texto. SECURITY INVOKER preserva RLS, sem vazar TFs de outros usuários.';

create table if not exists public.qa_filtros_salvos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 60),
  pesquisa text not null default '' check (char_length(pesquisa)<=120),
  situacao text not null default '' check (
    situacao in ('','rascunho','em_teste','aprovado','reprovado','bloqueado')
  ),
  tipo text not null default '' check (tipo in ('','BUILD','RELEASE')),
  created_at timestamptz not null default now(),
  unique(user_id,nome)
);
create index if not exists qa_f4_filters_owner_idx
  on public.qa_filtros_salvos(user_id,created_at desc);
alter table public.qa_filtros_salvos enable row level security;
revoke all on public.qa_filtros_salvos from anon,authenticated;
grant select,insert,delete on public.qa_filtros_salvos to authenticated;
create policy qa_f4_filters_owner_read on public.qa_filtros_salvos
 for select to authenticated using (user_id=(select auth.uid()));
create policy qa_f4_filters_owner_create on public.qa_filtros_salvos
 for insert to authenticated with check (user_id=(select auth.uid()));
create policy qa_f4_filters_owner_delete on public.qa_filtros_salvos
 for delete to authenticated using (user_id=(select auth.uid()));

create table if not exists public.qa_execucao_historico (
  id uuid primary key default gen_random_uuid(),
  cenario_id uuid not null references public.qa_cenarios(id) on delete cascade,
  tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  origem text not null check (origem in ('base','alteracao')),
  status_anterior text,
  status_novo text not null check
    (status_novo in ('nao_executado','aprovado','reprovado','bloqueado')),
  obtido_anterior text not null default '',
  obtido_novo text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists qa_f4_history_task_time_idx
 on public.qa_execucao_historico(tarefa_id,created_at desc,id desc);
create index if not exists qa_f4_history_scenario_idx
 on public.qa_execucao_historico(cenario_id,created_at desc,id desc);
alter table public.qa_execucao_historico enable row level security;
revoke all on public.qa_execucao_historico from anon,authenticated;
grant select on public.qa_execucao_historico to authenticated;
create policy qa_f4_history_read on public.qa_execucao_historico
 for select to authenticated using (
   exists(select 1 from public.qa_tarefas t
     where t.id=tarefa_id and t.user_id=qa_execucao_historico.user_id
       and (t.user_id=(select auth.uid()) or exists (
         select 1 from public.qa_admins a where a.user_id=(select auth.uid())
       )))
 );

create table if not exists public.qa_tarefa_mudancas (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  anterior jsonb not null,
  atual jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists qa_f4_task_change_idx
 on public.qa_tarefa_mudancas(tarefa_id,created_at desc,id desc);
alter table public.qa_tarefa_mudancas enable row level security;
revoke all on public.qa_tarefa_mudancas from anon,authenticated;
grant select on public.qa_tarefa_mudancas to authenticated;
create policy qa_f4_task_change_read on public.qa_tarefa_mudancas
 for select to authenticated using (
   exists(select 1 from public.qa_tarefas t
     where t.id=tarefa_id and t.user_id=qa_tarefa_mudancas.user_id
       and (t.user_id=(select auth.uid()) or exists(
         select 1 from public.qa_admins a where a.user_id=(select auth.uid())
       )))
 );

create or replace function qa_private.f4_capture_scenario()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='INSERT' or (
    old.status is distinct from new.status
    or old.obtido is distinct from new.obtido
  ) then
    insert into public.qa_execucao_historico(
      cenario_id,tarefa_id,user_id,actor_id,origem,
      status_anterior,status_novo,obtido_anterior,obtido_novo
    ) values (
      new.id,new.tarefa_id,new.user_id,(select auth.uid()),
      case when tg_op='INSERT' then 'base' else 'alteracao' end,
      case when tg_op='INSERT' then null else old.status end,
      new.status,
      case when tg_op='INSERT' then '' else coalesce(old.obtido,'') end,
      coalesce(new.obtido,'')
    );
  end if;
  return new;
end;
$$;
revoke all on function qa_private.f4_capture_scenario() from public,anon,authenticated;
create trigger qa_f4_scenario_history
 after insert or update on public.qa_cenarios
 for each row execute function qa_private.f4_capture_scenario();

create or replace function qa_private.f4_capture_task()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  before_row jsonb;
  after_row jsonb;
begin
  before_row=jsonb_build_object(
    'titulo',old.titulo,'codigo',old.codigo,'versao',old.versao,
    'sistema',old.sistema,'tipo_teste',old.tipo_teste,'status',old.status);
  after_row=jsonb_build_object(
    'titulo',new.titulo,'codigo',new.codigo,'versao',new.versao,
    'sistema',new.sistema,'tipo_teste',new.tipo_teste,'status',new.status);
  if before_row is distinct from after_row then
    insert into public.qa_tarefa_mudancas(
      tarefa_id,user_id,actor_id,anterior,atual
    ) values (new.id,new.user_id,(select auth.uid()),before_row,after_row);
  end if;
  return new;
end;
$$;
revoke all on function qa_private.f4_capture_task() from public,anon,authenticated;
create trigger qa_f4_task_changes
 after update on public.qa_tarefas
 for each row execute function qa_private.f4_capture_task();

-- Prior history cannot be reconstructed. The baseline captures only what
-- existed when F4 was installed, with NULL previous status.
insert into public.qa_execucao_historico(
  cenario_id,tarefa_id,user_id,actor_id,origem,
  status_anterior,status_novo,obtido_anterior,obtido_novo)
select s.id,s.tarefa_id,s.user_id,null,'base',null,s.status,'',
  coalesce(s.obtido,'')
from public.qa_cenarios s
where not exists (
  select 1 from public.qa_execucao_historico h where h.cenario_id=s.id
);

-- A bounded dashboard response replaces the previous 1,000-row client scan.
create or replace function public.qa_task_stats()
returns jsonb language sql stable security invoker set search_path=''
as $$
  with task_summary as (
    select count(*)::integer as total,
      count(*) filter (where status in ('rascunho','em_teste'))::integer as pending,
      count(*) filter (where status='aprovado')::integer as approved,
      count(*) filter (where status in ('reprovado','bloqueado'))::integer as problem,
      count(*) filter (where status='rascunho')::integer as rascunho,
      count(*) filter (where status='em_teste')::integer as em_teste,
      count(*) filter (where status='reprovado')::integer as reprovado,
      count(*) filter (where status='bloqueado')::integer as bloqueado
    from public.qa_tarefas
  ),
  scenario_summary as (
    select count(*)::integer as total,
      count(*) filter (where status <> 'nao_executado')::integer as executed
    from public.qa_cenarios
  )
  select jsonb_build_object(
    'total',t.total,'pending',t.pending,'approved',t.approved,'problem',t.problem,
    'statuses',jsonb_build_object('rascunho',t.rascunho,'em_teste',t.em_teste,
       'aprovado',t.approved,'reprovado',t.reprovado,'bloqueado',t.bloqueado),
    'scenarios',s.total,'executed',s.executed,
    'recent',coalesce((select jsonb_agg(to_jsonb(r))
      from (select * from public.qa_tarefas
        order by executado_em desc nulls last,created_at desc,id desc limit 5) r),
      '[]'::jsonb)
  )
  from task_summary t cross join scenario_summary s
$$;
revoke all on function public.qa_task_stats() from public,anon;
grant execute on function public.qa_task_stats() to authenticated;
