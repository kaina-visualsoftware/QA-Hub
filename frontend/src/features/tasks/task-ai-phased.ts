import {extractLocalDraft,normalizeDraft} from "../../lib/legacy/qa-assistant.mjs";
import type {LocalDraft} from "../../lib/legacy/qa-assistant.mjs";
import {cleanQaSourceText} from "../../lib/legacy/qa-text-cleaner.mjs";
import {supabase} from "../../lib/supabase";
import {AiRequestError,readAiInvokeError,withAiRateLimitRetry} from "../../lib/ai-retry";
import type {AiWaitCallback,AiWaitState} from "../../lib/ai-retry";
import type {GeneratedTaskDraft} from "./task-ai";
import {parseGroundedFieldReply,parseGroundedScenarioReply} from "./task-evidence";
import type {FieldReview,ScenarioReview} from "./task-evidence";

export type TaskPipelineStage="fields"|"scenarios"|"complete";
export type TaskPipelineProgress={
 stage:TaskPipelineStage;current:number;total:number;detail:string;
};
export type ScenarioSeed={
 source_index:number;titulo:string;passos:string;esperado:string;observacoes:string;
};
export type TaskScenarioRow=ScenarioSeed;
/** Lives only in the current wizard's memory. No source text is logged or
 * persisted. The original report must remain unchanged across resume calls.
 */
export type TaskPipelineCheckpoint={
 source:string;prepared:string;local:LocalDraft|null;
 fields:LocalDraft["fields"]|null;
 resolvedFields:boolean;completedBatches:Record<number,TaskScenarioRow[]>;
 fieldReview:FieldReview[];scenarioReview:Record<number,ScenarioReview[]>;
};
export type PhasedTaskDraft=GeneratedTaskDraft&{
 partial:boolean;completedBatches:number;totalBatches:number;
 pendingBatches:number;fieldsPending:boolean;
 unprocessedScenarios:number;localParsingLimited:boolean;
 fieldReview:FieldReview[];scenarioReview:ScenarioReview[];
 needsReviewCount:number;verifiedEvidenceCount:number;
};
export const TASK_BATCH_SIZE=4;
export const TASK_BATCH_CONCURRENCY=2;
const MAX_SEEDS=20;
const MAX_BATCH_BYTES=13500; // below the Edge Function 14 kB cap
const encoder=new TextEncoder();

const abortError=()=>new DOMException("Análise cancelada; o progresso anterior foi preservado.","AbortError");
const protectedError=(error:unknown)=>error instanceof AiRequestError&&(
 [401,403,429].includes(error.status)||["provider_auth","quota_unavailable"].includes(error.code));
const briefReason=(error:unknown)=>error instanceof AiRequestError
 ?error.message.slice(0,180)
 :error instanceof Error?error.message.slice(0,180):"Etapa não concluída.";
function localSourceDraft(source:string):LocalDraft|null{
 if(source.length>200000)return null;
 try{
  const draft=extractLocalDraft(source);
  return Object.keys(draft.fields).length||draft.cenarios.length?draft:null;
 }catch{return null;}
}
function seedsFor(local:LocalDraft|null):ScenarioSeed[]{
 return (local?.cenarios??[]).slice(0,MAX_SEEDS)
  .map((item,index)=>({
   source_index:index,titulo:item.titulo.trim().slice(0,240),
   passos:item.passos.trim().slice(0,3400),
   esperado:item.esperado.trim().slice(0,1800),
   observacoes:item.observacoes.trim().slice(0,1500)
  }))
  .filter(item=>item.titulo.length>=3&&(Boolean(item.passos)||Boolean(item.esperado)));
}
function toBatches(items:ScenarioSeed[]){
 const batches:ScenarioSeed[][]=[];
 let active:ScenarioSeed[]=[];
 for(const seed of items){
  // A too-large single seed stays in the local result; never send an
  // oversized batch that the server will reject on every resume.
  const candidate=[...active,seed];
  if(active.length>=TASK_BATCH_SIZE||
     encoder.encode(JSON.stringify(candidate)).length>MAX_BATCH_BYTES){
    if(active.length)batches.push(active);
    active=[];
  }
  if(encoder.encode(JSON.stringify([seed])).length<=MAX_BATCH_BYTES)
   active.push(seed);
 }
 if(active.length)batches.push(active);
 return batches;
}
async function stageRequest(body:Record<string,unknown>,signal:AbortSignal|undefined,
 onWait:AiWaitCallback):Promise<unknown>{
 const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(95000)]):
  AbortSignal.timeout(95000);
 return withAiRateLimitRetry(async()=>{
  if(requestSignal.aborted)throw abortError();
  const response=await supabase.functions.invoke("qa-ai",{body,signal:requestSignal});
  if(response.error)throw await readAiInvokeError(response.error);
  if(requestSignal.aborted)throw abortError();
  return response.data;
 },{signal:requestSignal,onWait});
}
/** Unverified AI batches are not applied; local evidence stays intact. */
function parsedBatch(data:unknown,source:string,seeds:ScenarioSeed[]){
 const checked=parseGroundedScenarioReply(data,source,seeds);
 return {accepted:checked.review.some(item=>item.status!=="verified")
  ?null:checked.accepted,review:checked.review};
}
function combine(checkpoint:TaskPipelineCheckpoint,batches:ScenarioSeed[][],
 reasons:string[]):PhasedTaskDraft{
 const processable=new Set(batches.flat().map(seed=>seed.source_index));
 const unprocessedScenarios=Math.max(0,
  (checkpoint.local?.cenarios.length??0)-processable.size);
 const sourceExcerptLimits=(checkpoint.local?.cenarios??[]).slice(0,MAX_SEEDS)
  .filter(item=>item.passos.length>3400||item.esperado.length>1800||
    item.observacoes.length>1500).length;
 const localParsingLimited=!checkpoint.local&&checkpoint.source.length>200000;
 const fieldReview=checkpoint.fieldReview;
 const scenarioReview=Object.values(checkpoint.scenarioReview).flat();
 const needsReviewCount=fieldReview.filter(item=>item.status==="needs_review").length+
  scenarioReview.filter(item=>item.status==="needs_review").length;
 const verifiedEvidenceCount=fieldReview.filter(item=>item.status==="verified").length+
  scenarioReview.filter(item=>item.status==="verified").length;
 const partial=!checkpoint.resolvedFields||needsReviewCount>0||unprocessedScenarios>0||
  sourceExcerptLimits>0||localParsingLimited||
  batches.some((_,index)=>!Object.hasOwn(checkpoint.completedBatches,index));
 const enriched=(checkpoint.local?.cenarios??[]).map((original,index)=>{
  const updated=Object.values(checkpoint.completedBatches).flat()
   .find(row=>row.source_index===index);
  if(!updated)return original;
  const normalized=normalizeDraft({cenarios:[updated]}).cenarios[0];
  return {...original,
   titulo:normalized.titulo||original.titulo,
   passos:normalized.passos||original.passos,
   esperado:normalized.esperado||original.esperado,
   observacoes:normalized.observacoes||original.observacoes,
   status:"nao_executado" as const};
 });
 const fields={...(checkpoint.local?.fields??{}),...(checkpoint.fields??{})};
 const completed=Object.keys(checkpoint.completedBatches).length;
 const nvidia=checkpoint.resolvedFields||completed>0;
 return {
  fields,cenarios:enriched,
  extractionSource:nvidia?"nvidia":"local",
  extractionReason:[
   ...reasons,
   ...(unprocessedScenarios>0?
    [unprocessedScenarios+" cenário(s) adicionais não foram enviados à IA; permanecem disponíveis para revisão local."]:[]),
   ...(localParsingLimited?
    ["Fonte acima do limite de 200 mil caracteres do parser local; revise os cenários manualmente ou prepare blocos semânticos."]:[]),
   ...(sourceExcerptLimits>0?
    [sourceExcerptLimits+" cenário(s) tinham passos/resultado/observações extensos; a IA recebeu somente os trechos limitados, e a versão original continua disponível."] : []),
   ...(needsReviewCount>0?[needsReviewCount+" proposta(s) da IA exigem revisão da evidência."] : [])
  ].filter(Boolean).join(" ").slice(0,1050)||undefined,
  partial,completedBatches:completed,totalBatches:batches.length,
  pendingBatches:batches.length-completed,fieldsPending:!checkpoint.resolvedFields,
  unprocessedScenarios,localParsingLimited,
  fieldReview,scenarioReview,needsReviewCount,verifiedEvidenceCount
 };
}
export function checkpointMatches(checkpoint:TaskPipelineCheckpoint|null,
 source:string,prepared:string):boolean{
 return Boolean(checkpoint&&checkpoint.source===source&&checkpoint.prepared===prepared);
}
export function pipelinePendingCount(checkpoint:TaskPipelineCheckpoint):number{
 const total=toBatches(seedsFor(checkpoint.local)).length;
 return (checkpoint.resolvedFields?0:1)+
  Math.max(0,total-Object.keys(checkpoint.completedBatches).length);
}
export function newCheckpoint(source:string,prepared:string):TaskPipelineCheckpoint{
 return {source,prepared,local:localSourceDraft(source),fields:null,
  resolvedFields:false,completedBatches:{},fieldReview:[],scenarioReview:{}};
}

/** F4 pipeline. One fields request followed by source-indexed batches, max
 * two concurrent. Failed batches stay pending; completed batches are never
 * resent on resume. Human approval remains in the wizard.
 */
export async function generateTaskAiDraftPhased(text:string,{
 aiText,signal,onWait=()=>{},onProgress=()=>{},onCheckpoint=()=>{},checkpoint
}:{
 aiText?:string;signal?:AbortSignal;onWait?:AiWaitCallback;
 onProgress?:(state:TaskPipelineProgress)=>void;
 onCheckpoint?:(value:TaskPipelineCheckpoint)=>void;
 checkpoint?:TaskPipelineCheckpoint|null
}={}):Promise<PhasedTaskDraft>{
 const source=text.trim(),cleaned=cleanQaSourceText(source);
 if(!source||cleaned.length<10)throw Error("Informe o problema ou requisito da TF.");
 const prepared=aiText?cleanQaSourceText(aiText):cleaned;
 if(!prepared.trim()||prepared.length>30000)
  throw Error("O contexto precisa ser preparado com até 30 mil caracteres e revisado antes do envio.");
 const state=checkpointMatches(checkpoint??null,source,prepared)?checkpoint!:newCheckpoint(source,prepared);
 const batches=toBatches(seedsFor(state.local));
 const reasons:string[]=[];
 onCheckpoint(state);
 if(signal?.aborted)throw abortError();
 if(!state.resolvedFields){
  onProgress({stage:"fields",current:0,total:1,
   detail:"Extraindo título, descrição, causa e correção em uma chamada curta."});
  try{
   const data=await stageRequest({text:prepared,mode:"task-fields"},signal,onWait);
   const extracted=parseGroundedFieldReply(data,prepared);
   state.fieldReview=extracted.review;
   state.fields=normalizeDraft(extracted.values).fields;
   onCheckpoint(state);
   if(!Object.keys(state.fields).length)
    throw Error("A NVIDIA não retornou campos com prova; os candidatos aguardam revisão.");
   state.resolvedFields=true;
   onCheckpoint(state);
  }catch(error){
   if(signal?.aborted)throw abortError();
   if(protectedError(error))throw error;
   reasons.push("Os campos foram recuperados apenas da fonte local: "+briefReason(error));
   const fallback=combine(state,batches,reasons);
   if(!Object.keys(fallback.fields).length&&!fallback.cenarios.length)
    throw Error("A NVIDIA não concluiu a leitura e não foi possível extrair dados da fonte integral. O texto original foi preservado.");
   onProgress({stage:"complete",current:0,total:batches.length,
    detail:"Etapa interrompida; é possível retomar os lotes sem perder o texto."});
   return fallback;
  }
 }
 const unfinished=batches.map((seeds,index)=>({seeds,index}))
  .filter(({index})=>!Object.hasOwn(state.completedBatches,index));
 let completed=Object.keys(state.completedBatches).length,next=0,fatal:unknown=null;
 const waits=new Map<number,AiWaitState>();
 const reportWait=(index:number,wait:AiWaitState|null)=>{
  if(wait)waits.set(index,wait);else waits.delete(index);
  onWait([...waits.values()].sort((a,b)=>b.until-a.until)[0]??null);
 };
 const worker=async()=>{
  while(next<unfinished.length&&!fatal){
   if(signal?.aborted)throw abortError();
   const job=unfinished[next++];
   onProgress({stage:"scenarios",current:completed,total:batches.length,
    detail:"Organizando o lote "+(job.index+1)+" de "+batches.length+
     " (máximo quatro cenários por chamada)."});
   try{
    const data=await stageRequest({text:prepared,mode:"task-scenarios",seeds:job.seeds},
     signal,wait=>reportWait(job.index,wait));
    if(signal?.aborted)throw abortError();
    const result=parsedBatch(data,prepared,job.seeds);
    state.scenarioReview[job.index]=result.review;
    onCheckpoint(state);
    if(!result.accepted)
     throw Error("O lote contém cenário sem evidência; os casos locais seguem preservados.");
    state.completedBatches[job.index]=result.accepted;
    onCheckpoint(state);
    completed++;
   }catch(error){
    if(signal?.aborted)throw abortError();
    if(protectedError(error)){fatal=error;return;}
    reasons.push("Lote "+(job.index+1)+" pendente: "+briefReason(error));
   }finally{
    reportWait(job.index,null);
    onProgress({stage:"scenarios",current:completed,total:batches.length,
     detail:completed+" de "+batches.length+" lotes concluídos; resultados anteriores preservados."});
   }
  }
 };
 try{
  await Promise.all(Array.from({length:Math.min(TASK_BATCH_CONCURRENCY,unfinished.length)},()=>worker()));
 }finally{onWait(null);}
 if(fatal)throw fatal;
 const result=combine(state,batches,reasons);
 if(!Object.keys(result.fields).length&&!result.cenarios.length)
  throw Error("Não foi possível extrair campos nem cenários; a fonte original foi preservada.");
 onProgress({stage:"complete",current:result.completedBatches,total:batches.length,
  detail:result.partial?"Há lotes pendentes que podem ser retomados.":"Extração concluída; revise tudo antes de salvar."});
 return result;
}
