/** NVIDIA Build verified free-endpoint model profiles.
 * Advertised context is from model cards, NOT a hosted API service guarantee.
 */
import {MODEL_CONTEXT_PUBLISHED} from "./token-budget.mjs";
export const NVIDIA_BASE="https://integrate.api.nvidia.com/v1";
export const MODEL_IDS=Object.freeze([
 "z-ai/glm-5.3-flash",
 "nvidia/nemotron-3.5-lightning-30b-a3b"
]);
// The default discovery list remains unchanged for TF extraction and other flows.
// Extra verified profiles may be selected only by explicitly scoped generators.
export const MODEL_REGISTRY=Object.freeze({
 "z-ai/glm-5.3-flash":Object.freeze({
  id:"z-ai/glm-5.3-flash",contextTokens:MODEL_CONTEXT_PUBLISHED["z-ai/glm-5.3-flash"],maxOutputTokens:null,
  contextSource:"published_model_spec_not_hosted_guarantee",
  supportsJsonMode:true,reasoning:"always",priority:0,
  params:Object.freeze({reasoning_effort:"low"})
 }),
 "nvidia/nemotron-3.5-lightning-30b-a3b":Object.freeze({
  id:"nvidia/nemotron-3.5-lightning-30b-a3b",contextTokens:MODEL_CONTEXT_PUBLISHED["nvidia/nemotron-3.5-lightning-30b-a3b"],maxOutputTokens:null,
  contextSource:"published_model_spec_not_hosted_guarantee",
  supportsJsonMode:true,reasoning:"off",priority:1,
  params:Object.freeze({chat_template_kwargs:{enable_thinking:false}})
 }),
 "openai/gpt-oss-20b":Object.freeze({
  id:"openai/gpt-oss-20b",contextTokens:MODEL_CONTEXT_PUBLISHED["openai/gpt-oss-20b"],maxOutputTokens:null,
  contextSource:"published_model_spec_not_hosted_guarantee",
  supportsJsonMode:false,reasoning:"configurable",priority:2,
  params:Object.freeze({})
 })
});
const BUDGETS=Object.freeze({task:null,"task-fields":3000,"task-seeds":4000,"task-scenarios":3200,
 diagram:3200,summary:2800,post:3500,
 teste:11000,semantic:3200,revision:3100});
export function modelRequestOptions(model,mode="task",stream=false){
 const item=MODEL_REGISTRY[model];
 if(!item)throw TypeError("Modelo NVIDIA não registrado.");
 const max_tokens=BUDGETS[mode]??(model===MODEL_IDS[0]?8192:6000);
 return {
  temperature:mode==="semantic"?0:mode==="revision"?0.12:
   ["post","teste"].includes(mode)?0.15:0.1,
  max_tokens,stream:Boolean(stream),
  ...(["task","task-fields","task-scenarios","semantic"].includes(mode)&&item.supportsJsonMode?
   {response_format:{type:"json_object"}}:{}),
  ...item.params
 };
}
const CACHE_TTL_MS=180000;
const cache=new Map();
const inFlight=new Map();
export function clearModelDiscoveryCache(){cache.clear();inFlight.clear();}
const isValidIds=(ids)=>Array.isArray(ids)&&ids.every(id=>MODEL_REGISTRY[id]);
/** Discovery is best effort, cached only on successful responses. No keys are
 * retained in the cache. Concurrent requests in an isolate share one GET.
 */
/** @param {{
 *  apiKey?:string,
 *  modelIds?:readonly string[],
 *  fetchImpl?:typeof fetch,
 *  timeoutMs?:number,
 *  now?:()=>number,
 *  onDiscovery?:(metadata:Record<string,unknown>)=>void
 * }} config */
export async function discoverModels({
 apiKey,modelIds=MODEL_IDS,fetchImpl=fetch,
 timeoutMs=7000,now=()=>Date.now(),onDiscovery
}={}){
 if(!isValidIds(modelIds))throw TypeError("Lista de modelos inválida.");
 const cacheKey=NVIDIA_BASE+"|"+modelIds.join(",");
 const hit=cache.get(cacheKey);
 if(hit&&now()<hit.until)return [...hit.models];
 if(inFlight.has(cacheKey))return [...await inFlight.get(cacheKey)];
 const work=(async()=>{
  const started=Date.now();let status=0,outcome="upstream_error";
  try{
   const response=await fetchImpl(NVIDIA_BASE+"/models",{
    headers:{Authorization:"Bearer "+apiKey},
    signal:AbortSignal.timeout(timeoutMs)
   });
   status=response.status;
   outcome=response.ok?"ok":response.status===429?"rate_limited":
    response.status>=500?"upstream_5xx":"http_error";
   if(!response.ok)return [...modelIds];
   const data=await response.json();
   if(!Array.isArray(data?.data))return [...modelIds];
   const ids=new Set(data.data.map(row=>row?.id));
   const available=modelIds.filter(id=>ids.has(id));
   cache.set(cacheKey,{models:available,until:now()+CACHE_TTL_MS});
   return available;
  }catch(error){
   outcome=error?.name==="TimeoutError"?"timeout":
    error?.name==="AbortError"?"aborted":"upstream_error";
   return [...modelIds];
  }finally{
   onDiscovery?.({stage:"discovery",mode:"discovery",model:"catalog",
    prompt_chars:0,max_tokens:0,started_at:started,http_status:status,
    outcome,attempt:0,fallback_model:false});
  }
 })();
 inFlight.set(cacheKey,work);
 try{return [...await work];}finally{inFlight.delete(cacheKey);}
}
