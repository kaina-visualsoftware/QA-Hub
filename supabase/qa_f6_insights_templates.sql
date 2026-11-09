-- QA Hub F6 — Indicadores históricos por módulo/versão e biblioteca privada.
-- Aplicação aditiva. Nenhuma alteração nos resultados ou aprovações existentes.

create table if not exists public.qa_modelos_cenario (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 3 and 240),
  passos text not null check (char_length(btrim(passos)) between 1 and 20000),
  esperado text not null check (char_length(btrim(esperado)) between 1 and 20000),
  observacoes text not null default '' check (char_length(observacoes) <= 20000),
  modulo text not null default '' check (char_length(modulo) <= 160),
  tipo_teste text not null default 'BUILD' check (tipo_teste in ('BUILD','RELEASE')),
  created_at timestamptz not null default now()
);

create index if not exists qa_f6_modelos_owner_recent
 on public.qa_modelos_cenario(user_id,created_at desc,id desc);

alter table public.qa_modelos_cenario enable row level security;
revoke all on public.qa_modelos_cenario from anon,authenticated;
grant select,insert,delete on public.qa_modelos_cenario to authenticated;

create policy qa_f6_modelos_read on public.qa_modelos_cenario
 for select to authenticated using (user_id=(select auth.uid()));
create policy qa_f6_modelos_insert on public.qa_modelos_cenario
 for insert to authenticated with check (user_id=(select auth.uid()));
create policy qa_f6_modelos_delete on public.qa_modelos_cenario
 for delete to authenticated using (user_id=(select auth.uid()));

comment on table public.qa_modelos_cenario is
 'Biblioteca privada de roteiros; nunca armazena status de execução, resultado observado ou evidências.';

-- Security invoker: toda agregação obedece às RLS das TFs, cenários e histórico.
-- As métricas de módulo/versão são do estado ATUAL. Eventos históricos são
-- alterações registradas a partir da implantação F4, não execuções inferidas.
create or replace function public.qa_insights_v1(p_months integer default 6)
returns jsonb language sql stable security invoker set search_path=''
as $$
  with visible as (
    select t.id,
      coalesce(nullif(btrim(t.sistema),''),'Sem módulo') as modulo,
      coalesce(nullif(btrim(t.versao),''),'Sem versão') as versao,
      t.status as situacao
    from public.qa_tarefas t
  ),
  case_stats as (
    select c.tarefa_id,
      count(*)::integer as casos,
      count(*) filter(where c.status <> 'nao_executado')::integer as executados,
      count(*) filter(where c.status in ('reprovado','bloqueado'))::integer as problemas
    from public.qa_cenarios c
      join visible v on v.id=c.tarefa_id
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
$$;
revoke all on function public.qa_insights_v1(integer) from public,anon,authenticated;
grant execute on function public.qa_insights_v1(integer) to authenticated;
comment on function public.qa_insights_v1(integer)
 is 'RLS-safe monthly status transitions, current coverage by module and task version; never implies automatic approval.';
