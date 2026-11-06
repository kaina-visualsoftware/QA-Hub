// Pure Mermaid helpers shared by the editor and automated tests.
export function collectTaskContext(task,scenarios=[]){
  const labels=[
    ['Título',task.titulo],['Código',task.codigo],['Sistema',task.sistema],
    ['O que foi testado',task.descricao],['Como funciona',task.explicacao],
    ['Problema e causa',task.causa],['Correção',task.correcao],
    ['Conclusão',task.conclusao],['Observações',task.observacoes]
  ];
  const values=labels.filter(([,v])=>String(v||'').trim()).map(([k,v])=>k+': '+String(v).trim());
  for(const [index,s] of scenarios.slice(0,18).entries()){
    values.push('Cenário '+(index+1)+': '+(s.titulo||''));
    if(s.passos)values.push('Passos: '+s.passos);
    if(s.esperado)values.push('Resultado esperado: '+s.esperado);
    if(s.obtido)values.push('Resultado observado: '+s.obtido);
  }
  const text=values.join('\n');
  if(text.length>19500)
    throw Error('Os dados da TF e os cenários ultrapassam 19.500 caracteres. Selecione menos cenários antes de gerar; nenhum trecho será omitido.');
  return text;
}
const label=s=>String(s||'').replace(/[\x00-\x1f<>"\\\[\]{}|]/g,' ').replace(/\s+/g,' ').trim().slice(0,94);
export function fallbackFlowchart(text){
  const lines=String(text||'').split(/\n+/).map(s=>label(s.replace(/^[-•\d.)\s]+/,''))).filter(s=>s.length>5);
  const steps=lines.slice(0,7);
  if(steps.length===0)steps.push('Descrever o processo','Verificar o resultado');
  if(steps.length===1)steps.push('Validar o resultado');
  const ids='ABCDEFGH';
  return 'flowchart LR\n'+steps.map((s,i)=>{
    const a='  '+ids[i]+'["'+s+'"]';
    return i?'  '+ids[i-1]+' --> '+ids[i]+'\n'+a:a;
  }).join('\n');
}
// Keep every generated flowchart (including subgraphs) left-to-right.
// Do not rewrite other Mermaid diagram types or mutate existing stored records.
export function horizontalFlowchart(source){
  if(typeof source!=='string')return source;
  return source
    .replace(/^(\s*)(?:flowchart|graph)\s+(?:TD|TB|BT|RL|LR)\b/im,'$1flowchart LR')
    .replace(/^(\s*direction\s+)(?:TD|TB|BT|RL|LR)\b/gim,'$1LR');
}

export function cleanMermaid(source){
  let content=String(source||'').trim();
  if(!content||content.length>16000)throw Error('O diagrama está vazio ou ultrapassa 16.000 caracteres.');
  // Ignore surrounding prose and Markdown, keeping only a flowchart.
  const start=content.search(/(?:^|\n)\s*(?:flowchart|graph)\s+(?:TD|TB|LR|RL|BT)\b/i);
  if(start<0)throw Error('A IA não retornou um fluxograma Mermaid.');
  content=content.slice(start).trim().replace(/\x60{3}[\s\S]*$/,'').trim();
  if(content.length>16000)throw Error('O diagrama ultrapassa 16.000 caracteres.');
  if(!/^(?:flowchart|graph)\s+(?:TD|TB|LR|RL|BT)\b/i.test(content))throw Error('O fluxograma não tem um cabeçalho válido.');
  if(/%%\s*\{|\b(?:click|href|callback)\s+|javascript:|<\s*(?:script|iframe)|\b(?:accTitle|accDescr)\s*:/i.test(content))
    throw Error('O diagrama contém comandos não permitidos.');
  if(!/-->|---|==>|-.->/.test(content))throw Error('O diagrama não contém conexões entre etapas.');
  return horizontalFlowchart(content);
}
export async function requestAiDiagram({db,text,onProgress=()=>{}}){
  if(!db?.functions?.invoke)throw Error('Serviço de IA indisponível.');
  if(!String(text).trim())throw Error('Informe um texto para gerar o diagrama.');
  if(text.length>20000)throw Error('A descrição excede o limite de 20.000 caracteres.');
  onProgress('Analisando as etapas do processo…');
  const {data,error}=await db.functions.invoke('qa-ai',{body:{mode:'diagram',text},signal:AbortSignal.timeout(65000)});
  if(error){
    let info={};
    try{info=await error.context?.json?.()||{};}catch{}
    if(['ai_temporarily_unavailable','free_model_unavailable'].includes(info.error)){
      return {code:fallbackFlowchart(text),fallback:true};
    }
    throw Error(info.message||'Não foi possível gerar o diagrama agora.');
  }
  if(data?.mermaid){
    try{return {code:cleanMermaid(data.mermaid),fallback:false};}catch{}
  }
  return {code:fallbackFlowchart(text),fallback:true};
}
