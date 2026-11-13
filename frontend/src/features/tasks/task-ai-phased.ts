import {normalizeDraft} from "../../lib/legacy/qa-assistant.mjs";
import type {LocalDraft} from "../../lib/legacy/qa-assistant.mjs";
import {cleanQaSourceText} from "../../lib/legacy/qa-text-cleaner.mjs";
import {supabase} from "../../lib/supabase";
import {AiRequestError,readAiInvokeError,withAiRateLimitRetry} from "../../lib/ai-retry";
import type {AiWaitCallback,AiWaitState} from "../../lib/ai-retry";
import type {GeneratedTaskDraft} from "./task-ai";
import {parseGroundedFieldReply,parseGroundedSeedReply,parseGroundedScenarioReply}
 from "./task-evidence";
import type {FieldReview,ScenarioReview} from "./task-evidence";

export type TaskPipelineStage="fields"|"seeds"|"scenarios"|"complete";
export type TaskPipelineProgress={
 stage:TaskPipelineStage;current:number;total:number;detail:string;
};
export type ScenarioSeed={
 source_index:number;titulo:string;passos:string;esperado:string;observacoes:string;
};
export type TaskScenarioRow=ScenarioSeed;
/** This checkpoint holds only NVIDIA-reviewed facts. No browser-local parser
 * is permitted to create or augment fields or scenario seeds.
 */
export type TaskPipelineCheckpoint={
 source:string;prepared:string;
 seeds:ScenarioSeed[]|null;resolvedSeeds:boolean;
 fields:LocalDraft["fields"]|null;resolvedFields:boolean;
 completedBatches:Record<number,TaskScenarioRow[]>;
 fieldReview:FieldReview[];seedReview:ScenarioReview[];
 scenarioReview:Record<number,ScenarioReview[]>;
};
export type PhasedTaskDraft=GeneratedTaskDraft&{
 partial:boolean;completedBatches:number;totalBatches:number;
 pendingBatches:number;fieldsPending:boolean;seedsPending:boolean;
 unprocessedScenarios:number;localParsingLimited:boolean;
 fieldReview:FieldReview[];scenarioReview:ScenarioReview[];
 needsReviewCount:number;verifiedEvidenceCount:number;
};
export const TASK_BATCH_SIZE=4;
export const TASK_BATCH_CONCURRENCY=2;
const MAX_BATCH_BYTES=13500; // below the Edge Function 14 kB cap
const encoder=new TextEncoder();
const abortError=()=>new DOMException("Análise cancelada; o progresso anterior foi preservado.","AbortError");
const protectedError=(error:unknown)=>error instanceof AiRequestError&&(
 [401,403,429].includes(error.status)||["provider_auth","quota_unavailable"].includes(error.code));
const briefReason=(error:unknown)=>error instanceof AiRequestError
 ?error.message.slice(0,180)
 :error instanceof Error?error.message.slice(0,180):"Etapa não concluída.";

function toBatches(items:ScenarioSeed[]){
 const batches:ScenarioSeed[][]=[];
 let active:ScenarioSeed[]=[];
 for(const seed of items){
  const candidate=[...active,seed];
  if(active.length>=TASK_BATCH_SIZE||
     encoder.encode(JSON.stringify(candidate)).length>MAX_BATCH_BYTES){
   if(active.length)batches.push(active);
   active=[];
  }
  // Oversized NVIDIA seeds must remain pending for review. Do not truncate
  // steps or silently substitute a local parser result.
  if(encoder.encode(JSON.stringify([seed])).length<=MAX_BATCH_BYTES)active.push(seed);
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
function parsedBatch(data:unknown,source:string,seeds:ScenarioSeed[]){
 const checked=parseGroundedScenarioReply(data,source,seeds);
 return {accepted:checked.review.some(item=>item.status!=="verified")
  ?null:checked.accepted,review:checked.review};
}
function combine(checkpoint:TaskPipelineCheckpoint,batches:ScenarioSeed[][],
 reasons:string[]):PhasedTaskDraft{
 const completed=Object.keys(checkpoint.completedBatches).length;
 const processed=new Set(Object.values(checkpoint.completedBatches).flat()
  .map(item=>item.source_index));
 const unprocessedScenarios=(checkpoint.seeds??[])
  .filter(item=>!processed.has(item.source_index)).length;
 const omittedOversized=(checkpoint.seeds??[]).length-
  new Set(batches.flat().map(item=>item.source_index)).size;
 const fieldReview=checkpoint.fieldReview;
 const scenarioReview=[...checkpoint.seedReview,
  ...Object.values(checkpoint.scenarioReview).flat()];
 const needsReviewCount=fieldReview.filter(item=>item.status==="needs_review").length+
  scenarioReview.filter(item=>item.status==="needs_review").length;
 const verifiedEvidenceCount=fieldReview.filter(item=>item.status==="verified").length+
  scenarioReview.filter(item=>item.status==="verified").length;
 const partial=!checkpoint.resolvedFields||!checkpoint.resolvedSeeds||
  needsReviewCount>0||unprocessedScenarios>0||
  batches.some((_,index)=>!Object.hasOwn(checkpoint.completedBatches,index));
 const scenarios=Object.values(checkpoint.completedBatches).flat()
  .sort((a,b)=>a.source_index-b.source_index)
  .map(item=>normalizeDraft({cenarios:[item]}).cenarios[0]);
 return {
  fields:{...(checkpoint.fields??{})},cenarios:scenarios,
  extractionSource:"nvidia",
  extractionReason:[
   ...reasons,
   ...(omittedOversized>0?
    [omittedOversized+" candidato(s) de cenário da NVIDIA excederam o limite por lote e exigem revisão."]:[]),
   ...(needsReviewCount>0?[needsReviewCount+" proposta(s) da NVIDIA exigem revisão de evidência."]:[])
  ].filter(Boolean).join(" ").slice(0,1050)||undefined,
  partial,completedBatches:completed,totalBatches:batches.length,
  pendingBatches:batches.length-completed,fieldsPending:!checkpoint.resolvedFields,
  seedsPending:!checkpoint.resolvedSeeds,
  unprocessedScenarios,localParsingLimited:false,
  fieldReview,scenarioReview,needsReviewCount,verifiedEvidenceCount
 };
}
export function checkpointMatches(checkpoint:TaskPipelineCheckpoint|null,
 source:string,prepared:string):boolean{
 return Boolean(checkpoint&&checkpoint.source===source&&checkpoint.prepared===prepared);
}
export function pipelinePendingCount(checkpoint:TaskPipelineCheckpoint):number{
 const total=toBatches(checkpoint.seeds??[]).length;
 return (checkpoint.resolvedFields?0:1)+(checkpoint.resolvedSeeds?0:1)+
  Math.max(0,total-Object.keys(checkpoint.completedBatches).length);
}
export function newCheckpoint(source:string,prepared:string):TaskPipelineCheckpoint{
 return {source,prepared,seeds:null,resolvedSeeds:false,fields:null,
  resolvedFields:false,completedBatches:{},fieldReview:[],seedReview:[],scenarioReview:{}};
}
/** Fields and scenario candidates are both NVIDIA-generated and independently
 * grounded; subsequent batches only enrich those AI candidates.
 * A provider failure never triggers local semantic extraction.
 * fieldsOnly leaves scenario generation to the wizard's third step.
 */
export async function generateTaskAiDraftPhased(text:string,{
 aiText,signal,onWait=()=>{},onProgress=()=>{},onCheckpoint=()=>{},checkpoint,fieldsOnly=false
}:{
 aiText?:string;signal?:AbortSignal;onWait?:AiWaitCallback;
 onProgress?:(state:TaskPipelineProgress)=>void;
 onCheckpoint?:(value:TaskPipelineCheckpoint)=>void;
 checkpoint?:TaskPipelineCheckpoint|null;fieldsOnly?:boolean
}={}):Promise<PhasedTaskDraft>{
 const source=text.trim(),cleaned=cleanQaSourceText(source);
 if(!source||cleaned.length<10)throw Error("Informe o problema ou requisito da TF.");
 const prepared=aiText?cleanQaSourceText(aiText):cleaned;
 if(!prepared.trim()||prepared.length>30000)
  throw Error("O contexto precisa ser preparado com até 30 mil caracteres e revisado antes do envio.");
 const state=checkpointMatches(checkpoint??null,source,prepared)?
  checkpoint!:newCheckpoint(source,prepared);
 // Step 1 extracts verified TF fields; scenarios are generated only after
 // step 2 review and any supplementary requirements supplied in step 3.
 if(fieldsOnly){
  state.seeds=[];
  state.resolvedSeeds=true;
  state.completedBatches={};
  state.seedReview=[];
  state.scenarioReview={};
 }
 onCheckpoint(state);
 if(signal?.aborted)throw abortError();
 if(!state.resolvedFields){
  onProgress({stage:"fields",current:0,total:1,
   detail:"A NVIDIA está identificando título, problema, causa e correção com evidências."});
  try{
   const data=await stageRequest({text:prepared,mode:"task-fields"},signal,onWait);
   const extracted=parseGroundedFieldReply(data,prepared);
   state.fieldReview=extracted.review;
   state.fields=normalizeDraft(extracted.values).fields;
   onCheckpoint(state);
   if(!Object.keys(state.fields).length)
    throw Error("A NVIDIA não retornou campos verificados; as propostas aguardam revisão.");
   state.resolvedFields=true;onCheckpoint(state);
  }catch(error){
   if(signal?.aborted)throw abortError();
   if(protectedError(error))throw error;
   throw Error("A NVIDIA não concluiu os campos. Nenhuma extração local foi feita. "+
    "Retome a etapa para tentar novamente. "+briefReason(error));
  }
 }
 if(!state.resolvedSeeds){
  onProgress({stage:"seeds",current:0,total:1,
   detail:"A NVIDIA está identificando cenários explícitos e suas citações no texto."});
  try{
   const data=await stageRequest({text:prepared,mode:"task-seeds"},signal,onWait);
   const checked=parseGroundedSeedReply(data,prepared);
   state.seeds=checked.seeds;
   state.seedReview=checked.review;
   state.resolvedSeeds=true;onCheckpoint(state);
  }catch(error){
   if(signal?.aborted)throw abortError();
   if(protectedError(error))throw error;
   throw Error("A NVIDIA não concluiu a identificação dos cenários. "+
    "Os campos concluídos foram preservados. Retome sem extração local. "+briefReason(error));
  }
 }
 const batches=toBatches(state.seeds??[]);
 const unfinished=batches.map((seeds,index)=>({seeds,index}))
  .filter(({index})=>!Object.hasOwn(state.completedBatches,index));
 let completed=Object.keys(state.completedBatches).length,next=0,fatal:unknown=null;
 const reasons:string[]=[];
 const waits=new Map<number,AiWaitState>();
 const reportWait=(index:number,wait:AiWaitState|null)=>{
  if(wait)waits.set(index,wait);else waits.delete(index);
  onWait([...waits.values()].sort((a,b)=>a.until-b.until)[0]??null);
 };
 const worker=async()=>{
  while(next<unfinished.length&&!fatal){
   if(signal?.aborted)throw abortError();
   const job=unfinished[next++];
   onProgress({stage:"scenarios",current:completed,total:batches.length,
    detail:"NVIDIA: validando lote "+(job.index+1)+" de "+batches.length+" (até quatro cenários)."});
   try{
    const data=await stageRequest({text:prepared,mode:"task-scenarios",seeds:job.seeds},
     signal,wait=>reportWait(job.index,wait));
    if(signal?.aborted)throw abortError();
    const result=parsedBatch(data,prepared,job.seeds);
    state.scenarioReview[job.index]=result.review;
    onCheckpoint(state);
    if(!result.accepted)
     throw Error("O lote contém cenário sem evidência verificada e permanece pendente.");
    state.completedBatches[job.index]=result.accepted;
    onCheckpoint(state);completed++;
   }catch(error){
    if(signal?.aborted)throw abortError();
    if(protectedError(error)){fatal=error;return;}
    reasons.push("Lote "+(job.index+1)+" pendente: "+briefReason(error));
   }finally{
    reportWait(job.index,null);
    onProgress({stage:"scenarios",current:completed,total:batches.length,
     detail:completed+" de "+batches.length+" lotes concluídos; os anteriores estão preservados."});
   }
  }
 };
 try{await Promise.all(Array.from({length:Math.min(TASK_BATCH_CONCURRENCY,unfinished.length)},
  ()=>worker()));}finally{onWait(null);}
 if(fatal)throw fatal;
 const result=combine(state,batches,reasons);
 if(!Object.keys(result.fields).length&&!result.cenarios.length)
  throw Error("A NVIDIA não forneceu campos ou cenários verificados; o texto original foi preservado.");
 onProgress({stage:"complete",current:result.completedBatches,total:batches.length,
  detail:result.partial?"Há cenários pendentes ou evidências para revisão.":
   "Extração pela NVIDIA concluída; revise antes de salvar."});
 return result;
}
