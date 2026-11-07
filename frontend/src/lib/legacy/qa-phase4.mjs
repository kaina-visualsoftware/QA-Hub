import {parseGeneratedCases,markScenarioDuplicates} from './qa-workspace.mjs';

export const PAGE_SIZE=24;
const text=value=>String(value??'').trim();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function slicePage(items,page=0,size=PAGE_SIZE){
  if(!Array.isArray(items))throw Error('Lista inválida.');
  const index=Math.max(0,Math.trunc(Number(page)||0)),limit=Math.max(1,Math.min(100,Math.trunc(Number(size)||PAGE_SIZE)));
  const end=(index+1)*limit;
  return {rows:items.slice(0,end),visible:Math.min(items.length,end),
    total:items.length,hasMore:items.length>end,next:index+1};
}
export function validateEvidence({tipo,resumo,referencia='',cenario_id=null}){
  if(!['observacao','log','captura','referencia'].includes(tipo))throw Error('Tipo de evidência inválido.');
  const note=text(resumo),ref=text(referencia);
  if(note.length<3||note.length>2000)throw Error('Descreva a evidência em 3 a 2.000 caracteres.');
  if(ref && (ref.length>1500||!/^https:\/\/[^\s]+$/i.test(ref)))throw Error('Use somente links HTTPS válidos para evidências.');
  if(cenario_id&&!uuid.test(cenario_id))throw Error('Cenário inválido.');
  return {tipo,resumo:note,referencia:ref,cenario_id:cenario_id||null};
}
export function legacyPreview(record,kind,existing=[]){
  if(!['post','teste'].includes(kind)||!record||typeof record.md!=='string')
    throw Error('Histórico inválido.');
  if(record.md.length>80000)throw Error('O histórico excede 80.000 caracteres.');
  const title=text(record.titulo)||'Histórico sem título';
  const date=Number(record.ts);
  if(kind==='post')return {title,source:record.md,items:[],summary:'Post para revisão. Não altera a TF.'};
  const parsed=markScenarioDuplicates(parseGeneratedCases(record.md),existing);
  // Never trust historical exec flags: generation does not constitute execution.
  return {title,source:record.md,items:parsed,
    summary:parsed.length+' cenário(s) extraídos. Serão gravados como não executados.'};
}
export function auditLabel(event){
  const labels={
    'tf.status':'Mudança de situação da TF',
    'cenario.criado':'Cenário criado',
    'cenario.status':'Resultado de cenário registrado',
    'documento.versao':'Nova versão de documento',
    'release.vinculada':'Release vinculada',
    'comparacao.registrada':'Indicadores de comparação registrados',
    'evidencia.criada':'Evidência adicionada'
  };
  return labels[event?.acao]||'Evento registrado';
}
export function auditDetails(event){
  const details=event?.detalhes||{};
  if(event?.acao==='cenario.status'||event?.acao==='tf.status')
    return (details.anterior||'?')+' → '+(details.novo||'?');
  if(event?.acao==='documento.versao')
    return (details.tipo||'Documento')+' · versão '+String(details.versao||'?');
  if(event?.acao==='comparacao.registrada')return details.tipo==='diff_xml'?'XML':'Texto';
  if(event?.acao==='evidencia.criada')return text(details.tipo);
  if(event?.acao==='cenario.criado')return text(details.status);
  return '';
}
export function legacyRecordId(record){
  return uuid.test(record?.id)?record.id:null;
}
