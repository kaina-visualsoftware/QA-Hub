/** F2: shared, sanitized HTTP error contract for all QA AI Edge Functions.
 * Existing "error" values remain for backward compatibility; "code" is the
 * canonical client-facing classification. Never pass raw NVIDIA bodies here.
 */
export const AI_ERROR_CODES=Object.freeze([
 "unauthorized","forbidden","input_invalid","feature_disabled","quota_exhausted",
 "provider_rate_limited","provider_timeout","provider_unavailable",
 "provider_auth","model_context_exceeded","output_invalid",
 "configuration_error","quota_unavailable","request_failed"
]);
const CODES=new Set(AI_ERROR_CODES);
const LEGACY=Object.freeze({
 unauthorized:"unauthorized",forbidden:"forbidden",feature_disabled:"feature_disabled",method_not_allowed:"input_invalid",
 bad_request:"input_invalid",invalid_repair:"input_invalid",bad_input:"input_invalid",
 rate_limited:"quota_exhausted",nvidia_rate_limited:"provider_rate_limited",
 rate_limit:"provider_rate_limited",provider_rate_limited:"provider_rate_limited",
 semantic_timeout:"provider_timeout",ai_temporarily_unavailable:"provider_unavailable",
 semantic_unavailable:"provider_unavailable",revision_unavailable:"provider_unavailable",
 provider_unavailable:"provider_unavailable",models_unavailable:"provider_unavailable",
 free_model_unavailable:"provider_unavailable",nvidia_key_invalid:"provider_auth",
 invalid_key:"provider_auth",model_context_exceeded:"model_context_exceeded",
 summary_incomplete:"output_invalid",missing_key:"configuration_error",
 nvidia_not_configured:"configuration_error",auth_not_configured:"configuration_error",
 auth_unconfigured:"configuration_error",rate_limit_not_ready:"quota_unavailable",
 quota_unavailable:"quota_unavailable",semantic_invalid:"output_invalid"
});
const DEFAULT=Object.freeze({
 401:"unauthorized",403:"forbidden",400:"input_invalid",405:"input_invalid",
 413:"input_invalid",422:"input_invalid",429:"quota_exhausted",
 502:"provider_unavailable",503:"provider_unavailable",504:"provider_timeout"
});
export function sanitizeRetryAfter(value){
 const n=typeof value==="string"&&value.trim()?Number(value):value;
 if(typeof n!=="number"||!Number.isFinite(n)||n<=0)return null;
 return Math.max(1,Math.min(3600,Math.ceil(n)));
}
export function errorCode(status,legacy){
 const raw=typeof legacy==="string"&&/^[a-z_]{2,60}$/.test(legacy)?legacy:"";
 const code=LEGACY[raw]??(CODES.has(raw)?raw:DEFAULT[status]);
 return code??"request_failed";
}
export function errorBody(status,input={},requestId=""){
 const data=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
 const original=typeof data.error==="string"&&/^[a-z_]{2,60}$/.test(data.error)?
  data.error:undefined;
 const code=errorCode(status,typeof data.code==="string"&&CODES.has(data.code)?data.code:original);
 const message=typeof data.message==="string"&&data.message.length<=600?
  data.message:"A solicitação de IA não pôde ser concluída.";
 const retryAfter=sanitizeRetryAfter(data.retry_after_seconds);
 const out={error:original??code,code,message,
  retryable:["quota_exhausted","provider_rate_limited","provider_timeout","provider_unavailable"].includes(code),
  request_id:typeof requestId==="string"&&/^[0-9a-f-]{36}$/.test(requestId)?requestId:"",
  ...(retryAfter!==null?{retry_after_seconds:retryAfter}:{})};
 if(typeof data.status==="number"&&Number.isInteger(data.status)&&data.status>=0&&data.status<=599)
  out.status=data.status;
 if(typeof data.limit==="number"&&Number.isInteger(data.limit)&&data.limit>0&&data.limit<1000)
  out.limit=data.limit;
 if(typeof data.window_seconds==="number"&&Number.isInteger(data.window_seconds)&&
   data.window_seconds>0&&data.window_seconds<=86400)out.window_seconds=data.window_seconds;
 return out;
}
export function errorHeaders(input={},extra={},requestId=""){
 const retry=sanitizeRetryAfter(input?.retry_after_seconds??extra?.["Retry-After"]);
 return {
  ...extra,
  ...(retry!==null?{"Retry-After":String(retry)}:{}),
  "X-Request-ID":requestId
 };
}
