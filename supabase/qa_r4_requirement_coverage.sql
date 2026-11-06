-- QA Hub R4: TF requirement-to-scenario traceability, atomic linkage, private
-- immutable requirement revisions. Additive after R1–R3; existing tests retain
-- their recorded statuses and task metadata. No automatic approval of cases.

-- Composite keys make linking a requirement to a scenario from another TF
-- impossible even if someone bypasses the UI.
create unique index if not exists qa_r4_requirement_identity
  on public.qa_requisitos(id,tarefa_id,user_id);
create unique index if not exists qa_r4_scenario_identity
  on public.qa_cenarios(id,tarefa_id,user_id);

create table if not exists public.qa_requisito_cenarios (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null,
  user_id uuid not null,
  requisito_id uuid not null,
  cenario_id uuid not null,
  created_at timestamptz not null default now(),
  constraint qa_r4_link_unique unique(requisito_id,cenario_id),
  constraint qa_r4_link_task_owner foreign key(tarefa_id,user_id)
    references public.qa_tarefas(id,user_id) on delete cascade,
  constraint qa_r4_link_requirement foreign key(requisito_id,tarefa_id,user_id)
    references public.qa_requisitos(id,tarefa_id,user_id) on delete cascade,
  constraint qa_r4_link_scenario foreign key(cenario_id,tarefa_id,user_id)
    references public.qa_cenarios(id,tarefa_id,user_id) on delete cascade
);
create index if not exists qa_r4_links_task_idx
  on public.qa_requisito_cenarios(tarefa_id,user_id);
create index if not exists qa_r4_links_requirement_idx
  on public.qa_requisito_cenarios(requisito_id,tarefa_id,user_id);
create index if not exists qa_r4_links_scenario_idx
  on public.qa_requisito_cenarios(cenario_id,tarefa_id,user_id);

alter table public.qa_requisito_cenarios enable row level security;
revoke all on public.qa_requisito_cenarios from anon,authenticated;
grant select,insert,delete on public.qa_requisito_cenarios to authenticated;
create policy qa_r4_links_read on public.qa_requisito_cenarios
  for select to authenticated
  using(
    user_id=(select auth.uid())
    and exists (select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  );
create policy qa_r4_links_insert on public.qa_requisito_cenarios
  for insert to authenticated
  with check(
    user_id=(select auth.uid())
    and exists (select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
    and exists (select 1 from public.qa_requisitos r
      where r.id=requisito_id and r.tarefa_id=tarefa_id
        and r.user_id=(select auth.uid()) and r.estado='aprovado')
    and exists (select 1 from public.qa_cenarios c
      where c.id=cenario_id and c.tarefa_id=tarefa_id
        and c.user_id=(select auth.uid()))
  );
create policy qa_r4_links_delete on public.qa_requisito_cenarios
  for delete to authenticated
  using(
    user_id=(select auth.uid())
    and exists (select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  );

-- Replace only the chosen requirement's links, within one transaction.
-- No UPDATEs to qa_cenarios, qa_requisitos or qa_tarefas occur here.
create or replace function public.qa_set_requirement_scenarios(
  p_tarefa_id uuid,p_requisito_id uuid,p_cenario_ids uuid[]
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_total integer;
  v_valid integer;
  v_deleted integer:=0;
  v_inserted integer:=0;
begin
  if v_uid is null or not exists(
    select 1 from public.qa_tarefas t
    where t.id=p_tarefa_id and t.user_id=v_uid
  ) or not exists (
    select 1 from public.qa_requisitos r
    where r.id=p_requisito_id and r.tarefa_id=p_tarefa_id
      and r.user_id=v_uid and r.estado='aprovado'
  ) then
    raise exception 'TF ou requisito aprovado indisponível' using errcode='42501';
  end if;
  if p_cenario_ids is null or cardinality(p_cenario_ids)>200 then
    raise exception 'Selecione até 200 cenários' using errcode='22023';
  end if;
  v_total:=cardinality(p_cenario_ids);
  if (select count(distinct id) from unnest(p_cenario_ids) as raw(id))<>v_total then
    raise exception 'IDs de cenário repetidos' using errcode='22023';
  end if;
  select count(*) into v_valid from public.qa_cenarios c
    where c.id=any(p_cenario_ids)
      and c.tarefa_id=p_tarefa_id and c.user_id=v_uid;
  if v_valid<>v_total then
    raise exception 'Um cenário não pertence à TF em foco' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_requisito_id::text,0));
  delete from public.qa_requisito_cenarios l
    where l.tarefa_id=p_tarefa_id and l.requisito_id=p_requisito_id
      and l.user_id=v_uid and not(l.cenario_id=any(p_cenario_ids));
  get diagnostics v_deleted = row_count;
  insert into public.qa_requisito_cenarios(
    tarefa_id,user_id,requisito_id,cenario_id)
    select p_tarefa_id,v_uid,p_requisito_id,c.id
    from public.qa_cenarios c
    where c.id=any(p_cenario_ids)
      and c.tarefa_id=p_tarefa_id and c.user_id=v_uid
    on conflict(requisito_id,cenario_id) do nothing;
  get diagnostics v_inserted = row_count;
  return jsonb_build_object(
    'tarefa_id',p_tarefa_id,'requisito_id',p_requisito_id,
    'linked',v_total,'inserted',v_inserted,'removed',v_deleted);
end;
$$;
revoke all on function public.qa_set_requirement_scenarios(uuid,uuid,uuid[])
  from public,anon,authenticated;
grant execute on function public.qa_set_requirement_scenarios(uuid,uuid,uuid[])
  to authenticated;

-- Immutable history of changes from the moment R4 is deployed.
alter table public.qa_requisitos
  add column if not exists versao integer not null default 1
    check(versao between 1 and 1000000);
create table if not exists public.qa_requisito_revisoes(
  id uuid primary key default gen_random_uuid(),
  requisito_id uuid not null,
  tarefa_id uuid not null,
  user_id uuid not null,
  versao integer not null check(versao>=1),
  codigo text not null,
  tipo text not null,
  titulo text not null,
  descricao text not null,
  criterios_aceite text not null,
  estado text not null,
  origem_trecho text not null,
  ordem integer not null,
  created_at timestamptz not null default now(),
  constraint qa_r4_revision_unique unique(requisito_id,versao),
  constraint qa_r4_revision_owner foreign key(requisito_id,tarefa_id,user_id)
    references public.qa_requisitos(id,tarefa_id,user_id) on delete cascade
);
create index if not exists qa_r4_revisions_task_idx
  on public.qa_requisito_revisoes(tarefa_id,user_id,created_at desc);
alter table public.qa_requisito_revisoes enable row level security;
revoke all on public.qa_requisito_revisoes from anon,authenticated;
grant select on public.qa_requisito_revisoes to authenticated;
create policy qa_r4_revision_read on public.qa_requisito_revisoes
  for select to authenticated
  using(
    user_id=(select auth.uid())
    and exists(select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  );

-- Baseline is only the state present when R4 starts; earlier historical
-- edits cannot be reconstructed, and R3 generation snapshots remain separate.
insert into public.qa_requisito_revisoes(
  requisito_id,tarefa_id,user_id,versao,codigo,tipo,titulo,
  descricao,criterios_aceite,estado,origem_trecho,ordem)
select r.id,r.tarefa_id,r.user_id,r.versao,r.codigo,r.tipo,r.titulo,
  r.descricao,r.criterios_aceite,r.estado,r.origem_trecho,r.ordem
from public.qa_requisitos r
on conflict(requisito_id,versao) do nothing;

-- Trigger runs in an unexposed schema; clients cannot write version records.
create schema if not exists qa_internal;
revoke all on schema qa_internal from public,anon,authenticated;
create or replace function qa_internal.qa_r4_requirement_version()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if (select auth.uid()) is not null
     and new.user_id<>(select auth.uid()) then
    raise exception 'Requisito de outra conta' using errcode='42501';
  end if;
  if (old.codigo,old.tipo,old.titulo,old.descricao,
      old.criterios_aceite,old.estado,old.origem_trecho,old.ordem)
     is distinct from
     (new.codigo,new.tipo,new.titulo,new.descricao,
      new.criterios_aceite,new.estado,new.origem_trecho,new.ordem) then
    new.versao:=old.versao+1;
  else
    new.versao:=old.versao;
  end if;
  return new;
end;
$$;
create or replace function qa_internal.qa_r4_store_revision()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.versao<>old.versao then
    insert into public.qa_requisito_revisoes(
      requisito_id,tarefa_id,user_id,versao,codigo,tipo,titulo,
      descricao,criterios_aceite,estado,origem_trecho,ordem
    ) values(
      new.id,new.tarefa_id,new.user_id,new.versao,new.codigo,new.tipo,
      new.titulo,new.descricao,new.criterios_aceite,new.estado,
      new.origem_trecho,new.ordem
    );
  end if;
  return null;
end;
$$;
revoke all on function qa_internal.qa_r4_requirement_version() from public,anon,authenticated;
revoke all on function qa_internal.qa_r4_store_revision() from public,anon,authenticated;
drop trigger if exists qa_r4_requirement_version on public.qa_requisitos;
create trigger qa_r4_requirement_version before update on public.qa_requisitos
  for each row execute function qa_internal.qa_r4_requirement_version();
drop trigger if exists qa_r4_store_revision on public.qa_requisitos;
create trigger qa_r4_store_revision after update on public.qa_requisitos
  for each row when(new.versao<>old.versao)
  execute function qa_internal.qa_r4_store_revision();
comment on table public.qa_requisito_cenarios is
  'Private approved requirement to TF scenario relations; does not change execution status.';
comment on table public.qa_requisito_revisoes is
  'Read-only recorded versions from R4 onwards. Existing rows received a baseline.';
