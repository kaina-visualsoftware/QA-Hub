-- Issue #37: public read API. Run ONLY on an isolated/staging database first.
-- Phase A: install both allowlisted functions before changing any existing readers.
-- A function body must never return the underlying row wholesale.
-- SECURITY DEFINER is required for opt-in published rows after direct SELECT is revoked.
-- Explicit grants, fixed search_path and a publication predicate limit its scope.

create or replace function public.qa_public_tasks_v1()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_object(
    'id', t.id,
    'titulo', t.titulo,
    'codigo', t.codigo,
    'tipo_teste', t.tipo_teste,
    'sistema', t.sistema,
    'versao', t.versao,
    'executado_em', t.executado_em
  )
  from public.qa_tarefas as t
  where t.publica is true
  order by t.executado_em desc nulls last, t.id
  limit 150;
$fn$;

create or replace function public.qa_public_task_v1(p_task_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_object(
    'task', pg_catalog.jsonb_build_object(
      'id', t.id,
      'titulo', t.titulo,
      'codigo', t.codigo,
      'tipo_teste', t.tipo_teste,
      'sistema', t.sistema,
      'versao', t.versao,
      'executado_em', t.executado_em,
      'status', t.status,
      'descricao', t.descricao,
      'explicacao', t.explicacao,
      'causa', t.causa,
      'correcao', t.correcao,
      'conclusao', t.conclusao,
      'observacoes', t.observacoes
    ),
    'scenarios', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', s.id,
          'titulo', s.titulo,
          'ordem', s.ordem,
          'passos', s.passos,
          'esperado', s.esperado,
          'obtido', s.obtido,
          'observacoes', s.observacoes,
          'status', s.status
        ) order by s.ordem, s.id
      )
      from (
        select id, titulo, ordem, passos, esperado, obtido, observacoes, status
        from public.qa_cenarios
        where tarefa_id = p_task_id
        order by ordem, id
        limit 300
      ) as s
    ), '[]'::jsonb),
    'diagrams', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', d.id,
          'titulo', d.titulo,
          'conteudo', d.conteudo
        ) order by d.created_at, d.id
      )
      from (
        select id, titulo, conteudo, created_at
        from public.qa_diagramas
        where tarefa_id = p_task_id
        order by created_at, id
        limit 100
      ) as d
    ), '[]'::jsonb)
  )
  from public.qa_tarefas as t
  where t.id = p_task_id and t.publica is true;
$fn$;

-- PostgreSQL grants EXECUTE to PUBLIC by default on new functions.
revoke all on function public.qa_public_tasks_v1() from public;
revoke all on function public.qa_public_task_v1(uuid) from public;
grant execute on function public.qa_public_tasks_v1() to anon, authenticated;
grant execute on function public.qa_public_task_v1(uuid) to anon, authenticated;

-- No changes to direct table grants/policies in this additive phase.
-- Execute Phase B only after BOTH the legacy page and React use these RPCs.
