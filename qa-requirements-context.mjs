// R3 — Shared, task-scoped requirement context for posts, test scripts and diagrams.
// Only the user's approved records are eligible. File contents are NEVER read.
export const REQUIREMENT_CONTEXT_LIMIT=20000;
export const REQUIREMENT_MAX_SELECTED=100;
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const clean=value=>String(value??'').replace(/\r\n?/g,'\n').trim();
export function assertTaskId(taskId){
  if(!UUID.test(String(taskId||'')))throw Error('Selecione uma TF válida.');
  return taskId;
}
export function requireAuthorizedTask(task,uid){
  if(!task||!uid||task.user_id!==uid||!UUID.test(String(task.id||'')))
    throw Error('Esta TF não pertence à sua conta. Seus requisitos privados não podem ser carregados.');
  return task.id;
}
export function approvedRequirementRows(rows,taskId){
  assertTaskId(taskId);
  if(!Array.isArray(rows))throw Error('Resposta de requisitos inválida.');
  return rows.filter(item=>item&&item.estado==='aprovado'&&item.tarefa_id===taskId)
    .map(item=>({
      id:String(item.id||''),tarefa_id:item.tarefa_id,
      codigo:clean(item.codigo),tipo:clean(item.tipo),titulo:clean(item.titulo),
      descricao:clean(item.descricao),criterios_aceite:clean(item.criterios_aceite),
      updated_at:String(item.updated_at||''),ordem:Number(item.ordem)||0
    })).sort((a,b)=>a.ordem-b.ordem||a.codigo.localeCompare(b.codigo,'pt-BR'));
}
export async function loadApprovedRequirements(db,task,uid){
  const taskId=requireAuthorizedTask(task,uid);
  const {data,error}=await db.from('qa_requisitos')
    .select('id,tarefa_id,codigo,tipo,titulo,descricao,criterios_aceite,estado,updated_at,ordem')
    .eq('tarefa_id',taskId).eq('estado','aprovado')
    .order('ordem',{ascending:true}).limit(501);
  if(error)throw Error('Falha ao carregar requisitos aprovados: '+(error.message||String(error)));
  if((data||[]).length>500)throw Error('Esta TF possui mais de 500 requisitos aprovados. Reduza a seleção antes de gerar.');
  return approvedRequirementRows(data||[],taskId);
}
export function formatRequirement(item){
  return '['+item.codigo+'] '+item.titulo+'\n'+
    'Descrição: '+item.descricao+
    (item.criterios_aceite?'\nCritérios de aceite: '+item.criterios_aceite:'');
}
export function composeRequirementContext(rows,selectedIds,complement='',{limit=REQUIREMENT_CONTEXT_LIMIT,taskId}={}){
  if(!Number.isInteger(limit)||limit<=0)throw Error('Limite de contexto inválido.');
  const values=taskId?approvedRequirementRows(rows,taskId):rows;
  const requested=new Set(Array.isArray(selectedIds)?selectedIds:[]);
  if(requested.size>REQUIREMENT_MAX_SELECTED)
    throw Error('Selecione no máximo '+REQUIREMENT_MAX_SELECTED+' requisitos por geração.');
  const selected=values.filter(row=>requested.has(row.id));
  if(selected.length!==requested.size)
    throw Error('A seleção possui requisitos indisponíveis ou de outra TF. Recarregue a tarefa.');
  const manual=clean(complement);
  const sections=[];
  if(selected.length)sections.push('REQUISITOS APROVADOS DA TF (somente itens selecionados):\n\n'+selected.map(formatRequirement).join('\n\n'));
  if(manual)sections.push('COMPLEMENTO INFORMADO PELO USUÁRIO (não altera os requisitos salvos):\n'+manual);
  const text=sections.join('\n\n');
  if(text.length>limit){
    const excess=text.length-limit;
    throw Error('Contexto de requisitos com '+text.length+' caracteres (limite '+limit+
      ', excesso de '+excess+'). Desmarque requisitos ou reduza o complemento. Nenhum item foi omitido automaticamente.');
  }
  return {
    text,length:text.length,selectedCount:selected.length,selectedIds:selected.map(row=>row.id),
    snapshots:selected.map(item=>({
      id:item.id,codigo:item.codigo,tipo:item.tipo,titulo:item.titulo,
      descricao:item.descricao,criterios_aceite:item.criterios_aceite,
      updated_at:item.updated_at
    }))
  };
}
export function combineDiagramContext(base,requirements,{limit=REQUIREMENT_CONTEXT_LIMIT}={}){
  const baseText=clean(base),requirementText=clean(requirements);
  const text=[baseText,requirementText].filter(Boolean).join('\n\n');
  if(text.length>limit)
    throw Error('O contexto do diagrama possui '+text.length+' caracteres, acima de '+limit+
      '. Desmarque requisitos, cenários ou reduza a descrição. Nada foi cortado silenciosamente.');
  return text;
}
// Context snapshots are private, append-only metadata linked to the TF and
// output. Save only after the generator actually produced a result; errors
// here must be surfaced but never erase a completed draft.
export async function recordRequirementUsage(db,{taskId,uid,type,artifactRef,snapshots}){
  assertTaskId(taskId);
  if(!uid||!['post','teste','diagrama'].includes(type))throw Error('Origem de geração inválida.');
  if(!Array.isArray(snapshots)||!snapshots.length)return null;
  if(snapshots.length>REQUIREMENT_MAX_SELECTED)throw Error('Quantidade de requisitos inválida.');
  const row={
    tarefa_id:taskId,user_id:uid,tipo:type,
    artefato_ref:String(artifactRef||'').slice(0,120),
    requisitos_snapshot:snapshots,
    quantidade:snapshots.length
  };
  const {data,error}=await db.from('qa_geracao_contextos').insert(row).select('id').single();
  if(error)throw error;
  if(!data?.id)throw Error('O banco não confirmou a rastreabilidade dos requisitos.');
  return data.id;
}
