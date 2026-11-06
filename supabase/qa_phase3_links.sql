-- QA Hub / Fase 3: releases, vínculos, comparações resumidas e referências não secretas.
-- Estrutura aditiva. Nenhum dado legado é alterado ou importado implicitamente.
create table if not exists public.qa_releases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  versao text not null check (char_length(versao) between 1 and 40),
  titulo text not null default '' check (char_length(titulo) <= 240),
  created_at timestamptz not null default now(),
  unique (user_id,versao)
);
create table if not exists public.qa_release_tarefas (
  release_id uuid not null references public.qa_releases(id) on delete cascade,
  tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(release_id,tarefa_id)
);
create index if not exists qa_release_tarefas_tarefa_idx on public.qa_release_tarefas(tarefa_id);
create table if not exists public.qa_artefatos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('diff_texto','diff_xml')),
  adicionados int not null default 0 check (adicionados between 0 and 100000),
  removidos int not null default 0 check (removidos between 0 and 100000),
  alterados int not null default 0 check (alterados between 0 and 100000),
  created_at timestamptz not null default now()
);
create index if not exists qa_artefatos_tarefa_idx on public.qa_artefatos(tarefa_id,created_at desc);

-- Apenas checklists e conhecimento técnico. Não armazenar acessos,
-- senhas, identificadores de pessoas nem conteúdo bruto de arquivos.
create table if not exists public.qa_referencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  categoria text not null check (categoria in ('checklist','regra','nota')),
  titulo text not null check (char_length(btrim(titulo)) between 3 and 160),
  conteudo text not null check (char_length(btrim(conteudo)) between 3 and 2000),
  created_at timestamptz not null default now(),
  constraint qa_referencias_sem_credenciais check (
    (titulo || ' ' || conteudo) !~* '(senha|password|token|secret|api[ _-]?key|bearer|authorization)[[:space:]]*[:=]'
  )
);
create index if not exists qa_referencias_user_idx on public.qa_referencias(user_id,created_at desc);

alter table public.qa_releases enable row level security;
alter table public.qa_release_tarefas enable row level security;
alter table public.qa_artefatos enable row level security;
alter table public.qa_referencias enable row level security;

revoke all on public.qa_releases,public.qa_release_tarefas,public.qa_artefatos,public.qa_referencias from anon,authenticated;
grant select,insert on public.qa_releases,public.qa_release_tarefas,public.qa_artefatos to authenticated;
grant select,insert,delete on public.qa_referencias to authenticated;

create policy qa_releases_read on public.qa_releases for select to authenticated
  using (user_id=(select auth.uid()));
create policy qa_releases_write on public.qa_releases for insert to authenticated
  with check (user_id=(select auth.uid()));
create policy qa_release_tarefas_read on public.qa_release_tarefas for select to authenticated
  using (
    user_id=(select auth.uid()) and exists (
      select 1 from public.qa_releases r where r.id=release_id and r.user_id=(select auth.uid())
    ) and exists (
      select 1 from public.qa_tarefas t where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  );
create policy qa_release_tarefas_write on public.qa_release_tarefas for insert to authenticated
  with check (
    user_id=(select auth.uid()) and exists (
      select 1 from public.qa_releases r where r.id=release_id and r.user_id=(select auth.uid())
    ) and exists (
      select 1 from public.qa_tarefas t where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  );
create policy qa_artefatos_read on public.qa_artefatos for select to authenticated
  using (
    user_id=(select auth.uid()) and exists (
      select 1 from public.qa_tarefas t where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  );
create policy qa_artefatos_write on public.qa_artefatos for insert to authenticated
  with check (
    user_id=(select auth.uid()) and exists (
      select 1 from public.qa_tarefas t where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  );
create policy qa_referencias_read on public.qa_referencias for select to authenticated
  using (user_id=(select auth.uid()));
create policy qa_referencias_write on public.qa_referencias for insert to authenticated
  with check (user_id=(select auth.uid()));
create policy qa_referencias_delete on public.qa_referencias for delete to authenticated
  using (user_id=(select auth.uid()));

-- Associação atômica de uma TF a uma release. Não infere vínculo por título,
-- número de versão ou texto copiado. Requer confirmação explícita da UI.
create or replace function public.qa_link_release(
  p_tarefa_id uuid,
  p_versao text
) returns uuid
language plpgsql security invoker set search_path=''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then raise exception 'Entre na conta.' using errcode='42501'; end if;
  if p_tarefa_id is null or char_length(btrim(coalesce(p_versao,''))) not between 1 and 40
    then raise exception 'TF e versão são obrigatórias.' using errcode='22023'; end if;
  if not exists (
    select 1 from public.qa_tarefas t where t.id=p_tarefa_id and t.user_id=v_uid
  ) then raise exception 'TF sem permissão para associação.' using errcode='42501'; end if;
  insert into public.qa_releases (user_id,versao)
    values(v_uid,btrim(p_versao))
    on conflict (user_id,versao) do nothing;
  select id into v_id from public.qa_releases
    where user_id=v_uid and versao=btrim(p_versao);
  if v_id is null then raise exception 'Release indisponível.' using errcode='42501'; end if;
  insert into public.qa_release_tarefas(release_id,tarefa_id,user_id)
    values(v_id,p_tarefa_id,v_uid)
    on conflict (release_id,tarefa_id) do nothing;
  return v_id;
end;
$fn$;
revoke all on function public.qa_link_release(uuid,text) from public,anon;
grant execute on function public.qa_link_release(uuid,text) to authenticated;

comment on table public.qa_artefatos is
  'Apenas contagens de diferenças por TF. NUNCA armazenar XML ou textos originais neste registro.';
comment on table public.qa_referencias is
  'Referências técnicas privadas, sem credenciais. Não importar informações de acesso do gerador legado.';
