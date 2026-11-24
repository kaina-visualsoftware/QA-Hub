import {generateWithNvidia} from "./stream";
import type {GeneratorBatchRequest} from "./stream";
import {hasCompleteGeneratedCase,onlyNewScenarioCandidates,parseGeneratedCases}
 from "../../lib/legacy/qa-workspace.mjs";
import type {GeneratedCase} from "../../lib/legacy/qa-workspace.mjs";
import type {CasePlan,CasePart} from "./case-source-plan";
import {CASE_PART_CONCURRENCY} from "./case-source-plan";
import type {AiWaitCallback} from "../../lib/ai-retry";

export type CasePartResult={raw:string;cases:GeneratedCase[]};
export type CasePartsCheckpoint={
 signature:string;complete:Record<string,CasePartResult>;
 failures:Record<string,string>;
};
export type CasePartProgress={
 complete:number;total:number;failed:number;active:string[];
 status:Record<string,"complete"|"processing"|"failed"|"pending">;
};
type Request=(mode:"teste",task:string,requirements:string,
 onChunk:(text:string)=>void,signal?:AbortSignal,onWait?:AiWaitCallback,
 batch?:GeneratorBatchRequest)=>Promise<{text:string;truncated:boolean}>;
const label=(part:CasePart)=>part.label+" · parte "+(part.index+1)+"/"+part.total;
const message=(error:unknown)=>error instanceof Error?error.message:String(error);
const noCases=/^\s*\[Sem cen[áa]rios (?:novos |adicionais )?(?:verific[áa]veis |documentados )?(?:nesta parte|para esta parte|documentados|adicionais)[^\]\n]*\]\s*$/i;
export function caseCheckpoint(plan:CasePlan,prior?:CasePartsCheckpoint|null):CasePartsCheckpoint{
 if(prior?.signature===plan.signature)return {
  signature:prior.signature,complete:{...prior.complete},failures:{...prior.failures}
 };
 return {signature:plan.signature,complete:{},failures:{}};
}
export function casePartStatus(plan:CasePlan,cp:CasePartsCheckpoint,active:string[]=[]):CasePartProgress{
 const act=new Set(active);
 const status=Object.fromEntries(plan.parts.map(part=>[
  part.id,cp.complete[part.id]?"complete":act.has(part.id)?"processing":
   cp.failures[part.id]?"failed":"pending"
 ])) as CasePartProgress["status"];
 return {complete:Object.keys(cp.complete).length,total:plan.parts.length,
  failed:Object.keys(cp.failures).length,active,status};
}
export function caseResult(plan:CasePlan,cp:CasePartsCheckpoint,existing:GeneratedCase[]=[]){
 const chunks=plan.parts.flatMap(part=>cp.complete[part.id]?.cases??[]);
 // Identical actions and expectations are the same test even if the model
 // invents a different heading. Do not collapse merely similar scenarios.
 const norm=(value:string)=>value.normalize("NFKC")
  .replace(/\s+/g," ").trim().toLocaleLowerCase("pt-BR");
 const footprint=(item:Pick<GeneratedCase,"passos"|"esperado">)=>
  norm(item.passos)+"\u241f"+norm(item.esperado);
 const seen=new Set(existing.map(footprint));
 const distinct=onlyNewScenarioCandidates(chunks,existing)
  .filter(item=>{
   if(/^cen[áa]rio\s*\d+$/i.test(item.titulo.trim()))return false;
   const key=footprint(item);
   if(seen.has(key))return false;
   seen.add(key);return true;
  });
 const text=plan.parts.map(part=>cp.complete[part.id]?.raw.trim()??"")
  .filter(Boolean).join("\n\n---\n\n");
 return {cases:distinct,text,
  complete:Object.keys(cp.complete).length,
  failed:plan.parts.filter(p=>!cp.complete[p.id]).length,
  allDone:plan.parts.every(p=>Boolean(cp.complete[p.id]))
 };
}
/** Calls NVIDIA only. Two independent source blocks may run concurrently;
 * each request consumes the server's shared 15/min quota. Finished blocks
 * stay in-memory and are not resent when resumed.
 */
export async function generateCasesBySource(plan:CasePlan,{
 checkpoint,existing=[],signal,onCheckpoint=()=>{},onProgress=()=>{},
 onPreview=()=>{},onWait=()=>{},request=generateWithNvidia
}:{
 checkpoint?:CasePartsCheckpoint|null;
 existing?:GeneratedCase[];signal?:AbortSignal;
 onCheckpoint?:(checkpoint:CasePartsCheckpoint)=>void;
 onProgress?:(progress:CasePartProgress)=>void;
 onPreview?:(preview:string)=>void;
 onWait?:AiWaitCallback;request?:Request
}={}){
 const cp=caseCheckpoint(plan,checkpoint);
 const remaining=plan.parts.filter(p=>!cp.complete[p.id]);
 const active=new Set<string>();let cursor=0;
 const abort=()=>new DOMException("Geração cancelada.", "AbortError");
 const emit=()=>{
  onCheckpoint({signature:cp.signature,complete:{...cp.complete},failures:{...cp.failures}});
  onProgress(casePartStatus(plan,cp,[...active]));
 };
 emit();
 const worker=async()=>{
  while(cursor<remaining.length){
   if(signal?.aborted)throw abort();
   const part=remaining[cursor++];
   active.add(part.id);delete cp.failures[part.id];emit();
   const batch:GeneratorBatchRequest={
    version:2,index:plan.parts.indexOf(part),total:plan.parts.length,
    stage:"source",continuation:0,previousTail:""
   };
   let incoming="";
   try{
    const header=plan.overview;
    const task=["INFORMAÇÕES GERAIS DA TF",header,
     "FONTE: "+label(part),"LINHA INICIAL: "+part.line,
     "CONTEÚDO ORIGINAL DESTA PARTE:",part.text].join("\n");
    const response=await request("teste",task,"",
     text=>{incoming+=text;onPreview(label(part)+": "+incoming.slice(-800));},
     signal,onWait,batch);
    if(response.truncated)throw Error("O provedor interrompeu a resposta deste bloco.");
    const raw=response.text.trim();
    const parsed=parseGeneratedCases(raw);
    const usable=onlyNewScenarioCandidates(parsed,existing)
     .filter(item=>hasCompleteGeneratedCase(item)&&
      !/^cen[áa]rio\s*\d+$/i.test(item.titulo.trim()));
    if(!usable.length&&!noCases.test(raw))
     throw Error("A NVIDIA não retornou cenários completos com títulos descritivos para esta parte.");
    cp.complete[part.id]={raw,cases:usable};
   }catch(err){
    if(signal?.aborted)throw abort();
    cp.failures[part.id]=message(err).slice(0,300);
   }finally{
    active.delete(part.id);emit();
   }
  }
 };
 const workers=Array.from({length:Math.min(CASE_PART_CONCURRENCY,remaining.length)},()=>worker());
 const settled=await Promise.allSettled(workers);
 if(signal?.aborted||settled.some(r=>r.status==="rejected"))
  throw abort();
 const result=caseResult(plan,cp,existing);
 if(result.complete===0&&result.failed>0)
  throw Error("Nenhuma parte foi concluída. Revise os erros e retome os blocos pendentes.");
 return {...result,checkpoint:cp};
}
