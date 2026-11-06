-- QA Hub / Fase 1: vincular casos gerados a uma TF existente.
-- Aditivo: preserva colunas e registros atuais. Execute no projeto SIA do QA Hub.
alter table public.qa_cenarios
  add column if not exists origem_geracao uuid,
  add column if not exists origem_item text;

create unique index if not exists qa_cenarios_origem_geracao_item_uidx
  on public.qa_cenarios (tarefa_id, origem_geracao, origem_item)
  where origem_geracao is not null and origem_item is not null;

create or replace function public.qa_attach_generated_cases(
  p_tarefa_id uuid,
  p_geracao_id uuid,
  p_itens jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_owner uuid;
  v_ordem integer;
  v_item jsonb;
  v_titulo text;
  v_passos text;
  v_esperado text;
  v_observacoes text;
  v_source text;
  v_count integer;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_position integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'É necessário entrar na conta.' using errcode = '42501';
  end if;
  if p_tarefa_id is null or p_geracao_id is null then
    raise exception 'TF e geração são obrigatórias.' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'Os casos precisam formar uma lista.' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_itens);
  if v_count < 1 or v_count > 100 then
    raise exception 'Informe de 1 a 100 casos.' using errcode = '22023';
  end if;

  -- A role "authenticated" executa como invoker: RLS define quais TFs
  -- podem ser alteradas. A linha pai é bloqueada durante o lote.
  select t.user_id into v_owner
    from public.qa_tarefas t
   where t.id = p_tarefa_id
   for update;
  if v_owner is null then
    raise exception 'TF indisponível ou sem permissão de edição.' using errcode = '42501';
  end if;

  select coalesce(max(s.ordem),0) into v_ordem
    from public.qa_cenarios s where s.tarefa_id = p_tarefa_id;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_position := v_position + 1;
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Caso inválido na posição %', v_position using errcode = '22023';
    end if;
    v_titulo := btrim(coalesce(v_item->>'titulo',''));
    v_passos := btrim(coalesce(v_item->>'passos',''));
    v_esperado := btrim(coalesce(v_item->>'esperado',''));
    v_observacoes := btrim(coalesce(v_item->>'observacoes',''));
    v_source := coalesce(nullif(btrim(v_item->>'source_index'),''),v_position::text);

    if char_length(v_titulo) not between 3 and 240
      or char_length(v_passos) not between 1 and 20000
      or char_length(v_esperado) not between 1 and 20000
      or char_length(v_observacoes) > 20000
      or char_length(v_source) > 120 then
      raise exception 'Campos incompletos ou muito longos no caso %', v_position using errcode = '22023';
    end if;

    -- Idempotência pela origem e deduplicação de conteúdo.
    if exists (
      select 1 from public.qa_cenarios s
       where s.tarefa_id = p_tarefa_id
         and (
           (s.origem_geracao = p_geracao_id and s.origem_item = v_source)
           or (
             lower(regexp_replace(btrim(s.titulo),'[[:space:]]+',' ','g')) = lower(regexp_replace(v_titulo,'[[:space:]]+',' ','g'))
             and lower(regexp_replace(btrim(s.passos),'[[:space:]]+',' ','g')) = lower(regexp_replace(v_passos,'[[:space:]]+',' ','g'))
             and lower(regexp_replace(btrim(s.esperado),'[[:space:]]+',' ','g')) = lower(regexp_replace(v_esperado,'[[:space:]]+',' ','g'))
           )
         )
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_ordem := v_ordem + 1;
    insert into public.qa_cenarios
      (tarefa_id,user_id,ordem,titulo,passos,esperado,observacoes,status,origem_geracao,origem_item)
    values
      (p_tarefa_id,v_owner,v_ordem,v_titulo,v_passos,v_esperado,v_observacoes,'nao_executado',p_geracao_id,v_source);
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('inserted',v_inserted,'skipped',v_skipped,'tarefa_id',p_tarefa_id);
end;
$fn$;

-- PostgREST RPC: não expor a função a usuários anônimos.
revoke all on function public.qa_attach_generated_cases(uuid,uuid,jsonb) from public, anon;
grant execute on function public.qa_attach_generated_cases(uuid,uuid,jsonb) to authenticated;

comment on function public.qa_attach_generated_cases(uuid,uuid,jsonb)
  is 'Anexa em transação casos revisados à mesma TF, com RLS, deduplicação e status não executado.';
