-- Additive explicit opt-in for each image. Private bucket stays PRIVATE.
-- Apply database migration BEFORE deploying the public image proxy.
-- Existing files remain private, even when their TF is already published.
alter table public.qa_evidencia_arquivos
  add column if not exists publica boolean not null default false;

alter table public.qa_evidencia_arquivos
  drop constraint if exists qa_public_evidence_image_only;
alter table public.qa_evidencia_arquivos
  add constraint qa_public_evidence_image_only check(
    publica is false or (
      cenario_id is not null and
      mime_type in ('image/png','image/jpeg','image/webp')
    )
  );

-- Restrict the only editable field. Other metadata remains append-only.
grant update(publica) on public.qa_evidencia_arquivos to authenticated;
drop policy if exists qa_f3_files_publish on public.qa_evidencia_arquivos;
create policy qa_f3_files_publish on public.qa_evidencia_arquivos
for update to authenticated using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.qa_tarefas t
    where t.id=tarefa_id and t.user_id=(select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.qa_tarefas t
    where t.id=tarefa_id and t.user_id=(select auth.uid())
  )
  and (publica is false or (
    cenario_id is not null and
    mime_type in ('image/png','image/jpeg','image/webp')
    and exists(
      select 1 from public.qa_cenarios s
      where s.id=cenario_id and s.tarefa_id=qa_evidencia_arquivos.tarefa_id
    )
  ))
);

-- Read-only public projection: no object paths, file bytes or owners.
-- The private image proxy separately checks both flags on EVERY request.

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
          and publica is true
          and cenario_id is not null
          and mime_type in ('image/png','image/jpeg','image/webp')
        order by created_at, id
        limit 100
      ) as e
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



revoke all on function public.qa_public_task_v1(uuid) from public;
grant execute on function public.qa_public_task_v1(uuid) to anon, authenticated;

comment on column public.qa_evidencia_arquivos.publica is
  'Per-image explicit permission to show via the private image proxy when the TF is published.';
