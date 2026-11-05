import { parseReport } from './qa-parser.mjs';

// All extraction runs in the browser. Never send QA reports to an external API.
export const ASSIST_FIELD_LIMITS = Object.freeze({
  codigo:120, titulo:240, tipo_teste:7, sistema:200, versao:120, ambiente:160,
  base_teste:160, empresa:200, testador:200, descricao:30000, explicacao:30000,
  causa:30000, correcao:30000, conclusao:30000, observacoes:30000
});
export const ASSIST_SCENARIO_LIMIT=50;
const clean = v => typeof v === 'string' ? v.trim() : '';
const pick = (text,re) => clean(text.match(re)?.[1]);
const safeTitle = raw => clean(raw).replace(/\s+/g,' ').slice(0,240);
const sectionHeads = [
  ['descricao', /^(?:O QUE FOI TESTADO|DESCRI[CÇ][ÃA]O DO TESTE|OBJETIVO DO TESTE)\s*[:?—-]*\s*(.*)$/i],
  ['causa', /^(?:QUAL [ÉE] O PROBLEMA IDENTIFICADO\??|PROBLEMA(?: E CAUSA)?|CAUSA RAIZ|AN[ÁA]LISE DE VIABILIDADE)\s*[:?—-]*\s*(.*)$/i],
  ['correcao', /^(?:O QUE (?:O DESENVOLVEDOR )?ALTEROU\??|CORRE[CÇ][ÃA]O APLICADA|ALTERA[CÇ][ÃA]O REALIZADA)\s*[:?—-]*\s*(.*)$/i],
  ['explicacao', /^(?:COMO FUNCIONA\??|EXPLICA[CÇ][ÃA]O DO FLUXO)\s*[:?—-]*\s*(.*)$/i],
  ['conclusao', /^(?:CONCLUS[ÃA]O|RESULTADO FINAL)\s*[:?—-]*\s*(.*)$/i],
  ['observacoes', /^(?:OBS(?:ERVA[CÇ][ÕO]ES)?\s*(?:ADD|ADICIONAIS)?|RESSALVAS)\s*[:?—-]*\s*(.*)$/i]
];

export function normalizeDraft(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Resposta inválida: era esperado um objeto de campos.');
  const fields={};
  for(const [key,max] of Object.entries(ASSIST_FIELD_LIMITS)){
    if(key==='tipo_teste'){
      const kind=clean(raw[key]).toUpperCase();
      if(kind==='BUILD'||kind==='RELEASE') fields[key]=kind;
      continue;
    }
    const value=clean(raw[key]).slice(0,max);
    if(value)fields[key]=value;
  }
  const scenarios=Array.isArray(raw.cenarios) ? raw.cenarios.slice(0,ASSIST_SCENARIO_LIMIT).map((item,index)=>({
    ordem:index+1,
    titulo:safeTitle(item?.titulo||('Cenário '+(index+1))),
    passos:clean(item?.passos).slice(0,30000),
    esperado:clean(item?.esperado).slice(0,30000),
    obtido:clean(item?.obtido).slice(0,30000),
    observacoes:clean(item?.observacoes).slice(0,30000),
    // Extracted text must not be interpreted as an executed or approved test.
    status:'nao_executado'
  })) : [];
  return {fields,cenarios:scenarios};
}

function splitSections(text){
  const sections={}; let current=null;
  for(const line of text.split('\n')){
    const stripped=line.trim();
    if(/^[-—–]{3,}$/.test(stripped))continue;
    let matched=false;
    for(const [name,re] of sectionHeads){
      const match=stripped.match(re);
      if(match){
        current=name;
        sections[name] ??=[];
        if(match[1])sections[name].push(match[1]);
        matched=true;break;
      }
    }
    if(matched)continue;
    if(/^(?:TIPO DE TESTE|CEN[ÁA]RIOS? TESTADOS|VALIDA[CÇ][ÃA]O FINAL|CEN[ÁA]RIO\s+\d+)\b/i.test(stripped)) {
      current=null; continue;
    }
    if(current)sections[current].push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([key,lines])=>[key,lines.join('\n').trim()]));
}

export function extractLocalDraft(raw){
  if(typeof raw!=='string'||!raw.trim())throw Error('Cole o texto da TF para analisar.');
  if(raw.length>30000)throw Error('Para o preenchimento rápido, use até 30.000 caracteres.');
  const text=raw.replace(/\r\n?/g,'\n').trim();
  const sections=splitSections(text);
  let report=null;
  try {report=parseReport(text);} catch { /* Freeform QA notes are allowed. */ }
  const explicitTitle=pick(text,/^(?:T[ÍI]TULO(?: DA TAREFA)?|ASSUNTO)\s*:\s*(.+)$/im);
  const code=pick(text,/\b(?:TF|TAREFA)\s*[#:º°-]?\s*(\d{3,12})\b/i)
    ||pick(text,/\b(?:PEDIDO|CHAMADO)\s*[#:º°-]?\s*(\d{3,12})\b/i);
  const version=pick(text,/\b(?:VERS[ÃA]O|VERSAO|V\.)\s*[:#-]?\s*(\d+(?:\.\d+){1,5})\b/i);
  const firstRelevant=text.split('\n').map(x=>x.trim()).find(line=>
    line.length>5 && !/^[-—–\[\]]+$/.test(line) &&
    !/^(?:TIPO DE TESTE|O QUE FOI TESTADO|CEN[ÁA]RIO|QUAL [ÉE] O PROBLEMA IDENTIFICADO|VALIDA[CÇ][ÃA]O FINAL)\b/i.test(line)
  )||'';
  const description=sections.descricao || report?.descricao ||
    (!Object.keys(sections).length ? text.slice(0,30000) : '');
  const rawTitle=explicitTitle || (description.split('\n').find(x=>x.trim().length>5)||'') ||
    firstRelevant || 'Nova tarefa de teste';
  let kind=pick(text,/^TIPO DE TESTE\s*:\s*(BUILD|RELEASE)\b/im).toUpperCase();
  if(!kind)kind=/\[\s*[xX]\s*\]\s*RELEASE/i.test(text)?'RELEASE':
    /\[\s*[xX]\s*\]\s*BUILD/i.test(text)?'BUILD':'';
  const result={
    titulo:safeTitle(rawTitle).slice(0,240),
    codigo:code,
    versao:version,
    tipo_teste:kind,
    sistema:pick(text,/^(?:SISTEMA(?:\s*\/\s*M[ÓO]DULO)?|M[ÓO]DULO)\s*:\s*(.+)$/im),
    ambiente:pick(text,/^AMBIENTE\s*:\s*(.+)$/im),
    base_teste:pick(text,/^BASE(?:\s+DE\s+TESTE)?\s*:\s*(.+)$/im),
    empresa:pick(text,/^EMPRESA\s*:\s*(.+)$/im),
    testador:pick(text,/^(?:TESTADOR|RESPONS[ÁA]VEL)\s*:\s*(.+)$/im),
    descricao:description,
    explicacao:sections.explicacao||'',
    causa:sections.causa||'',
    correcao:sections.correcao||'',
    conclusao:sections.conclusao||report?.conclusao||'',
    observacoes:sections.observacoes||report?.observacoes||'',
    cenarios:report?.cenarios||[]
  };
  return normalizeDraft(result);
}

const schema={
  type:'object',
  additionalProperties:false,
  properties:{
    codigo:{type:'string'},titulo:{type:'string'},tipo_teste:{type:'string'},
    sistema:{type:'string'},versao:{type:'string'},ambiente:{type:'string'},
    base_teste:{type:'string'},empresa:{type:'string'},testador:{type:'string'},
    descricao:{type:'string'},explicacao:{type:'string'},causa:{type:'string'},
    correcao:{type:'string'},conclusao:{type:'string'},observacoes:{type:'string'},
    cenarios:{type:'array',items:{type:'object',additionalProperties:false,properties:{
      titulo:{type:'string'},passos:{type:'string'},esperado:{type:'string'},
      obtido:{type:'string'},observacoes:{type:'string'}
    },required:['titulo','passos','esperado','obtido','observacoes']}}
  },
  required:[...Object.keys(ASSIST_FIELD_LIMITS),'cenarios']
};

export async function extractWithBrowserAI(text,model=globalThis.LanguageModel,onProgress=()=>{}){
  if(!model?.availability || !model?.create){
    throw Error('A IA local não está disponível neste navegador. Use "Extrair sem IA".');
  }
  if(text.length>16000)throw Error('Para a IA local, reduza o texto para até 16.000 caracteres.');
  const availability=await model.availability();
  if(availability==='unavailable')throw Error('A IA local não é compatível com este dispositivo ou idioma. Use a extração sem IA.');
  onProgress(availability==='available'?'Analisando com IA local…':'Preparando o modelo local do navegador…');
  let session;
  try{
    session=await model.create({monitor(m){
      m?.addEventListener?.('downloadprogress',e=>onProgress('Baixando o modelo local: '+Math.round((e.loaded||0)*100)+'%'));
    }});
    const instruction=[
      'Extraia somente informações afirmadas explicitamente no relatório de QA em português a seguir.',
      'Retorne estritamente um objeto JSON que corresponda ao esquema solicitado.',
      'Não invente código TF, versão, ambiente, ações, resultados ou critérios de aceite.',
      'Use strings vazias para campos ausentes e lista vazia para cenários ausentes.',
      'Transforme os passos dos cenários em texto sem mudar o sentido.',
      'Não infira aprovação do teste a partir do texto.',
      'Texto do relatório:',
      text
    ].join('\n');
    const response=await session.prompt(instruction,{responseConstraint:schema});
    const result=JSON.parse(response);
    return normalizeDraft(result);
  }catch(e){
    if(e instanceof SyntaxError)throw Error('A IA não retornou dados válidos. Tente a extração sem IA.');
    throw e;
  }finally{session?.destroy?.();}
}
