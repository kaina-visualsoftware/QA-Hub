// Pure phase-3 contracts. No confidential comparison payloads are persisted.
export const TASK_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const plain=value=>String(value??'').trim();

export function coverageMetrics(tasks=[],scenarios=[]) {
  const allowed=new Set(tasks.map(task=>task.id));
  const scoped=scenarios.filter(s=>allowed.has(s.tarefa_id));
  const tested=scoped.filter(s=>['aprovado','reprovado','bloqueado'].includes(s.status));
  const coveredIds=new Set(scoped.map(s=>s.tarefa_id));
  return {
    totalTasks:tasks.length,withCases:coveredIds.size,
    withoutCases:Math.max(0,tasks.length-coveredIds.size),
    totalCases:scoped.length,executed:tested.length,
    unexecuted:scoped.length-tested.length,
    coveragePct:scoped.length?Math.round(tested.length*100/scoped.length):0,
    approved:tested.filter(s=>s.status==='aprovado').length,
    failed:tested.filter(s=>s.status==='reprovado').length,
    blocked:tested.filter(s=>s.status==='bloqueado').length
  };
}
export function normalizeReleaseVersion(input) {
  const version=plain(input);
  if(!/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(version))
    throw new Error('Use uma versão no formato 12.10.06.0000.');
  return version;
}
export function exactTaskCodePresent(code,numbers=[]) {
  const value=plain(code).replace(/^#/,'');
  return /^\d{4,7}$/.test(value) && numbers.some(n=>plain(n).replace(/^#/,'')===value);
}
export function comparisonCounters(type,values){
  if(!['diff_texto','diff_xml'].includes(type))throw Error('Tipo de comparação inválido.');
  const keys=['adicionados','removidos','alterados'],stats={tipo:type};
  for(const key of keys){
    const n=Number(values?.[key]??0);
    if(!Number.isInteger(n)||n<0||n>100000)throw Error('Contagem de diferenças inválida: '+key);
    stats[key]=n;
  }
  // Never accept original text, paths, XML values or descriptions.
  return stats;
}
export function validateReference({titulo,conteudo,categoria}){
  const title=plain(titulo),body=plain(conteudo);
  if(!['checklist','regra','nota'].includes(categoria))throw Error('Categoria inválida.');
  if(title.length<3||title.length>160)throw Error('Informe um título entre 3 e 160 caracteres.');
  if(body.length<3||body.length>2000)throw Error('O conteúdo deve ter 3 a 2.000 caracteres.');
  const txt=title+'\n'+body;
  if(/(?:senha|password|token|secret|api[\s_-]?key|bearer|authorization)\s*[:=]/i.test(txt)
    || /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(txt)
    || /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.test(txt))
    throw Error('Não armazene senhas, tokens, CPFs, CNPJs ou dados pessoais nas referências.');
  return {titulo:title,conteudo:body,categoria};
}
export async function linkTaskRelease(client,{taskId,version}){
  if(!TASK_UUID.test(String(taskId)))throw Error('Selecione uma TF válida.');
  const {data,error}=await client.rpc('qa_link_release',{
    p_tarefa_id:taskId,p_versao:normalizeReleaseVersion(version)
  });
  if(error)throw error;
  if(!TASK_UUID.test(String(data)))throw Error('Vínculo não confirmado pelo banco.');
  return data;
}
export async function recordComparison(client,{taskId,userId,type,values}){
  if(!TASK_UUID.test(String(taskId))||!TASK_UUID.test(String(userId)))
    throw Error('TF ou sessão inválida.');
  const stats=comparisonCounters(type,values);
  const {data,error}=await client.from('qa_artefatos')
    .insert({tarefa_id:taskId,user_id:userId,...stats}).select('id').single();
  if(error)throw error;
  if(!data?.id)throw Error('Comparação não confirmada pelo banco.');
  return data;
}
export async function createReference(client,{userId,...fields}){
  if(!TASK_UUID.test(String(userId)))throw Error('Entre na conta.');
  const data=validateReference(fields);
  const {data:row,error}=await client.from('qa_referencias')
    .insert({...data,user_id:userId}).select('id').single();
  if(error)throw error;
  if(!row?.id)throw Error('Referência não foi confirmada pelo banco.');
  return row;
}
