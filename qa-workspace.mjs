// Shared, side-effect free helpers for TF-oriented QA workflows.
// The same parser powers the generator preview and the regression tests.
export const TASK_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = value => String(value ?? '').trim();
const clean = value => text(value).replace(/\r/g, '').replace(/[\t ]+$/gm, '').replace(/\n{3,}/g, '\n\n');
const normalized = value => text(value).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
export const scenarioIdentity = item => [item.titulo,item.passos,item.esperado].map(normalized).join('\u241f');

export function taskToGeneratorText(task) {
  const parts = [
    ['Código',task.codigo],['Título',task.titulo],['Tipo de teste',task.tipo_teste],
    ['Sistema / módulo',task.sistema],['Versão',task.versao],
    ['O que foi testado',task.descricao],['Como funciona',task.explicacao],
    ['Problema e causa',task.causa],['O que foi alterado',task.correcao]
  ];
  // Do not automatically send client identifiers, test databases, conclusions,
  // observations or environment secrets to an external model.
  return parts.filter(([,value])=>text(value)).map(([label,value])=>label+': '+text(value)).join('\n\n');
}

export function parseGeneratedCases(markdown) {
  const raw = String(markdown ?? '').replace(/\r\n?/g, '\n');
  const headers = [...raw.matchAll(/^##[ \t]+Cen[aá]rio\b([^\n]*)$/gim)];
  const result = [];
  for (let index=0; index<headers.length; index++) {
    const start = headers[index].index + headers[index][0].length;
    const untilNextHeading = raw.slice(start).search(/^##[ \t]+/m);
    const end = untilNextHeading<0 ? raw.length : start + untilNextHeading;
    const segment = raw.slice(start,end);
    const rawTitle = headers[index][1].replace(/^\s*\d+\s*(?:[—–:-]\s*)?/, '').replace(/^[—–:-]\s*/, '').trim();
    const title = clean(rawTitle).replace(/\*\*/g,'').slice(0,240) || 'Cenário '+(index+1);
    const blocks = [...segment.matchAll(/^###[ \t]+([^\n]+)\n([\s\S]*?)(?=^###[ \t]+|$(?![\s\S]))/gm)];
    const fields = new Map(blocks.map(match=>[
      normalized(match[1]).normalize('NFD').replace(/[\u0300-\u036f]/g,''),
      clean(match[2].replace(/\n---\s*$/,''))
    ]));
    const steps = fields.get('passos') || fields.get('passo a passo') || '';
    const expected = fields.get('resultado esperado') || fields.get('resultados esperados') || '';
    const objective = fields.get('cenario') || fields.get('objetivo') || '';
    const prerequisites = fields.get('pre-requisitos') || fields.get('precondicoes') || '';
    const additional=[
      ['Objetivo',objective],
      ['Tipo de teste',fields.get('tipo de teste')||''],
      ['Prioridade',fields.get('prioridade')||''],
      ['Pré-condições',prerequisites],
      ['Massa de dados',fields.get('massa de dados')||fields.get('dados de teste')||''],
      ['Requisito/regra coberto',fields.get('requisito coberto')||fields.get('requisitos cobertos')||''],
      ['Origem na TF',fields.get('origem na tf')||fields.get('referencia na tf')||''],
      ['A confirmar',fields.get('pendencias a confirmar')||fields.get('pendencias')||'']
    ];
    const observations=additional.filter(([,v])=>v).map(([label,content])=>
      label+':\n'+content).join('\n\n');
    result.push({
      source_index:index+1, titulo:title, passos:steps, esperado:expected,
      observacoes:observations, selected:true
    });
  }
  return result;
}

export function markScenarioDuplicates(candidates,existing=[]) {
  const seen = new Set(existing.map(scenarioIdentity));
  return candidates.map(item=>{
    const identity = scenarioIdentity(item);
    const duplicate = seen.has(identity);
    seen.add(identity);
    return {...item,duplicate,selected:item.selected!==false&&!duplicate};
  });
}

export function validateReviewedCases(items) {
  if (!Array.isArray(items) || items.length>100) throw new Error('Selecione no máximo 100 casos por operação.');
  return items.map((item,index)=>{
    const titulo=text(item.titulo),passos=clean(item.passos),esperado=clean(item.esperado);
    if (titulo.length<3||titulo.length>240) throw new Error('O título do caso '+(index+1)+' deve ter 3 a 240 caracteres.');
    if (!passos||!esperado) throw new Error('Informe passos e resultado esperado no caso '+(index+1)+'.');
    if (passos.length>20000||esperado.length>20000) throw new Error('O caso '+(index+1)+' ultrapassa o limite de texto.');
    const notes=clean(item.observacoes);
    if(notes.length>20000)throw new Error('Observações do caso '+(index+1)+' acima do limite, revise antes de salvar.');
    return {source_index:String(item.source_index||index+1),titulo,passos,esperado,
      observacoes:notes};
  });
}

export async function attachReviewedCases(client,{taskId,generationId,items}) {
  if (!TASK_UUID.test(taskId)||!TASK_UUID.test(generationId)) throw new Error('Vínculo ou geração inválidos.');
  const payload = validateReviewedCases(items);
  if (!payload.length) throw new Error('Selecione ao menos um caso.');
  const {data,error}=await client.rpc('qa_attach_generated_cases',{
    p_tarefa_id:taskId,p_geracao_id:generationId,p_itens:payload
  });
  if (error) throw error;
  return data;
}
