/** F2 - typed, bounded errors and cancelable quota wait for QA AI requests.
 * Retry only a rejected HTTP 429, never an SSE response already in progress.
 * This module does not store source text, tokens or any private content.
 */
export type AiErrorCode=
 "unauthorized"|"forbidden"|"input_invalid"|"quota_exhausted"|
 "provider_rate_limited"|"provider_timeout"|"provider_unavailable"|
 "provider_auth"|"model_context_exceeded"|"output_invalid"|
 "configuration_error"|"quota_unavailable"|"request_failed";
export type AiWaitState={until:number;attempt:number;estimated:boolean;source:"quota"|"provider"};
export type AiWaitCallback=(state:AiWaitState|null)=>void;
const ALLOWED_CODES=new Set<AiErrorCode>([
 "unauthorized","forbidden","input_invalid","quota_exhausted",
 "provider_rate_limited","provider_timeout","provider_unavailable",
 "provider_auth","model_context_exceeded","output_invalid",
 "configuration_error","quota_unavailable","request_failed"
]);
const codeFor=(status:number):AiErrorCode=>
 status===429?"quota_exhausted":status===401?"unauthorized":
 status===403?"forbidden":status===504?"provider_timeout":
 status>=500?"provider_unavailable":status>=400&&status<500?"input_invalid":"request_failed";
const safeCode=(code:unknown,status:number):AiErrorCode=>
 typeof code==="string"&&ALLOWED_CODES.has(code as AiErrorCode)?
 code as AiErrorCode:codeFor(status);
const safeMessage=(message:unknown,status:number)=>
 typeof message==="string"&&message.length>0&&message.length<=600?
 message:"Não foi possível concluir a solicitação à IA (HTTP "+status+").";
function seconds(value:unknown):number|null{
 if(typeof value!=="number"&&typeof value!=="string")return null;
 if(typeof value==="string"&&!value.trim())return null;
 const n=Number(value);
 return Number.isFinite(n)&&n>0?Math.max(1,Math.min(3600,Math.ceil(n))):null;
}
export class AiRequestError extends Error{
 readonly status:number;
 readonly code:AiErrorCode;
 readonly retryAfterSeconds:number|null;
 readonly requestId:string|null;
 readonly retryable:boolean;
 constructor(status:number,opts:{code?:unknown;message?:unknown;retryAfterSeconds?:unknown;
   requestId?:unknown;retryable?:unknown}={}){
  super(safeMessage(opts.message,status));
  this.name="AiRequestError";
  this.status=status;
  this.code=safeCode(opts.code,status);
  this.retryAfterSeconds=seconds(opts.retryAfterSeconds);
  this.requestId=typeof opts.requestId==="string"&&/^[0-9a-f-]{36}$/.test(opts.requestId)?
   opts.requestId:null;
  this.retryable=typeof opts.retryable==="boolean"?opts.retryable:
   ["quota_exhausted","provider_rate_limited","provider_timeout","provider_unavailable"].includes(this.code);
 }
}
type ServerError={code?:unknown;message?:unknown;retry_after_seconds?:unknown;request_id?:unknown;
 retryable?:unknown};
async function parseBody(response:{json:()=>Promise<unknown>}):Promise<ServerError>{
 try{
  const body:unknown=await response.json();
  return body&&typeof body==="object"&&!Array.isArray(body)?body as ServerError:{};
 }catch{return {};}
}
function headersRetry(headers:{get:(name:string)=>string|null}|undefined):number|null{
 const raw=headers?.get("Retry-After");
 if(!raw)return null;
 const n=seconds(raw);
 if(n!==null)return n;
 const date=Date.parse(raw);
 return Number.isFinite(date)?Math.max(1,Math.min(3600,
  Math.ceil((date-Date.now())/1000))):null;
}
export async function readAiHttpError(response:Pick<Response,"status"|"json"|"headers">){
 const data=await parseBody(response);
 const retry=seconds(data.retry_after_seconds)??headersRetry(response.headers);
 return new AiRequestError(response.status,{code:data.code,message:data.message,
  retryAfterSeconds:retry,requestId:data.request_id??response.headers?.get("X-Request-ID"),
  retryable:data.retryable});
}
/** Supabase functions.invoke returns a FunctionsHttpError with a response in context. */
export async function readAiInvokeError(error:unknown):Promise<AiRequestError>{
 const context=error&&typeof error==="object"&&"context" in error?
  (error as {context?:unknown}).context:null;
 const response=context&&typeof context==="object"?context as Partial<Response>:null;
 const status=typeof response?.status==="number"?response.status:0;
 const data=response&&typeof response.json==="function"?await parseBody(
  response as {json:()=>Promise<unknown>}):{};
 return new AiRequestError(status,{
  code:data.code,message:data.message,
  retryAfterSeconds:seconds(data.retry_after_seconds)??
   (response?.headers&&typeof response.headers.get==="function"?headersRetry(response.headers):null),
  requestId:data.request_id,retryable:data.retryable
 });
}
export function aborted():Error{
 return new DOMException("Operação cancelada.", "AbortError");
}
export async function abortableWait(ms:number,signal?:AbortSignal):Promise<void>{
 if(signal?.aborted)throw aborted();
 if(ms<=0)return;
 await new Promise<void>((resolve,reject)=>{
  let timer:ReturnType<typeof setTimeout>;
  const stop=()=>{clearTimeout(timer);signal?.removeEventListener("abort",onAbort);};
  const onAbort=()=>{stop();reject(aborted());};
  signal?.addEventListener("abort",onAbort,{once:true});
  if(signal?.aborted){onAbort();return;}
  timer=setTimeout(()=>{stop();resolve();},ms);
 });
}
/** Server-side quota remains authoritative. Never reserve or bypass it in UI.
 * Per operation, at most two automatic retries and <=120 s cumulative wait.
 */
export async function withAiRateLimitRetry<T>(request:()=>Promise<T>,{
 signal,onWait,maxRetries=2,maxTotalWaitMs=120000,
 wait=abortableWait,now=()=>Date.now()
}:{
 signal?:AbortSignal;onWait?:AiWaitCallback;maxRetries?:number;
 maxTotalWaitMs?:number;wait?:(ms:number,signal?:AbortSignal)=>Promise<void>;
 now?:()=>number;
}={}):Promise<T>{
 let waited=0;
 const limit=Math.max(0,Math.min(2,Math.floor(maxRetries)));
 try{
  for(let attempt=0;;attempt++){
   if(signal?.aborted)throw aborted();
   try{return await request();}
   catch(reason){
    if(signal?.aborted)throw aborted();
    if(!(reason instanceof AiRequestError)||reason.status!==429||attempt>=limit)throw reason;
    const fallback=15;
    const delaySeconds=reason.retryAfterSeconds??fallback;
    const delayMs=delaySeconds*1000;
    if(waited+delayMs>maxTotalWaitMs)throw reason;
    waited+=delayMs;
    onWait?.({until:now()+delayMs,attempt:attempt+1,
     estimated:reason.retryAfterSeconds===null,
     source:reason.code==="provider_rate_limited"?"provider":"quota"});
    await wait(delayMs,signal);
    onWait?.(null);
   }
  }
 }finally{onWait?.(null);}
}
