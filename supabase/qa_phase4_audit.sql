-- QA Hub / Fase 4 — evidências textuais e auditoria append-only.
-- Migration aditiva; não altera nem apaga históricos, TFs ou casos existentes.

create table if not exists public.qa_evidencias (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
  cenario_id uuid references public.qa_cenarios(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('observacao','log','captura','referencia')),
  resumo text not null check (char_length(btrim(resumo)) between 3 and 2000),
  referencia text not null default '' check (
    referencia = '' or
    (char_length(referencia) <= 1500 and referencia ~ '^https://[^[:space:]]+$')
  ),
  created_at timestamptz not null default now()
);
create index if not exists qa_evidencias_tf_idx
  on public.qa_evidencias(tarefa_id,created_at desc);
alter table public.qa_evidencias enable row level security;
revoke all on public.qa_evidencias from anon,authenticated;
grant select,insert on public.qa_evidencias to authenticated;
create policy qa_evidencias_read on public.qa_evidencias
  for select to authenticated
  using (exists (
    select 1 from public.qa_tarefas t
    where t.id=tarefa_id and t.user_id=qa_evidencias.user_id
      and (t.user_id=(select auth.uid()) or exists (
        select 1 from public.qa_admins a where a.user_id=(select auth.uid())
      ))
  ));
create policy qa_evidencias_write on public.qa_evidencias
  for insert to authenticated
  with check (
    user_id=(select auth.uid()) and exists (
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid())
    ) and (
      cenario_id is null or exists (
        select 1 from public.qa_cenarios s
        where s.id=cenario_id and s.tarefa_id=qa_evidencias.tarefa_id
      )
    )
  );

-- Sem UPDATE/DELETE para preservar a trilha do testador. Os metadados de
-- auditoria não contêm resultados obtidos, XML, logs, senhas ou observações.
create table if not exists public.qa_eventos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  acao text not null check (char_length(acao) between 3 and 60),
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists qa_eventos_tf_idx
  on public.qa_eventos(tarefa_id,created_at desc);
alter table public.qa_eventos enable row level security;
revoke all on public.qa_eventos from anon,authenticated;
grant select on public.qa_eventos to authenticated;
create policy qa_eventos_read on public.qa_eventos
  for select to authenticated
  using (exists (
    select 1 from public.qa_tarefas t
    where t.id=tarefa_id and t.user_id=qa_eventos.user_id
      and (t.user_id=(select auth.uid()) or exists (
        select 1 from public.qa_admins a where a.user_id=(select auth.uid())
      ))
  ));

-- A função de gatilho não está no schema exposto ao PostgREST,
-- não aceita SQL dinâmico e não permite INSERT/UPDATE/DELETE de eventos via API.
create schema if not exists qa_private;
revoke all on schema qa_private from public,anon,authenticated;

create or replace function qa_private.audit_qa_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $audit$
declare
  v_tarefa_id uuid;
  v_owner uuid;
  v_action text;
  v_details jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is null then return new; end if;
  if tg_table_name = 'qa_tarefas' then
    if tg_op <> 'UPDATE' or old.status is not distinct from new.status then return new; end if;
    v_tarefa_id := new.id; v_owner := new.user_id;
    v_action := 'tf.status';
    v_details := jsonb_build_object('anterior',old.status,'novo',new.status);
  elsif tg_table_name = 'qa_cenarios' then
    v_tarefa_id := new.tarefa_id; v_owner := new.user_id;
    if tg_op = 'INSERT' then
      v_action := 'cenario.criado';
      v_details := jsonb_build_object('status',new.status);
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
      v_action := 'cenario.status';
      v_details := jsonb_build_object('anterior',old.status,'novo',new.status);
    else
      return new;
    end if;
  elsif tg_table_name = 'qa_documentos' and tg_op = 'INSERT' then
    v_tarefa_id := new.tarefa_id; v_owner := new.user_id;
    v_action := 'documento.versao';
    v_details := jsonb_build_object('tipo',new.tipo,'versao',new.versao);
  elsif tg_table_name = 'qa_release_tarefas' and tg_op = 'INSERT' then
    v_tarefa_id := new.tarefa_id; v_owner := new.user_id;
    v_action := 'release.vinculada';
  elsif tg_table_name = 'qa_artefatos' and tg_op = 'INSERT' then
    v_tarefa_id := new.tarefa_id; v_owner := new.user_id;
    v_action := 'comparacao.registrada';
    v_details := jsonb_build_object('tipo',new.tipo);
  elsif tg_table_name = 'qa_evidencias' and tg_op = 'INSERT' then
    v_tarefa_id := new.tarefa_id; v_owner := new.user_id;
    v_action := 'evidencia.criada';
    v_details := jsonb_build_object('tipo',new.tipo);
  else
    return new;
  end if;

  insert into public.qa_eventos(tarefa_id,user_id,actor_id,acao,detalhes)
  values (v_tarefa_id,v_owner,(select auth.uid()),v_action,v_details);
  return new;
end;
$audit$;
revoke all on function qa_private.audit_qa_change() from public,anon,authenticated;

create trigger qa_audit_tf_status after update on public.qa_tarefas
  for each row execute function qa_private.audit_qa_change();
create trigger qa_audit_scenario after insert or update on public.qa_cenarios
  for each row execute function qa_private.audit_qa_change();
create trigger qa_audit_document after insert on public.qa_documentos
  for each row execute function qa_private.audit_qa_change();
create trigger qa_audit_release after insert on public.qa_release_tarefas
  for each row execute function qa_private.audit_qa_change();
create trigger qa_audit_comparison after insert on public.qa_artefatos
  for each row execute function qa_private.audit_qa_change();
create trigger qa_audit_evidence after insert on public.qa_evidencias
  for each row execute function qa_private.audit_qa_change();

comment on table public.qa_eventos is
  'Eventos gerados por gatilhos internos; somente SELECT autorizado. Não registra conteúdos confidenciais.';
comment on table public.qa_evidencias is
  'Referências e anotações de evidência anexadas a uma TF, com autorização por proprietário.';
