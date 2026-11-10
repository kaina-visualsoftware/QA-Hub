-- Apply AFTER qa_public_evidence_optin.sql, R1–R4, F3 and document migrations.
-- One visibility setting: qa_tarefas.publica. Existing and future attachments
-- inherit it. No anonymous table grants and no public Storage buckets.
begin;
drop policy if exists qa_f3_files_publish on public.qa_evidencia_arquivos;
revoke update(publica) on public.qa_evidencia_arquivos from authenticated;
alter table public.qa_evidencia_arquivos drop constraint if exists qa_public_evidence_image_only;
comment on column public.qa_evidencia_arquivos.publica is
 'Deprecated compatibility field; ignored. Visibility is inherited from qa_tarefas.publica.';

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
      ) as s
    ), '[]'::jsonb),
    'evidencias', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', e.id,
          'cenario_id', e.cenario_id,
          'nome_original', e.nome_original,
          'descricao', e.descricao,
          'mime_type', e.mime_type
        ) order by e.created_at, e.id
      )
      from (
        select id, cenario_id, nome_original, descricao, mime_type, created_at
        from public.qa_evidencia_arquivos
        where tarefa_id = p_task_id
          and user_id = t.user_id
        order by created_at, id
      ) as e
    ), '[]'::jsonb),
    'documents', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id,
        'tipo', r.tipo,
        'titulo', r.titulo,
        'conteudo', r.conteudo,
        'versao', r.versao,
        'created_at', r.created_at
      ) order by r.created_at desc, r.id)
      from public.qa_documentos r
      where r.tarefa_id=p_task_id and r.user_id=t.user_id
    ), '[]'::jsonb),
    'requirements', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id,
        'codigo', r.codigo,
        'tipo', r.tipo,
        'titulo', r.titulo,
        'descricao', r.descricao,
        'criterios_aceite', r.criterios_aceite,
        'estado', r.estado,
        'ordem', r.ordem
      ) order by r.ordem, r.id)
      from public.qa_requisitos r
      where r.tarefa_id=p_task_id and r.user_id=t.user_id
    ), '[]'::jsonb),
    'sources', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id,
        'tipo_fonte', r.tipo_fonte,
        'nome_arquivo', r.nome_arquivo,
        'mime', r.mime,
        'versao', r.versao,
        'texto_extraido', r.texto_extraido,
        'created_at', r.created_at
      ) order by r.created_at desc, r.id)
      from public.qa_requisito_fontes r
      where r.tarefa_id=p_task_id and r.user_id=t.user_id
    ), '[]'::jsonb),
    'notes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id,
        'cenario_id', r.cenario_id,
        'tipo', r.tipo,
        'resumo', r.resumo,
        'referencia', r.referencia,
        'created_at', r.created_at
      ) order by r.created_at, r.id)
      from public.qa_evidencias r
      where r.tarefa_id=p_task_id and r.user_id=t.user_id
    ), '[]'::jsonb),
    'coverage', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id,
        'requisito_id', r.requisito_id,
        'cenario_id', r.cenario_id
      ) order by r.id)
      from public.qa_requisito_cenarios r
      where r.tarefa_id=p_task_id and r.user_id=t.user_id
    ), '[]'::jsonb),
    'releases', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', r.id, 'versao', r.versao))
      from public.qa_releases r join public.qa_release_tarefas l on l.release_id=r.id
      where l.tarefa_id=p_task_id and r.user_id=t.user_id and l.user_id=t.user_id), '[]'::jsonb),
    'comparisons', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', r.id, 'tipo', r.tipo,
      'adicionados', r.adicionados, 'removidos', r.removidos, 'alterados', r.alterados))
      from public.qa_artefatos r where r.tarefa_id=p_task_id and r.user_id=t.user_id), '[]'::jsonb),
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
      ) as d
    ), '[]'::jsonb)
  )
  from public.qa_tarefas as t
  where t.id = p_task_id and t.publica is true;
$fn$;

revoke all on function public.qa_public_task_v1(uuid) from public;
grant execute on function public.qa_public_task_v1(uuid) to anon, authenticated;

commit;
