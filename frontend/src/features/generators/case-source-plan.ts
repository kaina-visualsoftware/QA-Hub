import type {Task,Scenario} from "../../lib/contracts";
import {sanitizeAiContext} from "../../lib/legacy/qa-test-context.mjs";

export type CaseSource={id:string;label:string;kind:"task"|"original"|"file"|"requirement"|"document"|"existing"|"evidence";text:string};
export type CasePart={id:string;label:string;kind:CaseSource["kind"];index:number;total:number;line:number;text:string};
export type CasePlan={signature:string;parts:CasePart[];sources:CaseSource[];warnings:string[];sourceCount:number;chars:number;overview:string};
export type CaseRequirement={id:string;codigo:string;titulo:string;descricao:string;criterios_aceite:string;estado?:string};
export type CaseFile={id:string;tipo_fonte:string;nome_arquivo?:string|null;texto_extraido:string;mime?:string|null;versao?:number|null};
export type CaseDocument={id:string;titulo:string;conteudo:string;tipo?:string};
export type CaseEvidence={id:string;tipo?:string;resumo?:string;referencia?:string;cenario_id?:string|null};
export type CaseEvidenceFile={id:string;nome_original:string;descricao?:string;mime_type:string;cenario_id?:string|null};

const CHARACTER_LIMIT=4200;
const BYTE_LIMIT=6500;
export const CASE_PART_CONCURRENCY=2;
export const CASE_MAX_PARTS=130;
const encoder=new TextEncoder();
const length=(input:string)=>encoder.encode(input).length;
const clean=(text:unknown)=>sanitizeAiContext(String(text??"")).trim();
const field=(label:string,value:unknown)=>{
 const v=clean(value);return v?label+": "+v:"";
};
function segment(text:string){
 const result:{text:string;line:number}[]=[];
 let start=0,line=1;
 while(start<text.length){
  let stop=Math.min(text.length,start+CHARACTER_LIMIT);
  if(length(text.slice(start,stop))>BYTE_LIMIT){
   let lo=start+1,hi=stop;
   while(lo<hi){const mid=Math.ceil((lo+hi)/2);
    if(length(text.slice(start,mid))<=BYTE_LIMIT)lo=mid;else hi=mid-1;}
   stop=lo;
  }
  if(stop<text.length&&stop>start&&/^[\uDC00-\uDFFF]$/.test(text[stop])&&
   /^[\uD800-\uDBFF]$/.test(text[stop-1]))stop--;
  if(stop<text.length){
   const slice=text.slice(start,stop);
   const boundary=slice.lastIndexOf("\n");
   if(boundary>slice.length*.55)stop=start+boundary+1;
  }
  if(stop<=start)throw Error("Não foi possível dividir o conteúdo sem perda.");
  const part=text.slice(start,stop);
  result.push({text:part,line});
  line+=(part.match(/\n/g)?.length??0);start=stop;
 }
 if(result.map(p=>p.text).join("")!==text)throw Error("Divisão incompleta: fonte alterada.");
 return result;
}
function signature(parts:CasePart[],overview:string){
 let hash=2166136261;
 for(const p of [{id:"overview",text:overview},...parts])for(const char of p.id+"\0"+p.text+"\0"){
  hash=Math.imul(hash^char.charCodeAt(0),16777619);
 }
 return parts.length+"-"+(hash>>>0).toString(16);
}
const caseTitle=(value:unknown)=>clean(value).slice(0,240);
/** Every saved textual source is included once, with explicit provenance.
 * No extractive summarization or silent character omission occurs here.
 * Sources with no readable text become warnings rather than fake coverage.
 */
export function planScenarioSources({
 task,scenarios=[],requirements=[],files=[],documents=[],evidence=[],evidenceFiles=[],selectedRequirementIds,
 instructions=""
}:{
 task:Task;scenarios?:Scenario[];requirements?:CaseRequirement[];
 files?:CaseFile[];documents?:CaseDocument[];evidence?:CaseEvidence[];
 evidenceFiles?:CaseEvidenceFile[];selectedRequirementIds?:string[];
 instructions?:string
}):CasePlan{
 const overview=[
  field("TF",task.codigo),field("Título da TF",task.titulo),
  field("Sistema",task.sistema),field("Versão",task.versao)
 ].filter(Boolean).join("\n").slice(0,550);
 const taskText=[
  field("Descrição integral do problema",task.descricao),
  field("Funcionamento atual",task.explicacao),
  field("Causa",task.causa),field("Alteração implementada",task.correcao),
  field("Conclusão documentada",task.conclusao),
  field("Observações da TF",task.observacoes),
  field("Tipo de teste",task.tipo_teste),field("Ambiente",task.ambiente),
  field("Base de teste",task.base_teste)
 ].filter(Boolean).join("\n\n");
 const sources:CaseSource[]=[{id:"task",label:"Detalhamento da TF",kind:"task",text:taskText}];
 const warnings:string[]=[];
 const selected=new Set(selectedRequirementIds??requirements.map(r=>r.id));
 const included=requirements.filter(r=>selected.has(r.id)&&r.estado!=="arquivado");
 for(const req of included) {
  const text=[field("Código",req.codigo),field("Requisito",req.titulo),
   field("Descrição",req.descricao),field("Critérios de aceite",req.criterios_aceite)]
    .filter(Boolean).join("\n");
  if(text)sources.push({id:"req:"+req.id,label:"Requisito "+(req.codigo||req.titulo),
   kind:"requirement",text});
 }
 for(const f of files){
  const body=clean(f.texto_extraido);
  const label=f.nome_arquivo||"Texto importado";
  if(body)sources.push({id:"file:"+f.id,label:"Anexo: "+label,
   kind:f.tipo_fonte==="arquivo"?"file":"original",text:body});
  else warnings.push("Sem texto disponível para análise no anexo: "+label);
  if(body.length>=30000&&f.tipo_fonte==="arquivo")
   warnings.push("O anexo "+label+" contém uma prévia de até 30 mil caracteres; confirme se o original possui mais conteúdo.");
 }
 for(const doc of documents){
  const body=clean(doc.conteudo);
  if(body)sources.push({id:"doc:"+doc.id,label:"Documento: "+doc.titulo,
   kind:"document",text:body});
 }
 for(const ev of evidence){
  const body=[field("Tipo",ev.tipo),field("Resumo",ev.resumo),
   field("Referência registrada (não consultada)",ev.referencia),
   field("Cenário relacionado",ev.cenario_id)].filter(Boolean).join("\n");
  if(body)sources.push({id:"evidence:"+ev.id,label:"Evidência registrada",
   kind:"evidence",text:body});
 }
 for(const file of evidenceFiles){
  const filename=clean(file.nome_original)||"Anexo de evidência";
  const body=[field("Arquivo",filename),field("Descrição",file.descricao),
   field("Cenário relacionado",file.cenario_id)].filter(Boolean).join("\n");
  if(file.descricao?.trim())sources.push({
   id:"evidence-file:"+file.id,label:"Anexo de execução: "+filename,
   kind:"evidence",text:body});
  // Storage files are private binaries, not indexed requirement text;
  // the AI must not pretend to have read them.
  warnings.push("Anexo de execução "+filename+
    ": conteúdo binário não analisado; apenas sua descrição textual"+
    (file.descricao?.trim()?" será considerada.": " está indisponível."));
 }
 // Existing cases inform regression and prevent variations of the same test.
 if(scenarios.length){
  const existing=scenarios.map((c,i)=>[
   "Caso existente "+(i+1)+": "+caseTitle(c.titulo),
   field("Passos",c.passos),field("Esperado",c.esperado),
   field("Situação",c.status)
  ].filter(Boolean).join("\n")).join("\n\n");
  sources.push({id:"existing",label:"Cenários já cadastrados",kind:"existing",text:existing});
 }
 const manual=clean(instructions);
 if(manual)sources.push({id:"instructions",label:"Orientação complementar do QA",
  kind:"task",text:manual});
 const active=sources.filter(s=>s.text.trim());
 const parts=active.flatMap(source=>{
  const pieces=segment(source.text);
  return pieces.map((part,index)=>({
   id:source.id+":"+index,label:source.label,kind:source.kind,
   index,total:pieces.length,line:part.line,text:part.text
  }));
 });
 if(!parts.length)throw Error("Esta TF ainda não possui informações para gerar cenários.");
 if(parts.length>CASE_MAX_PARTS)throw Error(
  "A TF possui "+parts.length+" partes. Limite de "+CASE_MAX_PARTS+
  " por geração; organize os documentos antes de continuar, sem omitir fontes.");
 return {parts,sources:active,signature:signature(parts,overview),warnings,
  sourceCount:active.length,chars:active.reduce((sum,s)=>sum+s.text.length,0),overview};
}
