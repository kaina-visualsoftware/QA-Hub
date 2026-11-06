-- QA Hub — Fase 2: documentos versionados e origem de diagramas.
-- Migration aditiva: os registros existentes não são modificados.
create table if not exists public.qa_documentos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('post','relatorio')),
  titulo text not null check (char_length(btrim(titulo)) between 3 and 240),
  conteudo text not null check (char_length(btrim(conteudo)) between 1 and 80000),
  formato text not null default 'markdown' check (formato = 'markdown'),
  origem text not null default 'manual' check (origem in ('gerado','execucao','manual')),
  versao integer not null check (versao between 1 and 1000000),
  created_at timestamptz not null default now(),
  unique (tarefa_id,tipo,versao)
);
create index if not exists qa_documentos_tarefa_tipo_idx
  on public.qa_documentos(tarefa_id,tipo,versao desc);
alter table public.qa_documentos enable row level security;
revoke all on public.qa_documentos from anon,authenticated;
grant select, insert on public.qa_documentos to authenticated;

-- Os documentos ficam privados mesmo quando a TF é pública na galeria.
-- O autor deve corresponder ao proprietário da TF. Administradores podem
-- consultar e criar versões sem reivindicar a propriedade de outra conta.
create policy qa_documentos_select on public.qa_documentos
for select to authenticated
using (
  exists (
    select 1 from public.qa_tarefas t where t.id=tarefa_id and t.user_id=qa_documentos.user_id
    and (
      t.user_id=(select auth.uid())
      or exists(select 1 from public.qa_admins a where a.user_id=(select auth.uid()))
    )
  )
);
create policy qa_documentos_insert on public.qa_documentos
for insert to authenticated
with check (
  exists (
    select 1 from public.qa_tarefas t where t.id=tarefa_id and t.user_id=qa_documentos.user_id
    and (
      t.user_id=(select auth.uid())
      or exists(select 1 from public.qa_admins a where a.user_id=(select auth.uid()))
    )
  )
);

-- Serializa uma nova versão por TF e tipo, não altera revisões anteriores.
-- SECURITY INVOKER preserva as políticas RLS do invocador.
create or replace function public.qa_save_document(
  p_tarefa_id uuid,
  p_tipo text,
  p_titulo text,
  p_conteudo text,
  p_origem text default 'manual'
)
returns public.qa_documentos
language plpgsql
security invoker
set search_path=''
as $fn$
declare
  v_owner uuid;
  v_previous public.qa_documentos%rowtype;
  v_saved public.qa_documentos%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação necessária.' using errcode='42501';
  end if;
  if p_tarefa_id is null or p_tipo not in ('post','relatorio')
    or p_origem not in ('gerado','execucao','manual')
    or char_length(btrim(coalesce(p_titulo,''))) not between 3 and 240
    or char_length(btrim(coalesce(p_conteudo,''))) not between 1 and 80000 then
    raise exception 'Documento incompleto ou inválido.' using errcode='22023';
  end if;
  select t.user_id into v_owner
    from public.qa_tarefas t
   where t.id=p_tarefa_id
   for update;
  if v_owner is null then
    raise exception 'TF indisponível ou sem permissão.' using errcode='42501';
  end if;

  select d.* into v_previous
    from public.qa_documentos d
   where d.tarefa_id=p_tarefa_id and d.tipo=p_tipo
   order by d.versao desc limit 1;

  if v_previous.id is not null
     and v_previous.titulo=btrim(p_titulo)
     and v_previous.conteudo=btrim(p_conteudo) then
    return v_previous;
  end if;
  insert into public.qa_documentos
    (tarefa_id,user_id,tipo,titulo,conteudo,origem,versao)
  values
    (p_tarefa_id,v_owner,p_tipo,btrim(p_titulo),btrim(p_conteudo),
     p_origem,coalesce(v_previous.versao,0)+1)
  returning * into v_saved;
  return v_saved;
end;
$fn$;
revoke all on function public.qa_save_document(uuid,text,text,text,text) from public,anon;
grant execute on function public.qa_save_document(uuid,text,text,text,text) to authenticated;

-- Diagramas já são filhos da TF; origem e seleção de cenários são
-- metadados opcionais para recuperação/explicação da geração.
alter table public.qa_diagramas
  add column if not exists origem_tipo text not null default 'manual'
    check (origem_tipo in ('manual','tf','texto')),
  add column if not exists origem_cenarios uuid[] not null default '{}';

comment on table public.qa_documentos is
  'Versões imutáveis de posts e relatórios internos vinculados à TF, sem acesso anônimo.';
