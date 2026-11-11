import {NVIDIA_BASE,MODEL_REGISTRY,modelRequestOptions} from "./models.mjs";
import {ProviderError,classifyStatus,classifyException,retryAfterSeconds,telemetryOutcome} from "./errors.mjs";

/** Process-local breaker. It is intentionally NOT a distributed availability
 * claim: a fresh Edge Function isolate starts with an empty history.
 */
const breakers=new Map();
const BREAKER_FAILURES=3;
const BREAKER_COOLDOWN_MS=120000;
export function resetModelBreakers(){breakers.clear();}
export function modelBreakerState(model,now=Date.now()){
 const state=breakers.get(model);
 return state?{failures:state.failures,openUntil:state.openUntil,
  open:state.openUntil>now}: {failures:0,openUntil:0,open:false};
}
function breakerCheck(model,now){
 const state=breakers.get(model);
 if(!state)return false;
 if(state.openUntil>now)return true;
 if(state.openUntil){breakers.delete(model);return false;}
 return false;
}
function noteFailure(model,error,now){
 if(!["timeout","empty","upstream"].includes(error.kind)||
   (error.kind==="upstream"&&error.status>0&&error.status<500))return;
 const state=breakers.get(model)??{failures:0,openUntil:0};
 state.failures++;
 if(state.failures>=BREAKER_FAILURES)state.openUntil=now+BREAKER_COOLDOWN_MS;
 breakers.set(model,state);
}
const knownOverrides=new Set(["max_tokens","temperature","stream","response_format",
 "reasoning_effort","chat_template_kwargs","top_p"]);
function safeOptions(model,mode,stream,overrides){
 const configured=modelRequestOptions(model,mode,stream);
 for(const [name,value] of Object.entries(overrides??{}))
  if(knownOverrides.has(name))configured[name]=value;
 configured.stream=Boolean(stream);
 return configured;
}
function contentText(content){
 if(typeof content==="string")return content;
 if(Array.isArray(content))return content.map(part=>
  typeof part?.text==="string"?part.text:"").join("");
 return "";
}
function deltaText(payload){
 return contentText(payload?.choices?.[0]?.delta?.content);
}
function extractJson(payload,model,{rejectLength,maxChars}){
 const choice=payload?.choices?.[0];
 if(!choice||typeof choice!=="object")
  throw new ProviderError("schema_invalid",{model});
 const text=contentText(choice.message?.content??choice.text??payload.output_text);
 const finishReason=choice.finish_reason??null;
 const details={model,finishReason,usage:payload.usage??null,partial:text.slice(0,maxChars)};
 if(text.length>maxChars)throw new ProviderError("length",details);
 if(finishReason==="length"&&rejectLength)throw new ProviderError("length",details);
 if(!text.trim())throw new ProviderError("empty",details);
 return {text,finishReason,usage:payload.usage??null,payload,model,elapsedMs:0};
}
async function readErrorBody(response){
 try{
  const reader=response.body?.getReader();
  if(!reader)return "";
  const bytes=[];let size=0;
  while(size<2048){
   const {done,value}=await reader.read();
   if(done)break;
   const chunk=value.slice(0,2048-size);
   bytes.push(chunk);size+=chunk.byteLength;
  }
  await reader.cancel().catch(()=>{});
  const raw=new TextDecoder().decode(Uint8Array.from(bytes.flatMap(x=>[...x])));
  return raw.slice(0,2048);
 }catch{return "";}
}
function parseSseEvent(raw,state,onDelta,maxChars){
 const data=raw.split(/\r?\n/).filter(line=>line.startsWith("data:"))
  .map(line=>line.slice(5).trimStart()).join("\n");
 if(!data)return;
 if(data==="[DONE]"){state.done=true;return;}
 let payload;
 try{payload=JSON.parse(data);}catch{throw new ProviderError("schema_invalid");}
 if(payload?.error)throw new ProviderError("upstream");
 const chunk=deltaText(payload);
 if(chunk){
  state.text+=chunk;
  if(state.text.length>maxChars)throw new ProviderError("length",{
   finishReason:state.finishReason,usage:state.usage,partial:state.text.slice(0,maxChars)
  });
  onDelta?.(chunk);
 }
 if(payload?.choices?.[0]?.finish_reason)
  state.finishReason=payload.choices[0].finish_reason;
 if(payload?.usage)state.usage=payload.usage;
}
async function parseStream(response,controller,onDelta,{maxChars,rejectLength,resetIdle}){
 if(!response.body)throw new ProviderError("empty");
 const reader=response.body.getReader();
 const decoder=new TextDecoder();
 const state={text:"",finishReason:null,usage:null,done:false};
 let buffer="";
 const abortRead=()=>{void reader.cancel().catch(()=>{});};
 controller.signal.addEventListener("abort",abortRead,{once:true});
 try{
  while(!state.done){
   if(controller.signal.aborted)throw new ProviderError("aborted");
   const {done,value}=await reader.read();
   if(controller.signal.aborted)throw new ProviderError("aborted");
   if(done)break;
   resetIdle();
   buffer+=decoder.decode(value,{stream:true});
   if(buffer.length>175000)throw new ProviderError("length",{partial:state.text});
   let pos;
   while((pos=buffer.search(/\r?\n\r?\n/))>=0){
    const match=buffer.slice(pos).match(/^\r?\n\r?\n/)[0];
    const event=buffer.slice(0,pos);
    buffer=buffer.slice(pos+match.length);
    parseSseEvent(event,state,onDelta,maxChars);
    if(state.done)break;
   }
  }
  buffer+=decoder.decode();
  if(buffer.trim()&&!state.done)parseSseEvent(buffer,state,onDelta,maxChars);
  if(!state.text.trim())throw new ProviderError("empty");
  if(state.finishReason==="length"&&rejectLength)throw new ProviderError("length",{
   finishReason:state.finishReason,usage:state.usage,partial:state.text
  });
  if(!state.done&&!state.finishReason)throw new ProviderError("upstream",{
   partial:state.text
  });
  return {text:state.text,finishReason:state.finishReason,
   usage:state.usage,payload:null,model:null,elapsedMs:0};
 }finally{
  controller.signal.removeEventListener("abort",abortRead);
  await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
/** Abortable wait; the global deadline also applies to the backoff itself. */
async function waitRetry(ms,{signal,deadlineAt,now,sleep}){
 if(signal?.aborted)throw new ProviderError("aborted");
 const remaining=deadlineAt-now();
 if(remaining<=ms)throw new ProviderError("timeout");
 if(sleep){await sleep(ms);if(signal?.aborted)throw new ProviderError("aborted");return;}
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{cleanup();resolve();},ms);
  const onAbort=()=>{clearTimeout(timer);cleanup();reject(new ProviderError("aborted"));};
  function cleanup(){signal?.removeEventListener("abort",onAbort);}
  signal?.addEventListener("abort",onAbort,{once:true});
 });
}
function retryable(error,retryOnRateLimit){
 return error.kind==="timeout"||error.kind==="empty"||
  error.kind==="upstream"&&(error.status===0||error.status>=500)||
  (retryOnRateLimit&&error.kind==="rate_limited");
}
/**
 * One MODEL call with bounded retries. Every actual HTTP attempt first calls
 * reserveAttempt so the existing shared 15/min RPC remains authoritative.
 *
 * The default is SSE streaming. qa-ai opts into stream:false to preserve its
 * existing JSON response, schema parser, and externally visible fallback.
 */
export async function callModel({
 apiKey,model,messages,mode="task",stream=true,options={},
 fetchImpl=fetch,reserveAttempt,onAttempt,onQuotaDenied,onBreakerSkip,
 onDelta,signal,maxRetries=1,retryOnRateLimit=false,
 timeoutMs=35000,firstTokenTimeoutMs=12000,idleTimeoutMs=20000,
 deadlineAt=Date.now()+85000,now=()=>Date.now(),
 random=Math.random,sleep,baseUrl=NVIDIA_BASE,
 maxChars=115000,rejectLength=true,fallbackModel=false
}={}){
 if(!MODEL_REGISTRY[model])throw new ProviderError("schema_invalid");
 if(!apiKey||!Array.isArray(messages))throw new ProviderError("schema_invalid");
 const prepared=safeOptions(model,mode,stream,options);
 const startedJob=now();
 let lastError;
 for(let attempt=1;attempt<=Math.max(1,Math.min(3,Math.floor(maxRetries)+1));attempt++){
  if(signal?.aborted)throw new ProviderError("aborted",{model});
  if(deadlineAt<=now())throw new ProviderError("timeout",{model});
  if(breakerCheck(model,now())){
   onBreakerSkip?.({model,attempt,fallback_model:fallbackModel});
   throw new ProviderError("breaker_open",{model});
  }
  if(reserveAttempt){
   let claim;
   try{claim=await reserveAttempt({model,attempt});}
   catch{throw new ProviderError("quota_unavailable",{stage:"quota",model});}
   if(!claim?.allowed){
    const kind=claim?.kind==="auth"?"auth":
     claim?.kind==="rate_limited"?"rate_limited":"quota_unavailable";
    const error=new ProviderError(kind,{stage:"quota",model,
     status:kind==="rate_limited"?429:kind==="auth"?401:503,
     retryAfterSeconds:claim?.retryAfterSeconds});
    onQuotaDenied?.({...claim,kind,model,attempt,fallback_model:fallbackModel});
    throw error;
   }
  }
  const started=now();
  let httpStatus=0,result,failed=null;
  let timedOut=false,timeoutTimer,firstTimer,idleTimer,outerAbort;
  const controller=new AbortController();
  const budget=Math.max(1,Math.min(timeoutMs,deadlineAt-started));
  const stop=()=>{timedOut=true;controller.abort();};
  const clearTimers=()=>{clearTimeout(timeoutTimer);clearTimeout(firstTimer);
   clearTimeout(idleTimer);};
  const resetIdle=()=>{
   clearTimeout(firstTimer);clearTimeout(idleTimer);
   idleTimer=setTimeout(stop,Math.min(idleTimeoutMs,Math.max(1,deadlineAt-now())));
  };
  try{
   outerAbort=()=>controller.abort();
   signal?.addEventListener("abort",outerAbort,{once:true});
   timeoutTimer=setTimeout(stop,budget);
   firstTimer=setTimeout(stop,Math.min(firstTokenTimeoutMs,budget));
   const response=await fetchImpl(baseUrl+"/chat/completions",{
    method:"POST",
    headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json",
     Accept:stream?"text/event-stream":"application/json"},
    body:JSON.stringify({model,messages,...prepared}),
    signal:controller.signal
   });
   httpStatus=response.status;
   if(!response.ok){
    const body=await readErrorBody(response);
    const retryAfter=retryAfterSeconds(response.headers?.get("Retry-After"),now);
    throw classifyStatus(response.status,body,retryAfter);
   }
   if(stream){
    result=await parseStream(response,controller,onDelta,{maxChars,rejectLength,resetIdle});
   }else{
    // Non-streaming responses have no per-token events; the first-token timer
    // remains until the body is parsed. Overall timeout is also enforced.
    const payload=await response.json();
    if(controller.signal.aborted)throw new ProviderError("aborted");
    result=extractJson(payload,model,{rejectLength,maxChars});
   }
   if(controller.signal.aborted)throw new ProviderError("aborted");
   result.model=model;result.elapsedMs=now()-startedJob;
   breakers.delete(model);
   return result;
  }catch(error){
   failed=classifyException(error,timedOut);
   if(signal?.aborted)failed=new ProviderError("aborted",{model});
   failed.model=model;
   noteFailure(model,failed,now());
   lastError=failed;
  }finally{
   clearTimers();
   signal?.removeEventListener("abort",outerAbort);
   onAttempt?.({mode,model,attempt,fallback_model:fallbackModel,
    started_at:started,http_status:httpStatus,max_tokens:prepared.max_tokens,
    finish_reason:result?.finishReason??failed?.finishReason??null,
    usage:result?.usage??failed?.usage??null,
    outcome:failed?telemetryOutcome(failed):
     result?.finishReason==="length"?"length":"ok"});
  }
  if(attempt>maxRetries||!retryable(lastError,retryOnRateLimit))throw lastError;
  const backoff=lastError.retryAfterSeconds!==null?
   lastError.retryAfterSeconds*1000:
   Math.min(3000,250*2**(attempt-1))+Math.floor(random()*125);
  await waitRetry(backoff,{signal,deadlineAt,now,sleep});
 }
 throw lastError??new ProviderError("upstream",{model});
}
