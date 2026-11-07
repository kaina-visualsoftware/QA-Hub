// R4 — deterministic coverage of APPROVED requirements by SAVED TF scenarios.
// This is traceability, not execution: a requirement is only "validated" when
// all linked scenarios have an actual persisted approved status.
export const COVERAGE_STATES=Object.freeze({
  sem_cenario:'Sem cenários',
  nao_executado:'Não executado',
  parcial:'Execução pendente',
  bloqueado:'Bloqueado',
  reprovado:'Com falha',
  validado:'Validado'
});
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const validTaskUuid=id=>typeof id==='string'&&UUID.test(id);
export function calculateRequirementCoverage(requirements=[],scenarios=[],links=[],taskId){
  if(!validTaskUuid(taskId))throw Error('Informe uma TF válida para calcular cobertura.');
  if(!Array.isArray(requirements)||!Array.isArray(scenarios)||!Array.isArray(links))
    throw Error('Listas de requisitos, cenários e vínculos inválidas.');
  const eligible=requirements.filter(r=>r.tarefa_id===taskId&&r.estado==='aprovado')
    .sort((a,b)=>(Number(a.ordem)||0)-(Number(b.ordem)||0)||
      String(a.codigo).localeCompare(String(b.codigo),'pt-BR'));
  const scenariosById=new Map(scenarios.filter(s=>s.tarefa_id===taskId).map(s=>[s.id,s]));
  const linkedByRequirement=new Map();
  const usedKeys=new Set();
  for(const link of links){
    if(link.tarefa_id!==taskId||!scenariosById.has(link.cenario_id))continue;
    const key=link.requisito_id+'|'+link.cenario_id;
    if(usedKeys.has(key))continue;
    usedKeys.add(key);
    if(!linkedByRequirement.has(link.requisito_id))
      linkedByRequirement.set(link.requisito_id,[]);
    linkedByRequirement.get(link.requisito_id).push(scenariosById.get(link.cenario_id));
  }
  const items=eligible.map(requirement=>{
    const cases=linkedByRequirement.get(requirement.id)||[];
    const count={nao_executado:0,aprovado:0,reprovado:0,bloqueado:0};
    for(const scenario of cases){
      const status=Object.hasOwn(count,scenario.status)?scenario.status:'nao_executado';
      count[status]++;
    }
    let coverage='sem_cenario';
    if(cases.length){
      if(count.reprovado)coverage='reprovado';
      else if(count.bloqueado)coverage='bloqueado';
      else if(count.nao_executado)coverage=count.nao_executado===cases.length?'nao_executado':'parcial';
      else coverage='validado';
    }
    return {...requirement,cases,linkedCount:cases.length,
      executedCount:count.aprovado+count.reprovado+count.bloqueado,
      statusCounts:count,coverage};
  });
  const totals={total:items.length,linked:0,unlinked:0,validated:0,
    pending:0,blocked:0,failed:0,executed:0,linkedCases:new Set()};
  for(const item of items){
    if(item.linkedCount){
      totals.linked++;
      item.cases.forEach(s=>totals.linkedCases.add(s.id));
    }else totals.unlinked++;
    if(item.coverage==='validado')totals.validated++;
    if(item.coverage==='reprovado')totals.failed++;
    if(item.coverage==='bloqueado')totals.blocked++;
    if(item.coverage==='nao_executado'||item.coverage==='parcial')totals.pending++;
    if(item.linkedCount&&item.executedCount===item.linkedCount)totals.executed++;
  }
  return {items,totals:{
    total:totals.total,linked:totals.linked,unlinked:totals.unlinked,
    validated:totals.validated,pending:totals.pending,blocked:totals.blocked,
    failed:totals.failed,fullyExecuted:totals.executed,
    distinctLinkedCases:totals.linkedCases.size,
    coveragePercent:totals.total?Math.round(100*totals.linked/totals.total):0,
    validationPercent:totals.total?Math.round(100*totals.validated/totals.total):0
  }};
}
export async function saveRequirementScenarioLinks(db,{taskId,requirementId,scenarioIds}){
  if(!validTaskUuid(taskId)||!validTaskUuid(requirementId)||
     !Array.isArray(scenarioIds)||scenarioIds.length>200||
     scenarioIds.some(id=>!validTaskUuid(id))||
     new Set(scenarioIds).size!==scenarioIds.length)
    throw Error('Informe uma TF, requisito e até 200 cenários válidos e únicos.');
  const {data,error}=await db.rpc('qa_set_requirement_scenarios',{
    p_tarefa_id:taskId,p_requisito_id:requirementId,p_cenario_ids:scenarioIds
  });
  if(error)throw error;
  if(data?.tarefa_id!==taskId||data.requisito_id!==requirementId||
     Number(data.linked)!==scenarioIds.length)
    throw Error('O banco não confirmou os vínculos da TF.');
  return data;
}
export function coverageCsv(items=[]){
  const field=value=>{
    let text=String(value??'').replace(/[\r\n\t]+/g,' ').trim();
    // Spreadsheet formulas cannot execute when a CSV is opened.
    if(/^[=+\-@]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  const header=['Código','Tipo','Título','Estado','Situação da cobertura',
    'Total de cenários','Cenários executados','Cenários vinculados','Resultado dos cenários'];
  const lines=[header.map(field).join(';')];
  for(const item of items){
    const details=(item.cases||[]).map(s=>s.titulo+' ('+(s.status||'nao_executado')+')').join(' | ');
    const cells=[item.codigo,item.tipo,item.titulo,item.estado,
      COVERAGE_STATES[item.coverage]||item.coverage,item.linkedCount,
      item.executedCount,(item.cases||[]).map(x=>x.titulo).join(' | '),details];
    lines.push(cells.map(field).join(';'));
  }
  return '\ufeff'+lines.join('\r\n');
}
