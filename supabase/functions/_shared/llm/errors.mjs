/** Typed provider failures. Never expose raw response bodies, request text
 * or authorization headers in error messages or logs.
 */
const SAFE_MESSAGES=Object.freeze({
 timeout:"O modelo ultrapassou o tempo disponível.",
 length:"O modelo atingiu o limite da resposta.",
 empty:"O modelo não retornou conteúdo utilizável.",
 rate_limited:"O limite de chamadas foi atingido.",
 auth:"A autenticação com a NVIDIA falhou.",
 context_exceeded:"O conteúdo excede a janela do modelo.",
 upstream:"O provedor de IA não concluiu a solicitação.",
 aborted:"A solicitação foi cancelada.",
 schema_invalid:"O modelo retornou resposta fora do formato esperado.",
 breaker_open:"O modelo está temporariamente suspenso após falhas.",
 quota_unavailable:"Não foi possível verificar a cota compartilhada."
});
export class ProviderError extends Error{
 constructor(kind,details={}){
  super(SAFE_MESSAGES[kind]??SAFE_MESSAGES.upstream);
  this.name="ProviderError";
  this.kind=Object.hasOwn(SAFE_MESSAGES,kind)?kind:"upstream";
  this.status=typeof details.status==="number"?details.status:0;
  this.retryAfterSeconds=Number.isFinite(details.retryAfterSeconds)?
   Math.max(0,Math.ceil(details.retryAfterSeconds)):null;
  this.stage=details.stage==="quota"?"quota":"provider";
  this.finishReason=typeof details.finishReason==="string"?details.finishReason:null;
  this.usage=details.usage??null;
  this.partial=typeof details.partial==="string"?details.partial:null;
  this.model=typeof details.model==="string"?details.model:null;
 }
}
export function retryAfterSeconds(value,now=()=>Date.now()){
 if(value===null||value===undefined||value==="")return null;
 const n=Number(value);
 if(Number.isFinite(n)&&n>=0)return Math.min(3600,Math.ceil(n));
 const date=Date.parse(value);
 if(Number.isFinite(date))return Math.min(3600,Math.max(0,Math.ceil((date-now())/1000)));
 return null;
}
export function classifyStatus(status,body="",retryAfter=null){
 let kind="upstream";
 if(status===401||status===403)kind="auth";
 else if(status===429)kind="rate_limited";
 else if([400,413,422].includes(status)&&
  /context.{0,40}(length|window|limit)|too many tokens|maximum.{0,30}tokens|token.{0,30}limit/i.test(body))
   kind="context_exceeded";
 else if([400,413,422].includes(status))kind="schema_invalid";
 return new ProviderError(kind,{status,retryAfterSeconds:retryAfter});
}
export function classifyException(error,timedOut=false){
 // A local timeout aborts fetch/read with AbortError or ProviderError("aborted").
 // Preserve the actual cause before inspecting the nested error type.
 if(timedOut)return new ProviderError("timeout",{status:error?.status??0,
  partial:error?.partial,usage:error?.usage,finishReason:error?.finishReason});
 if(error instanceof ProviderError)return error;
 if(error?.name==="TimeoutError")return new ProviderError("timeout");
 if(error?.name==="AbortError")return new ProviderError("aborted");
 return new ProviderError("upstream");
}
export function telemetryOutcome(error){
 if(!(error instanceof ProviderError))return "upstream_error";
 switch(error.kind){
  case "timeout":return "timeout";
  case "length":return "length";
  case "empty":return "empty";
  case "rate_limited":return "rate_limited";
  case "context_exceeded":return "context_exceeded";
  case "schema_invalid":return "schema_invalid";
  case "aborted":return "aborted";
  case "breaker_open":return "breaker_open";
  default:return error.status>=500?"upstream_5xx":"upstream_error";
 }
}
