-- F7: reversible archive for TFs and scenarios. Additive, no user data purged.
-- Active RLS, historical event retention and automatic unpublication on archive.

alter table public.qa_tarefas
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;
alter table public.qa_cenarios
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

alter table public.qa_tarefas
  add constraint qa_f7_no_published_archives
  check (archived_at is null or publica=false);

create index if not exists qa_f7_tasks_trash_idx
  on public.qa_tarefas(user_id,archived_at desc,id desc)
  where archived_at is not null;
create index if not exists qa_f7_scenarios_trash_idx
  on public.qa_cenarios(user_id,archived_at desc,id desc)
  where archived_at is not null;
create index if not exists qa_f7_tasks_active_idx
  on public.qa_tarefas(user_id,executado_em desc,created_at desc,id desc)
  where archived_at is null;
create index if not exists qa_f7_scenarios_active_idx
  on public.qa_cenarios(tarefa_id,ordem,id)
  where archived_at is null;

-- A restrictive policy composes with the existing owner/admin/team policies.
-- Archived objects remain readable for their owner and authorized admin, but not teammates.
create policy qa_f7_tasks_archived_read on public.qa_tarefas as restrictive
  for select to authenticated using (
    archived_at is null or user_id=(select auth.uid())
    or exists(select 1 from public.qa_admins a where a.user_id=(select auth.uid()))
  );
create policy qa_f7_cases_archived_read on public.qa_cenarios as restrictive
  for select to authenticated using (
    (archived_at is null or user_id=(select auth.uid())
      or exists(select 1 from public.qa_admins a where a.user_id=(select auth.uid())))
    and exists(
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and (
        t.archived_at is null or t.user_id=(select auth.uid())
        or exists(select 1 from public.qa_admins a where a.user_id=(select auth.uid()))
      )
    )
  );

-- Team visibility/execution helpers are DEFINER and must explicitly check archive status.
create or replace function qa_private.f5_view_task(p_task uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select (select auth.uid()) is not null
 and exists(select 1 from public.qa_tarefas t where t.id=p_task and t.archived_at is null)
 and (
   exists(select 1 from public.qa_tarefas t where t.id=p_task
     and t.user_id=(select auth.uid()))
   or exists(select 1 from public.qa_equipe_membros m
      where m.equipe_id=qa_private.f5_task_team(p_task)
        and m.usuario_id=(select auth.uid()))
 )
$$;
create or replace function qa_private.f5_execute_task(p_task uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select (select auth.uid()) is not null
 and exists(select 1 from public.qa_tarefas t where t.id=p_task and t.archived_at is null)
 and (
   exists(select 1 from public.qa_tarefas t where t.id=p_task
     and t.user_id=(select auth.uid()))
   or exists(select 1 from public.qa_equipe_membros m
      where m.equipe_id=qa_private.f5_task_team(p_task)
        and m.usuario_id=(select auth.uid())
        and (m.papel='gestor'
          or (m.papel='qa' and exists(select 1 from public.qa_tarefa_responsaveis r
            where r.tarefa_id=p_task and r.responsavel_id=m.usuario_id))))
 )
$$;

-- Archive guards stop accidental updates and prevent adding cases to archived TFs.
create or replace function qa_private.f7_guard_task()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.archived_at is not null then
    if new.archived_at is not null
       or (to_jsonb(new) - 'archived_at' - 'archived_by' - 'updated_at')
          is distinct from (to_jsonb(old) - 'archived_at' - 'archived_by' - 'updated_at') then
      raise exception 'Restaure a TF antes de editá-la';
    end if;
  end if;
  if new.archived_at is not null and new.publica then
    raise exception 'TF arquivada não pode ficar publicada';
  end if;
  return new;
end $$;
create trigger qa_f7_guard_task before update on public.qa_tarefas
 for each row execute function qa_private.f7_guard_task();

create or replace function qa_private.f7_guard_case()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if exists(select 1 from public.qa_tarefas t
      where t.id=new.tarefa_id and t.archived_at is not null) then
    raise exception 'Restaure a TF antes de alterar seus cenários';
  end if;
  if tg_op='UPDATE' and old.archived_at is not null then
    if new.archived_at is not null
       or (to_jsonb(new) - 'archived_at' - 'archived_by' - 'updated_at')
          is distinct from (to_jsonb(old) - 'archived_at' - 'archived_by' - 'updated_at') then
      raise exception 'Restaure o cenário antes de editá-lo';
    end if;
  end if;
  return new;
end $$;
create trigger qa_f7_guard_case before insert or update on public.qa_cenarios
 for each row execute function qa_private.f7_guard_case();

-- No browser role can still perform irreversible DELETE, even using PostgREST directly.
revoke delete on public.qa_tarefas, public.qa_cenarios from public,anon,authenticated;

create table if not exists public.qa_lixeira_eventos (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid,
 tipo text not null check(tipo in ('tarefa','cenario')),
 tarefa_id uuid not null,
 cenario_id uuid,
 acao text not null check(acao in ('arquivar','restaurar')),
 created_at timestamptz not null default now()
);
create index if not exists qa_f7_trash_events_owner_idx
 on public.qa_lixeira_eventos(user_id,created_at desc,id desc);
alter table public.qa_lixeira_eventos enable row level security;
revoke all on public.qa_lixeira_eventos from public,anon,authenticated;
grant select on public.qa_lixeira_eventos to authenticated;
create policy qa_f7_trash_audit_owner on public.qa_lixeira_eventos
 for select to authenticated using(user_id=(select auth.uid()));

create or replace function qa_private.f7_log_trash()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.archived_at is distinct from old.archived_at then
  insert into public.qa_lixeira_eventos(user_id,actor_id,tipo,tarefa_id,cenario_id,acao)
  values(new.user_id,(select auth.uid()),case when tg_table_name='qa_tarefas'
       then 'tarefa' else 'cenario' end,
      case when tg_table_name='qa_tarefas' then new.id else new.tarefa_id end,
      case when tg_table_name='qa_cenarios' then new.id else null end,
      case when new.archived_at is null then 'restaurar' else 'arquivar' end);
 end if;
 return new;
end $$;
create trigger qa_f7_log_task after update of archived_at on public.qa_tarefas
 for each row execute function qa_private.f7_log_trash();
create trigger qa_f7_log_case after update of archived_at on public.qa_cenarios
 for each row execute function qa_private.f7_log_trash();

create or replace function public.qa_archive_task(p_task uuid)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Autenticação obrigatória'; end if;
 update public.qa_tarefas t
 set archived_at=now(), archived_by=(select auth.uid()),
     publica=false, updated_at=now()
 where t.id=p_task and t.user_id=(select auth.uid()) and t.archived_at is null
 returning t.id into v_id;
 if v_id is null then raise exception 'TF não encontrada ou sem permissão'; end if;
 return v_id;
end $$;

create or replace function public.qa_restore_task(p_task uuid)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Autenticação obrigatória'; end if;
 update public.qa_tarefas t
 set archived_at=null, archived_by=null, publica=false, updated_at=now()
 where t.id=p_task and t.user_id=(select auth.uid()) and t.archived_at is not null
 returning t.id into v_id;
 if v_id is null then raise exception 'TF não encontrada na lixeira ou sem permissão'; end if;
 return v_id;
end $$;

create or replace function public.qa_archive_scenario(p_task uuid,p_scenario uuid)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Autenticação obrigatória'; end if;
 update public.qa_cenarios c
 set archived_at=now(), archived_by=(select auth.uid()),updated_at=now()
 from public.qa_tarefas t
 where t.id=p_task and t.user_id=(select auth.uid()) and t.archived_at is null
   and c.id=p_scenario and c.tarefa_id=t.id and c.archived_at is null
 returning c.id into v_id;
 if v_id is null then raise exception 'Cenário não encontrado ou sem permissão'; end if;
 return v_id;
end $$;

create or replace function public.qa_restore_scenario(p_task uuid,p_scenario uuid)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Autenticação obrigatória'; end if;
 update public.qa_cenarios c
 set archived_at=null,archived_by=null,updated_at=now()
 from public.qa_tarefas t
 where t.id=p_task and t.user_id=(select auth.uid()) and t.archived_at is null
   and c.id=p_scenario and c.tarefa_id=t.id and c.archived_at is not null
 returning c.id into v_id;
 if v_id is null then raise exception 'Cenário não encontrado na lixeira'; end if;
 return v_id;
end $$;

create or replace function public.qa_trash_v1()
returns jsonb language sql stable security invoker set search_path=''
as $$
 select jsonb_build_object(
  'tasks',coalesce((select jsonb_agg(to_jsonb(a)) from (
   select t.id,t.titulo,t.codigo,t.sistema,t.versao,t.archived_at
   from public.qa_tarefas t
   where t.user_id=(select auth.uid()) and t.archived_at is not null
   order by t.archived_at desc,t.id desc limit 100
  ) a),'[]'::jsonb),
  'scenarios',coalesce((select jsonb_agg(to_jsonb(b)) from (
   select c.id,c.tarefa_id,c.titulo,t.titulo as tarefa_titulo,c.archived_at
   from public.qa_cenarios c
   join public.qa_tarefas t on t.id=c.tarefa_id
   where c.user_id=(select auth.uid()) and t.user_id=(select auth.uid())
     and c.archived_at is not null and t.archived_at is null
   order by c.archived_at desc,c.id desc limit 100
  ) b),'[]'::jsonb)
 )
$$;

revoke all on function public.qa_archive_task(uuid) from public,anon,authenticated;
revoke all on function public.qa_restore_task(uuid) from public,anon,authenticated;
revoke all on function public.qa_archive_scenario(uuid,uuid) from public,anon,authenticated;
revoke all on function public.qa_restore_scenario(uuid,uuid) from public,anon,authenticated;
revoke all on function public.qa_trash_v1() from public,anon,authenticated;
grant execute on function public.qa_archive_task(uuid),
 public.qa_restore_task(uuid),public.qa_archive_scenario(uuid,uuid),
 public.qa_restore_scenario(uuid,uuid),public.qa_trash_v1() to authenticated;

-- Keep existing F4/F6 API contracts; hide archived rows in every aggregate.
CREATE OR REPLACE FUNCTION public.qa_search_tasks(p_search text DEFAULT ''::text, p_status text DEFAULT ''::text, p_type text DEFAULT ''::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    where t.archived_at is null and (v_status='' or t.status=v_status)
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
    where t.archived_at is null and (v_status='' or t.status=v_status)
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
$function$
;

CREATE OR REPLACE FUNCTION public.qa_task_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with task_summary as (
    select count(*)::integer as total,
      count(*) filter (where status in ('rascunho','em_teste'))::integer as pending,
      count(*) filter (where status='aprovado')::integer as approved,
      count(*) filter (where status in ('reprovado','bloqueado'))::integer as problem,
      count(*) filter (where status='rascunho')::integer as rascunho,
      count(*) filter (where status='em_teste')::integer as em_teste,
      count(*) filter (where status='reprovado')::integer as reprovado,
      count(*) filter (where status='bloqueado')::integer as bloqueado
    from public.qa_tarefas where archived_at is null
  ),
  scenario_summary as (
    select count(*)::integer as total,
      count(*) filter (where c.status <> 'nao_executado')::integer as executed
    from public.qa_cenarios c join public.qa_tarefas t on t.id=c.tarefa_id
    where c.archived_at is null and t.archived_at is null
  )
  select jsonb_build_object(
    'total',t.total,'pending',t.pending,'approved',t.approved,'problem',t.problem,
    'statuses',jsonb_build_object('rascunho',t.rascunho,'em_teste',t.em_teste,
       'aprovado',t.approved,'reprovado',t.reprovado,'bloqueado',t.bloqueado),
    'scenarios',s.total,'executed',s.executed,
    'recent',coalesce((select jsonb_agg(to_jsonb(r))
      from (select * from public.qa_tarefas where archived_at is null
        order by executado_em desc nulls last,created_at desc,id desc limit 5) r),
      '[]'::jsonb)
  )
  from task_summary t cross join scenario_summary s
$function$
;

CREATE OR REPLACE FUNCTION public.qa_insights_v1(p_months integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with visible as (
    select t.id,
      coalesce(nullif(btrim(t.sistema),''),'Sem módulo') as modulo,
      coalesce(nullif(btrim(t.versao),''),'Sem versão') as versao,
      t.status as situacao
    from public.qa_tarefas t where t.archived_at is null
  ),
  case_stats as (
    select c.tarefa_id,
      count(*)::integer as casos,
      count(*) filter(where c.status <> 'nao_executado')::integer as executados,
      count(*) filter(where c.status in ('reprovado','bloqueado'))::integer as problemas
    from public.qa_cenarios c
      join visible v on v.id=c.tarefa_id
    where c.archived_at is null
    group by c.tarefa_id
  ),
  task_stats as (
    select v.id,v.modulo,v.versao,v.situacao,
      coalesce(c.casos,0) as casos,coalesce(c.executados,0) as executados,
      coalesce(c.problemas,0) as problemas
    from visible v left join case_stats c on c.tarefa_id=v.id
  ),
  changed as (
    select h.created_at,h.status_anterior,h.status_novo
    from public.qa_execucao_historico h
      join visible v on v.id=h.tarefa_id
    where h.origem='alteracao'
      and h.status_anterior is distinct from h.status_novo
      and h.created_at>=date_trunc('month',now())-
        (greatest(3,least(coalesce(p_months,6),12))-1)*interval '1 month'
  )
  select jsonb_build_object(
    'modules',coalesce((
      select jsonb_agg(to_jsonb(m)) from (
        select modulo,count(*)::integer as tarefas,
          coalesce(sum(casos),0)::integer as casos,
          coalesce(sum(executados),0)::integer as executados,
          coalesce(sum(problemas),0)::integer as problemas
        from task_stats group by modulo
        order by sum(casos) desc, modulo limit 20
      ) m
    ),'[]'::jsonb),
    'versions',coalesce((
      select jsonb_agg(to_jsonb(v)) from (
        select modulo,versao,count(*)::integer as tarefas,
          count(*) filter(where situacao='aprovado')::integer as aprovadas,
          coalesce(sum(casos),0)::integer as casos,
          coalesce(sum(executados),0)::integer as executados,
          coalesce(sum(problemas),0)::integer as problemas
        from task_stats group by modulo,versao
        order by count(*) desc, modulo,versao limit 20
      ) v
    ),'[]'::jsonb),
    'months',coalesce((
      select jsonb_agg(to_jsonb(m)) from (
        select to_char(date_trunc('month',created_at),'YYYY-MM') as mes,
          count(*)::integer as alteracoes,
          count(*) filter(where status_anterior='aprovado' and
            status_novo in ('reprovado','bloqueado'))::integer as regressoes,
          count(*) filter(where status_novo='aprovado')::integer as aprovacoes
        from changed group by 1 order by 1
      ) m
    ),'[]'::jsonb),
    'regressions',coalesce((
      select count(*)::integer from changed
      where status_anterior='aprovado'
        and status_novo in ('reprovado','bloqueado')
    ),0),
    'period_months',greatest(3,least(coalesce(p_months,6),12))
  )
$function$
;
