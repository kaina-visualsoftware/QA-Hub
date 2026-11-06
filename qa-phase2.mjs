// QA Hub phase 2: report composition and document versioning contracts.
// Data in reports must always originate from persisted qa_cenarios records.
export const EXECUTION_STATUSES = Object.freeze({
  nao_executado:'Não executado', aprovado:'Aprovado',
  reprovado:'Reprovado', bloqueado:'Bloqueado'
});
const value = input => String(input??'').trim();
const label = (content,fallback='Não informado') => value(content)||fallback;
const VALID_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function executionSummary(scenarios=[]) {
  const count={nao_executado:0,aprovado:0,reprovado:0,bloqueado:0};
  for(const s of scenarios){
    const status=Object.hasOwn(EXECUTION_STATUSES,s.status)?s.status:'nao_executado';
    count[status]++;
  }
  return {total:scenarios.length,...count,finalizados:scenarios.length-count.nao_executado};
}

export function buildExecutionReport(task,scenarios=[],createdAt=new Date()) {
  if(!task || !value(task.titulo))throw Error('Selecione uma TF válida.');
  if(!Array.isArray(scenarios))throw Error('A lista de cenários é inválida.');
  const summary=executionSummary(scenarios);
  const date=new Date(createdAt);
  const stamp=Number.isNaN(date.getTime())?new Date().toISOString():date.toISOString();
  const lines=[
    '# RELATÓRIO DE EXECUÇÃO — '+(task.codigo?'TF '+task.codigo+' — ':'')+task.titulo,
    '',
    '**Tipo:** '+label(task.tipo_teste),
    '**Módulo:** '+label(task.sistema),
    '**Versão:** '+label(task.versao),
    '**Data do relatório:** '+stamp,
    '**Situação registrada da TF:** '+label(task.status),
    '',
    '## Resumo',
    '',
    '- Total de cenários: '+summary.total,
    '- Aprovados: '+summary.aprovado,
    '- Reprovados: '+summary.reprovado,
    '- Bloqueados: '+summary.bloqueado,
    '- Não executados: '+summary.nao_executado,
    '',
    '> Os resultados refletem apenas o estado persistido de cada cenário. A geração do relatório não aprova a TF.',
    ''
  ];
  if(!summary.total)lines.push('Nenhum cenário cadastrado nesta TF.','');
  for(const [index,scenario] of scenarios.entries()){
    const status=Object.hasOwn(EXECUTION_STATUSES,scenario.status)?scenario.status:'nao_executado';
    lines.push(
      '## Cenário '+String(index+1).padStart(2,'0')+' — '+label(scenario.titulo,'Sem título'),
      '',
      '**Status:** '+EXECUTION_STATUSES[status],
      '',
      '### Passos',
      label(scenario.passos,'Não registrados'),
      '',
      '### Resultado esperado',
      label(scenario.esperado,'Não informado'),
      '',
      '### Resultado obtido',
      label(scenario.obtido,'Ainda não registrado'),
      '',
      '### Observações',
      label(scenario.observacoes,'Nenhuma'),
      ''
    );
  }
  lines.push('## Conclusão registrada na TF','',label(task.conclusao,'Aguardando conclusão do testador.'),'');
  return lines.join('\n');
}

export function cleanDocumentName(text,extension='md'){
  const slug=value(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^[-.]+|[-.]+$/g,'')
    .slice(0,90);
  return (slug||'documento-qa')+'.'+extension;
}

export async function saveTfDocument(client,{taskId,type,title,content,source='manual'}){
  if(!VALID_UUID.test(String(taskId)))throw Error('Selecione uma TF válida.');
  if(!['post','relatorio'].includes(type))throw Error('Tipo de documento inválido.');
  if(!['gerado','execucao','manual'].includes(source))throw Error('Origem inválida.');
  if(value(title).length<3||value(title).length>240)throw Error('Informe um título de 3 a 240 caracteres.');
  if(!value(content)||value(content).length>80000)throw Error('Informe um documento com até 80.000 caracteres.');
  const {data,error}=await client.rpc('qa_save_document',{
    p_tarefa_id:taskId,p_tipo:type,p_titulo:value(title),
    p_conteudo:value(content),p_origem:source
  });
  if(error)throw error;
  if(!data||data.tarefa_id!==taskId)throw Error('O documento não foi confirmado no banco.');
  return data;
}

export function selectedScenarioContext(task,scenarios=[],ids=[]) {
  const selected=new Set(ids);
  const filtered=scenarios.filter(s=>selected.has(s.id));
  return {selected:filtered,ids:filtered.map(s=>s.id)};
}
