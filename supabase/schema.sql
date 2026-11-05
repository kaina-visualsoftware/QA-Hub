-- QA Hub · estrutura inicial para executar no SQL Editor do projeto Supabase autorizado.
-- Execute uma única vez. Nenhuma senha ou service_role deve ser usada no frontend.
create table if not exists public.qa_tarefas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo text not null default '',
  titulo text not null check (length(btrim(titulo)) between 3 and 240),
  tipo_teste text not null default 'BUILD' check (tipo_teste in ('BUILD','RELEASE')),
  status text not null default 'rascunho'
    check (status in ('rascunho','em_teste','aprovado','reprovado','bloqueado')),
  sistema text not null default '',
  versao text not null default '',
  ambiente text not null default '',
  base_teste text not null default '',
  empresa text not null default '',
  testador text not null default '',
  descricao text not null default '',
  explicacao text not null default '',
  causa text not null default '',
  correcao text not null default '',
  conclusao text not null default '',
  observacoes text not null default '',
  erro_reproduzido boolean,
  funcionando boolean,
  executado_em date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qa_cenarios (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ordem integer not null default 0 check (ordem >= 0),
  titulo text not null check (length(btrim(titulo)) between 3 and 240),
  passos text not null default '',
  esperado text not null default '',
  obtido text not null default '',
  status text not null default 'nao_executado'
    check (status in ('nao_executado','aprovado','reprovado','bloqueado')),
  observacoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qa_diagramas (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 160),
  conteudo text not null check (length(conteudo) <= 16000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qa_tarefas_usuario_data_idx
  on public.qa_tarefas(user_id, executado_em desc, created_at desc);
create index if not exists qa_tarefas_usuario_status_idx
  on public.qa_tarefas(user_id, status);
create index if not exists qa_cenarios_tarefa_ordem_idx
  on public.qa_cenarios(tarefa_id, ordem);
create index if not exists qa_cenarios_usuario_idx
  on public.qa_cenarios(user_id);
create index if not exists qa_diagramas_tarefa_idx
  on public.qa_diagramas(tarefa_id);
create index if not exists qa_diagramas_usuario_idx
  on public.qa_diagramas(user_id);

alter table public.qa_tarefas enable row level security;
alter table public.qa_cenarios enable row level security;
alter table public.qa_diagramas enable row level security;

revoke all on public.qa_tarefas, public.qa_cenarios, public.qa_diagramas from anon, authenticated;
grant select, insert, update, delete on public.qa_tarefas, public.qa_cenarios, public.qa_diagramas to authenticated;

create policy "qa_tarefas_por_proprietario" on public.qa_tarefas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "qa_cenarios_por_proprietario" on public.qa_cenarios
  for all to authenticated
  using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.qa_tarefas t
      where t.id = tarefa_id and t.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.qa_tarefas t
      where t.id = tarefa_id and t.user_id = (select auth.uid())
    )
  );

create policy "qa_diagramas_por_proprietario" on public.qa_diagramas
  for all to authenticated
  using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.qa_tarefas t
      where t.id = tarefa_id and t.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.qa_tarefas t
      where t.id = tarefa_id and t.user_id = (select auth.uid())
    )
  );

-- Auditoria rápida (deve retornar true para as três tabelas):
-- select relname, relrowsecurity from pg_class
-- where oid in ('public.qa_tarefas'::regclass,'public.qa_cenarios'::regclass,'public.qa_diagramas'::regclass);
