/** F7: shared Edge adapter (no prompt, token, response body in telemetry). */
import {discoverModels,MODEL_IDS} from "./models.mjs";
import {callModel} from "./call-model.mjs";
import {ProviderError} from "./errors.mjs";
import {promptChars,logAiAttempt} from "../ai-observability.mjs";

/** @param {{apiKey:string,trace:string}} input */
export async function edgeModels({apiKey,trace,modelIds=MODEL_IDS}){
 return discoverModels({apiKey,modelIds,
  onDiscovery:event=>logAiAttempt({...event,correlation_id:trace})});
}
/** @param {{db:any,trace:string,mode:string,model:string,
 * modelIndex:number,messages:unknown[],maxTokens:number}} input */
export function edgeHooks({db,trace,mode,model,modelIndex,messages,maxTokens}){
 const telemetry={correlation_id:trace,mode,model,prompt_chars:promptChars(messages),
  max_tokens:maxTokens,attempt:modelIndex+1,fallback_model:modelIndex>0};
 return {
  reserveAttempt:async()=>{
   const claim=await db.rpc("qa_ai_claim_minute_request");
   if(claim.error||!claim.data||typeof claim.data!=="object")
    return {allowed:false,kind:"quota_unavailable"};
   if(claim.data.allowed)return {allowed:true};
   const seconds=Math.max(1,Math.min(60,Math.ceil(Number(
    claim.data.retry_after_seconds)||60)));
   return {allowed:false,kind:claim.data.error==="unauthorized"?"auth":"rate_limited",
    retryAfterSeconds:seconds};
  },
  onQuotaDenied:info=>logAiAttempt({...telemetry,stage:"quota",
   started_at:Date.now(),http_status:info.kind==="rate_limited"?429:
    info.kind==="auth"?401:503,outcome:info.kind==="rate_limited"?
      "rate_limited":"upstream_error",attempt:info.attempt}),
  onBreakerSkip:info=>logAiAttempt({...telemetry,started_at:Date.now(),
   outcome:"breaker_open",attempt:info.attempt}),
  onAttempt:event=>logAiAttempt({...telemetry,...event,
   correlation_id:trace,prompt_chars:telemetry.prompt_chars})
 };
}
export function terminalError(error){
 return error?.stage==="quota"||["rate_limited","auth"].includes(error?.kind);
}
export function edgeErrorHttp(error,{
 quotaMessage="Limite compartilhado da IA atingido. Retome após a liberação.",
 providerMessage="A NVIDIA limitou as solicitações. O conteúdo foi preservado.",
 authMessage="A chave NVIDIA deve ser revisada."
}={}){
 if(!(error instanceof ProviderError))return null;
 if(error.stage==="quota"){
  if(error.kind==="auth")return {status:401,body:{
   error:"unauthorized",message:"Sua sessão expirou. Entre novamente."},headers:{}};
  if(error.kind==="rate_limited"){
   const wait=Math.max(1,Math.min(60,error.retryAfterSeconds||60));
   return {status:429,body:{error:"rate_limited",retry_after_seconds:wait,
    message:quotaMessage},headers:{"Retry-After":String(wait)}};
  }
  return {status:503,body:{error:"quota_unavailable",
   message:"Não foi possível consultar a quota da IA."},headers:{}};
 }
 if(error.kind==="auth")return {status:503,body:{
  error:"invalid_key",message:authMessage},headers:{}};
 if(error.kind==="rate_limited"){
  const wait=error.retryAfterSeconds;
  return {status:429,body:{error:"provider_rate_limited",
   ...(wait!==null?{retry_after_seconds:wait}:{}),
   message:providerMessage},headers:wait!==null?{"Retry-After":String(wait)}:{}};
 }
 return null;
}
/** @param {{
 * apiKey:string,db:any,trace:string,mode:string,modelMode:string,
 * messages:unknown[],models?:string[],maxTokens:number,
 * timeoutMs?:number,deadlineMs?:number,
 * validate:(payload:unknown)=>unknown,options?:Record<string,unknown>,
 * fetchImpl?:typeof fetch
 * }} config */
export async function edgeJsonModels({apiKey,db,trace,mode,modelMode,messages,
 models=MODEL_IDS,maxTokens,timeoutMs=35000,deadlineMs=83000,
 validate,options={},fetchImpl=fetch}){
 let lastError=null,lastStatus=0,unstructured=false,timedOut=false,
  contextExceeded=false;
 const deadlineAt=Date.now()+deadlineMs;
 for(const [modelIndex,model] of models.entries()){
  if(Date.now()>=deadlineAt)break;
  try{
   const result=await callModel({apiKey,model,messages,mode:modelMode,
    fetchImpl,stream:false,options:{...options,max_tokens:maxTokens},maxRetries:0,
    rejectLength:false,timeoutMs,firstTokenTimeoutMs:timeoutMs,
    deadlineAt,fallbackModel:modelIndex>0,
    ...edgeHooks({db,trace,mode,model,modelIndex,messages,maxTokens})});
   lastStatus=200;
   const value=validate(result.payload);
   if(value!==null&&value!==undefined)
    return {ok:true,value,model,result,lastError:null};
   unstructured=true;
  }catch(error){
   lastError=error instanceof ProviderError?error:new ProviderError("upstream");
   lastStatus=lastError.status||lastStatus;
   if(lastError.kind==="timeout")timedOut=true;
   if(lastError.kind==="context_exceeded")contextExceeded=true;
   if(terminalError(lastError))
    return {ok:false,error:lastError,errorStage:"terminal",lastStatus,
     unstructured,timedOut,contextExceeded};
  }
 }
 return {ok:false,error:lastError,errorStage:"exhausted",lastStatus,
  unstructured,timedOut,contextExceeded};
}
const encoder=new TextEncoder();
const sse=(event,body)=>encoder.encode("event: "+event+"\ndata: "+JSON.stringify(body)+"\n\n");
/** @param {{
 * apiKey:string,db:any,trace:string,mode:string,modelMode:string,
 * messages:unknown[],models?:string[],maxTokens:number,
 * timeoutMs?:number,deadlineMs?:number,signal?:AbortSignal,
 * options?:Record<string,unknown>,maxChars?:number,fetchImpl?:typeof fetch
 * }} config */
export async function edgeStreamingModels({apiKey,db,trace,mode,modelMode,
 messages,models=MODEL_IDS,maxTokens,timeoutMs=65000,deadlineMs=90000,
 signal,options={},maxChars=115000,fetchImpl=fetch}){
 const owner=new AbortController();
 const onAbort=()=>owner.abort();
 if(signal?.aborted)owner.abort();
 signal?.addEventListener("abort",onAbort,{once:true});
 let controller=null;
 let closed=false,hasStarted=false,resolved=false;
 let resolveStart;
 const first=new Promise(resolve=>{resolveStart=resolve;});
 const start=(value)=>{
  if(resolved)return;
  resolved=true;resolveStart(value);
 };
 const send=(name,payload)=>{
  if(closed||owner.signal.aborted||!controller)return;
  try{controller.enqueue(sse(name,payload));}catch{closed=true;}
 };
 const close=()=>{
  if(!closed&&controller){try{controller.close();}catch{}}
  closed=true;signal?.removeEventListener("abort",onAbort);
 };
 const body=new ReadableStream({
  start(c){controller=c;},
  cancel(){closed=true;owner.abort();signal?.removeEventListener("abort",onAbort);}
 });
 const work=(async()=>{
  let error=null;
  const deadlineAt=Date.now()+deadlineMs;
  for(const [modelIndex,model] of models.entries()){
   if(owner.signal.aborted)break;
   try{
    const result=await callModel({apiKey,model,messages,mode:modelMode,
     fetchImpl,stream:true,options:{...options,max_tokens:maxTokens},maxRetries:0,
     rejectLength:false,timeoutMs,firstTokenTimeoutMs:12000,
     idleTimeoutMs:20000,deadlineAt,maxChars,
     signal:owner.signal,fallbackModel:modelIndex>0,
     onDelta:chunk=>{
      if(!hasStarted){hasStarted=true;start({started:true});}
      send("chunk",{text:chunk});
     },
     ...edgeHooks({db,trace,mode,model,modelIndex,messages,maxTokens})});
    if(!hasStarted){error=new ProviderError("empty");continue;}
    send("done",{model,truncated:result.finishReason==="length",
     characters:result.text.length});
    close();return;
   }catch(reason){
    error=reason instanceof ProviderError?reason:new ProviderError("upstream");
    if(hasStarted){
     send("error",{message:"A conexão com a NVIDIA foi interrompida. O texto parcial foi preservado."});
     close();return;
    }
    if(terminalError(error))break;
   }
  }
  start({started:false,error:error??new ProviderError("upstream")});
  close();
 })();
 void work.catch(()=>{
  start({started:false,error:new ProviderError("upstream")});
  if(hasStarted)send("error",{message:"Falha na transmissão da IA."});
  close();
 });
 const state=await first;
 if(state?.started)return {ok:true,body,abort:()=>owner.abort()};
 owner.abort();
 return {ok:false,error:state?.error??new ProviderError("upstream")};
}
