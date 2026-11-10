import { parseReport } from './qa-parser.mjs';
import { cleanQaSourceText, formatQaSentenceCase } from './qa-text-cleaner.mjs';

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
  ['descricao', /^(?:O QUE FOI TESTADO|DESCRI[CÇ][ÃA]O DO TESTE|OBJETIVO DO TESTE|QUAL [ÉE] O PROBLEMA IDENTIFICADO\??|PROBLEMA(?: IDENTIFICADO)?|REQUISITOS?(?: FUNCIONAIS?)?|CRIT[ÉE]RIOS? DE ACEITE|NECESSIDADE)\s*[:?—-]*\s*(.*)$/i],
  ['causa', /^(?:PROBLEMA E CAUSA|CAUSA RAIZ|AN[ÁA]LISE DE VIABILIDADE|ORIGEM DO PROBLEMA)\s*[:?—-]*\s*(.*)$/i],
  ['correcao', /^(?:O QUE (?:O DESENVOLVEDOR )?ALTEROU\??|CORRE[CÇ][ÃA]O APLICADA|ALTERA[CÇ][ÃA]O REALIZADA)\s*[:?—-]*\s*(.*)$/i],
  ['explicacao', /^(?:COMO FUNCIONA\??|EXPLICA[CÇ][ÃA]O DO FLUXO)\s*[:?—-]*\s*(.*)$/i],
  ['conclusao', /^(?:CONCLUS[ÃA]O|RESULTADO FINAL)\s*[:?—-]*\s*(.*)$/i],
  ['observacoes', /^(?:OBS(?:ERVA[CÇ][ÕO]ES)?\s*(?:ADD|ADICIONAIS)?|RESSALVAS)\s*[:?—-]*\s*(.*)$/i]
];

/**
 * A pasted test and an AI-generated test share one canonical representation.
 * The database has no separate objective column, so it lives inside observations.
 * Already-written outcomes are retained as notes, never marked as approved.
 */
export function splitScenarioNotes(value){
  const text=formatQaSentenceCase(value||'').trim();
  const matched=text.match(/^Objetivo:\s*([\s\S]*?)(?=\n\s*\n(?:Observa[cç][õo]es|Resultado observado na TF):|$)/i);
  if(!matched)return {objetivo:'',observacoes:text};
  return {
    objetivo:matched[1].trim(),
    observacoes:text.slice(matched[0].length).replace(/^\s*(?:Observa[cç][õo]es:\s*)?/i,'').trim()
  };
}
const ACTION_VERBS=Object.freeze([
  [/^Acessad[oa]\b/i,'Acessar'],[/^Selecionad[oa]\b/i,'Selecionar'],
  [/^Utilizad[oa]\b/i,'Utilizar'],[/^Entrad[oa]\b/i,'Entrar'],
  [/^Abert[oa]\b|^Aberto\b/i,'Abrir'],[/^Marcado\b/i,'Marcar'],
  [/^Desmarcado\b/i,'Desmarcar'],[/^Fechad[oa]\b/i,'Fechar'],
  [/^Reabert[oa]\b/i,'Reabrir'],[/^Gerad[oa]\b/i,'Gerar'],
  [/^Anotad[oa]\b/i,'Anotar'],[/^Conferid[oa]\b/i,'Conferir'],
  [/^Verificad[oa]\s+que\b/i,'Verificar se'],
  [/^Confirmad[oa]\s+que\b/i,'Verificar se'],
  [/^Preenchid[oa]\b/i,'Preencher'],[/^Informad[oa]\b/i,'Informar'],
  [/^Observad[oa]\b/i,'Observar'],[/^Clicad[oa]\b/i,'Clicar']
]);
function actionInstruction(raw){
  let result=raw;
  for(const [pattern,replacement] of ACTION_VERBS){
    if(pattern.test(result)){result=result.replace(pattern,replacement);break;}
  }
  return result;
}

export function standardizeImportedScenario(item){
  const titulo=formatQaSentenceCase(item?.titulo||'').trim().replace(/^Cen[áa]rio\s*\d+\s*[-–—:.]\s*/i,'').slice(0,240);
  const content=formatQaSentenceCase(item?.passos||'').replace(/\\n/g,'\n');
  const passos=content.split(/\n|;\s+(?=(?:Abrir|Acessar|Entrar|Selecionar|Marcar|Desmarcar|Fechar|Reabrir|Gerar|Conferir|Verificar|Confirmar|Informar|Preencher|Clicar|Comparar|Registrar|Utilizar|Observar|Alterar)\b)/i)
    .map(line=>line.trim().replace(/^\s*(?:Passos(?: executados)?:\s*|\d{1,3}[.)]\s*|[-*•]\s*|\[\s*[xX ]\s*\]\s*)/i,'').trim())
    .filter(Boolean)
    .filter(line=>!/^\s*(?:Cen[áa]rios? testados|Resultado esperado|Objetivo)\s*:?$/i.test(line))
    .map((line,index)=>(index+1)+'. '+actionInstruction(line))
    .join('\n').slice(0,20000);
  const esperado=formatQaSentenceCase(item?.esperado||'').replace(/^\s*(?:Resultado esperado|Esperado)\s*:\s*/i,'')
    .split('\n').map(line=>line.trim().replace(/^[-*•]\s*/,'')).filter(Boolean).join('\n').slice(0,20000);
  const notes=splitScenarioNotes(item?.observacoes||'');
  const objetivo=formatQaSentenceCase(item?.objetivo||notes.objetivo||'').trim()
    || ('Validar o resultado esperado do cenário "'+titulo+'": '+(esperado||'revisar o resultado esperado.') );
  const observed=formatQaSentenceCase(item?.obtido||'').trim();
  let more=notes.observacoes;
  // If the source already has a recorded observation, preserve it, but do not
  // claim execution status: only the QA can confirm the run in the app.
  if(observed && !more.includes(observed)){
    more+=(more?'\n\n':'')+'Resultado observado na TF:\n'+observed;
  }
  return {
    titulo,passos,esperado,
    observacoes:('Objetivo:\n'+objetivo+(more?'\n\nObservações:\n'+more:'')).slice(0,20000)
  };
}

export function normalizeDraft(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Resposta inválida: era esperado um objeto de campos.');
  const fields={};
  for(const [key,max] of Object.entries(ASSIST_FIELD_LIMITS)){
    if(key==='tipo_teste'){
      const kind=clean(raw[key]).toUpperCase();
      if(kind==='BUILD'||kind==='RELEASE') fields[key]=kind;
      continue;
    }
    const input=clean(raw[key]);
    const value=(key==='codigo'||key==='versao'
      ? cleanQaSourceText(input)
      : formatQaSentenceCase(input)).slice(0,max);
    if(value)fields[key]=value;
  }
  const scenarios=Array.isArray(raw.cenarios) ? raw.cenarios.slice(0,ASSIST_SCENARIO_LIMIT).map((item,index)=>({
    ordem:index+1,
    ...standardizeImportedScenario({
      ...item,titulo:item?.titulo||('Cenário '+(index+1))
    }),
    // Retain source outcome as a note, but do not infer an approved execution.
    obtido:'',
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
  if(raw.length>200000)throw Error('Para extração local, use até 200.000 caracteres sem descartar texto.');
  const text=cleanQaSourceText(raw);
  if(!text)throw Error('O conteúdo contém somente controles da interface. Cole as informações da TF.');
  const sections=splitSections(text);
  let report=null;
  try {report=parseReport(text);} catch { /* Freeform QA notes are allowed. */ }
  const explicitTitle=pick(text,/^(?:T[ÍI]TULO(?: DA TAREFA)?|ASSUNTO)\s*:\s*(.+)$/im);
  const code=pick(text,/\b(?:TF|TAREFA)\s*[#:º°-]?\s*(\d{3,12})\b/i)
    ||pick(text,/\b(?:PEDIDO|CHAMADO)\s*[#:º°-]?\s*(\d{3,12})\b/i);
  const version=pick(text,/\b(?:VERS[ÃA]O|VERSAO|V\.)\s*[:#-]?\s*(\d+(?:\.\d+){1,5})\b/i);
  // A requirement or an isolated test is valid input, not necessarily a full TF.
  // Generic section names must never become the suggested task title.
  const titleLine=line=>line.trim().replace(/^#{1,6}\s*/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/^REQUISITO\s*(?:\d+)?\s*[:：—-]\s*/i, '').trim();
  const heading=/^(?:TEXTO DA TAREFA|REQUISITOS?(?: FUNCIONAIS?)?|CRIT[ÉE]RIOS?(?: DE ACEITE)?|REGRAS? DE NEG[ÓO]CIO|CONTEXTO|CEN[ÁA]RIOS?(?: TESTADOS)?|CASOS? DE TESTE|PASSOS|RESULTADO ESPERADO|TESTES?)\s*[:：—-]?$/i;
  const usefulTitle=value=>value.split('\n').map(titleLine)
    .find(line=>line.length>5 && !/^[-—–\[\]]+$/.test(line) &&
      !heading.test(line) &&
      !/^(?:TIPO DE TESTE|O QUE FOI TESTADO|CEN[ÁA]RIO\s*\d+|QUAL [ÉE] O PROBLEMA IDENTIFICADO|VALIDA[CÇ][ÃA]O FINAL)\b/i.test(line))||'';
  const firstRelevant=usefulTitle(text);
  const onlyScenarios=Boolean(report?.cenarios?.length)&&
    !sections.descricao&&!report?.descricao;
  const description=sections.descricao || report?.descricao ||
    (onlyScenarios ? 'Roteiro de testes: '+report.cenarios[0].titulo :
      !Object.keys(sections).length ? text.slice(0,30000) : '');
  const rawTitle=explicitTitle || (onlyScenarios ? report.cenarios[0].titulo : '') ||
    usefulTitle(description) || firstRelevant || 'Nova tarefa de teste';
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

