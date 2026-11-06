-- QA Hub R3: private append-only provenance of requirements used by AI outputs.
-- Does not send or store binary attachments. Existing TFs and documents remain unchanged.
create table if not exists public.qa_geracao_contextos(
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null,
  user_id uuid not null,
  tipo text not null check(tipo in ('post','teste','diagrama')),
  artefato_ref text not null check(char_length(artefato_ref) between 1 and 120),
  requisitos_snapshot jsonb not null,
  quantidade integer not null check(quantidade between 1 and 100),
  created_at timestamptz not null default now(),
  constraint qa_r3_context_array check (
    jsonb_typeof(requisitos_snapshot)='array'
    and jsonb_array_length(requisitos_snapshot)=quantidade
    and pg_column_size(requisitos_snapshot) <= 120000
  ),
  foreign key(tarefa_id,user_id)
    references public.qa_tarefas(id,user_id) on delete cascade
);
create unique index if not exists qa_r3_context_output_unique
  on public.qa_geracao_contextos(tarefa_id,tipo,artefato_ref);
create index if not exists qa_r3_context_task_idx
  on public.qa_geracao_contextos(tarefa_id,created_at desc);
create index if not exists qa_r3_context_user_idx
  on public.qa_geracao_contextos(user_id,created_at desc);

alter table public.qa_geracao_contextos enable row level security;
revoke all on public.qa_geracao_contextos from anon,authenticated;
grant select,insert on public.qa_geracao_contextos to authenticated;

create policy qa_r3_context_read on public.qa_geracao_contextos
  for select to authenticated
  using (
    user_id=(select auth.uid())
    and exists(select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
  );
create policy qa_r3_context_insert on public.qa_geracao_contextos
  for insert to authenticated
  with check (
    user_id=(select auth.uid())
    and exists(select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid()))
    and not exists(
      select 1
        from jsonb_array_elements(requisitos_snapshot) AS selected(item)
        where jsonb_typeof(selected.item)<>'object'
          or not exists(
            select 1 from public.qa_requisitos r
            where r.id::text=selected.item->>'id'
              and r.tarefa_id=qa_geracao_contextos.tarefa_id
              and r.user_id=(select auth.uid())
              and r.estado='aprovado'
              and r.codigo=selected.item->>'codigo'
              and r.tipo=selected.item->>'tipo'
              and r.titulo=selected.item->>'titulo'
              and r.descricao=selected.item->>'descricao'
              and r.criterios_aceite=selected.item->>'criterios_aceite'
              and r.updated_at=(selected.item->>'updated_at')::timestamptz
          )
    )
  );

comment on table public.qa_geracao_contextos is
  'Private immutable snapshots of TF-approved requirements included by the user in an AI post, test plan, or diagram; no file bytes or transient complements.';
