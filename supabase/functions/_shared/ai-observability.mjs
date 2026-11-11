/** F0 - metadata-only observability for the QA Hub NVIDIA calls.
 * Keep this module independent of the provider orchestrator planned for F1.
 * Never pass source text, prompts, responses, headers, credentials or SQL to logs.
 */
const MODES=new Set(["discovery","task","diagram","diagram-summary","post","teste",
 "semantic:task","semantic:post","semantic:teste","revision:post_excerpt","revision:test_case"]);
const MODELS=new Set(["catalog","z-ai/glm-5.3-flash","nvidia/nemotron-3.5-lightning-30b-a3b"]);
const OUTCOMES=new Set(["ok","timeout","length","empty","schema_invalid","context_exceeded",
 "rate_limited","upstream_5xx","http_error","aborted","upstream_error","stream_overflow"]);
const STAGES=new Set(["provider","quota","discovery"]);
const FINISH_REASONS=new Set(["stop","length","content_filter","tool_calls","function_call"]);
const clampInt=(v,limit=1000000000)=>typeof v==="number"&&Number.isFinite(v)&&v>=0?
 Math.min(limit,Math.floor(v)):null;
const safeString=(value,allowed,fallback)=>typeof value==="string"&&allowed.has(value)?value:fallback;

/** Accept only UUIDs; ignore arbitrary attacker-controlled correlation headers. */
export function correlationId(headerValue){
 const value=typeof headerValue==="string"?headerValue.trim().toLowerCase():"";
 return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)?
  value:crypto.randomUUID();
}
/** Count message content without keeping or logging it. Estimation is not a tokenizer. */
export function promptChars(messages){
 if(!Array.isArray(messages))return 0;
 return messages.reduce((sum,message)=>{
  const content=message?.content;
  const size=typeof content==="string"?content.length:
   Array.isArray(content)?content.reduce((n,part)=>n+
    (typeof part?.text==="string"?part.text.length:0),0):0;
  return sum+size;
 },0);
}
export function usageMetadata(usage){
 if(!usage||typeof usage!=="object")return null;
 const p=clampInt(usage.prompt_tokens);
 const c=clampInt(usage.completion_tokens);
 const t=clampInt(usage.total_tokens);
 const reasoning=clampInt(usage.completion_tokens_details?.reasoning_tokens);
 if([p,c,t,reasoning].every(n=>n===null))return null;
 return {prompt_tokens:p,completion_tokens:c,total_tokens:t,reasoning_tokens:reasoning};
}
export function exceptionOutcome(error){
 if(error?.name==="TimeoutError")return "timeout";
 if(error?.name==="AbortError")return "aborted";
 return "upstream_error";
}
export function httpOutcome(status){
 if(status===429)return "rate_limited";
 if([500,502,503,504,522,524].includes(status))return "upstream_5xx";
 return "http_error";
}
export function makeAttemptEvent({
 correlation_id,mode,model,prompt_chars,max_tokens,started_at,ended_at,
 http_status,finish_reason,usage,outcome,attempt,fallback_model,stage="provider"
}={}){
 const chars=clampInt(prompt_chars,20000000)??0;
 const safeTime=value=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null;
 const start=safeTime(started_at);
 const end=safeTime(ended_at);
 return {
  event:"qa_ai_attempt",version:1,
  correlation_id:correlationId(correlation_id),
  stage:safeString(stage,STAGES,"provider"),
  mode:safeString(mode,MODES,"task"),
  model:safeString(model,MODELS,"catalog"),
  prompt_chars:chars,
  prompt_tokens_est:Math.ceil(chars/4),
  max_tokens:clampInt(max_tokens,100000)??0,
  elapsed_ms:start!==null&&end!==null?Math.max(0,Math.min(end-start,3600000)):0,
  http_status:clampInt(http_status,599)??0,
  finish_reason:safeString(finish_reason,FINISH_REASONS,"unknown"),
  usage:usageMetadata(usage),
  outcome:safeString(outcome,OUTCOMES,"upstream_error"),
  attempt:clampInt(attempt,100)??0,
  fallback_model:fallback_model===true
 };
}
/** This function NEVER prints arbitrary provider data; it always reconstructs a whitelist. */
export function logAiAttempt(fields){
 const event=makeAttemptEvent({...fields,ended_at:fields?.ended_at??Date.now()});
 console.info("qa_ai_attempt",event);
 return event;
}
