import {generateWithNvidia} from "./stream";
import type {GeneratorMode,StreamResult,GeneratorBatchRequest} from "./stream";
import type {AiWaitCallback} from "../../lib/ai-retry";

/** F6: a browser-local checkpoint. Never stored in localStorage, logs or DB.
 * Sections already completed are immutable across retries, and no resulting
 * post/cases are saved without the existing explicit QA review actions.
 */
export const GENERATOR_STAGES={
 post:["overview","details","closing"],
 teste:["setup","positive","negative","regression","closing"]
} as const;
export const F6_MAX_CONTINUATIONS=2;
const TOTAL_LIMIT=150000;
const STAGE_LIMIT=55000;
const MAX_TAIL=900;
export type GeneratorCheckpoint={
 mode:GeneratorMode;task:string;requirements:string;
 sections:string[];currentStage:number;partial:string;continuation:number
};
export type GeneratorBatchProgress={
 stage:string;index:number;total:number;completed:number;continuation:number
};
type RequestFn=(mode:GeneratorMode,task:string,requirements:string,
 onChunk:(chunk:string)=>void,signal?:AbortSignal,
 onWait?:AiWaitCallback,batch?:GeneratorBatchRequest)=>Promise<StreamResult>;

const abortError=()=>new DOMException("A geração foi cancelada.","AbortError");
export function newGeneratorCheckpoint(mode:GeneratorMode,task:string,
 requirements:string):GeneratorCheckpoint{
 return {mode,task,requirements,sections:[],currentStage:0,partial:"",continuation:0};
}
/** Only the in-flight stage may be retried after exhausting continuations.
 * Previously completed sections stay immutable; the partial is retained in
 * the review UI before this explicit restart and never blindly combined with
 * a fresh copy of the same stage.
 */
export function restartInterruptedGeneratorStage(checkpoint:GeneratorCheckpoint):GeneratorCheckpoint{
 if(checkpoint.continuation<F6_MAX_CONTINUATIONS||!checkpoint.partial.trim())
  return {...checkpoint,sections:[...checkpoint.sections]};
 return {...checkpoint,sections:[...checkpoint.sections],partial:"",continuation:0};
}
export function matchesGeneratorCheckpoint(checkpoint:GeneratorCheckpoint|null,
 mode:GeneratorMode,task:string,requirements:string){
 return checkpoint!==null&&checkpoint.mode===mode&&
  checkpoint.task===task&&checkpoint.requirements===requirements;
}
/** Overlap only exact suffix/prefix, never fuzzy paraphrases; ambiguous model
 * repeats remain visible for QA review rather than silently deleting text.
 */
export function mergeContinuation(before:string,after:string):string{
 if(!before)return after;
 if(!after)return before;
 const max=Math.min(before.length,after.length,MAX_TAIL);
 for(let count=max;count>=10;count--)
  if(before.endsWith(after.slice(0,count)))return before+after.slice(count);
 return before+after;
}
export function assembleGeneratorSections(mode:GeneratorMode,sections:string[]):string{
 if(sections.length!==GENERATOR_STAGES[mode].length)
  throw Error("A geração ainda tem etapas pendentes.");
 let content=sections.map(s=>s.trim()).filter(Boolean)
  .filter(s=>!/^\[(?:Sem cenários|Nenhum cenário)[^\]\n]*\]$/i.test(s)).join("\n\n");
 if(mode==="teste"){
  // Number unique scenario headings across independent category requests.
  let index=0;
  content=content.replace(/^##\s+Cen[aá]rio\s+\d+\s*(?:[—–:-]\s*)?/gim,
   ()=>"## Cenário "+String(++index).padStart(2,"0")+" — ");
  content=content.replace(/\*\*Cenários executados:\*\*\s*___\s*\/\s*(?:\d+|<[^>]+>)/gi,
   "**Cenários executados:** ___ / "+index);
 }
 if(content.length>(mode==="post"?80000:TOTAL_LIMIT))
  throw Error("O conteúdo montado excede o limite de segurança.");
 return content;
}
function assembledPreview(checkpoint:GeneratorCheckpoint,more=""){
 return [...checkpoint.sections,mergeContinuation(checkpoint.partial,more)]
  .filter(Boolean).join("\n\n");
}
export function unfinishedGeneratorStages(checkpoint:GeneratorCheckpoint){
 return Math.max(0,GENERATOR_STAGES[checkpoint.mode].length-checkpoint.currentStage);
}
/** Sequential stages avoid quota spikes (F2, 15/min) and ensure no completed
 * stage is retransmitted. Each interrupted segment allows <=2 continuations.
 * A dropped SSE after receiving partial data advances using that exact tail.
 */
export async function generateBatchedWithNvidia(mode:GeneratorMode,task:string,
 requirements:string,{
 checkpoint,signal,onPreview=()=>{},onProgress=()=>{},onCheckpoint=()=>{},
 onWait=()=>{},request=generateWithNvidia
}:{
 checkpoint?:GeneratorCheckpoint|null;signal?:AbortSignal;
 onPreview?:(fullPreview:string)=>void;
 onProgress?:(progress:GeneratorBatchProgress)=>void;
 onCheckpoint?:(value:GeneratorCheckpoint)=>void;
 onWait?:AiWaitCallback;request?:RequestFn
}={}):Promise<{text:string;truncated:false;checkpoint:GeneratorCheckpoint}>{
 if(!task.trim()||task.length>30000||requirements.length>20000)
  throw Error("O contexto deve ser preparado e revisado antes da geração.");
 const names=GENERATOR_STAGES[mode];
 const cp=matchesGeneratorCheckpoint(checkpoint??null,mode,task,requirements)?
  checkpoint!:newGeneratorCheckpoint(mode,task,requirements);
 const save=()=>onCheckpoint({...cp,sections:[...cp.sections]});
 if(cp.currentStage<0||cp.currentStage>names.length||
  cp.sections.length!==cp.currentStage||cp.continuation>F6_MAX_CONTINUATIONS)
  throw Error("Estado de retomada inconsistente. Inicie uma nova geração.");
 save();onPreview(assembledPreview(cp));
 for(let at=cp.currentStage;at<names.length;){
  if(signal?.aborted)throw abortError();
  if(cp.partial.length>STAGE_LIMIT)
   throw Error("O texto parcial excedeu o limite de segurança; revise o documento.");
  const continuation=cp.continuation;
  const tail=continuation?cp.partial.slice(-MAX_TAIL):"";
  if(continuation&&tail.trim().length<12)
   throw Error("O trecho recebido é curto demais para continuar com segurança.");
  const batch:GeneratorBatchRequest={
   version:1,index:at,total:names.length,stage:names[at],
   continuation,previousTail:tail
  };
  onProgress({stage:names[at],index:at,total:names.length,
   completed:at,continuation});
  let attempt="";
  let completed=false,truncated=false;
  try{
   const result=await request(mode,task,requirements,(chunk)=>{
    if(signal?.aborted)throw abortError();
    attempt+=chunk;
    if(attempt.length>STAGE_LIMIT||
       assembledPreview(cp,attempt).length>TOTAL_LIMIT)
     throw Error("A etapa ultrapassou o limite de segurança.");
    onPreview(assembledPreview(cp,attempt));
   },signal,onWait,batch);
   truncated=result.truncated;
   completed=true;
  }catch(error){
   if(signal?.aborted){
    // Cancellation must not lose chunks already delivered by the stream.
    if(attempt.trim()){
     cp.partial=mergeContinuation(cp.partial,attempt);
     save();onPreview(assembledPreview(cp));
    }
    throw abortError();
   }
   if(!attempt.trim())throw error;
   // Network dropped after delivering text. Capture the fragment but never
   // pretend it is a complete section or replay the old section from scratch.
   cp.partial=mergeContinuation(cp.partial,attempt);
   if(cp.continuation>=F6_MAX_CONTINUATIONS){
    save();throw Error("Limite de continuidades desta etapa atingido. O texto parcial foi preservado para revisão.");
   }
   cp.continuation++;
   save();onPreview(assembledPreview(cp));
   continue;
  }
  if(!completed)throw Error("Etapa não concluída.");
  cp.partial=mergeContinuation(cp.partial,attempt);
  if(!cp.partial.trim())
   throw Error("A NVIDIA retornou uma etapa vazia; tente novamente.");
  if(truncated){
   if(cp.continuation>=F6_MAX_CONTINUATIONS){
    save();throw Error("O modelo truncou a etapa após duas continuidades. A versão parcial foi preservada e não será publicada.");
   }
   cp.continuation++;
   save();onPreview(assembledPreview(cp));
   continue;
  }
  cp.sections.push(cp.partial);
  cp.currentStage=++at;cp.partial="";cp.continuation=0;
  save();onPreview(assembledPreview(cp));
 }
 return {text:assembleGeneratorSections(mode,cp.sections),truncated:false,
  checkpoint:{...cp,sections:[...cp.sections]}};
}
