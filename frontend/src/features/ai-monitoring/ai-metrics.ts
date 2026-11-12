/** F8 read-only, zero-network metadata diagnostics.
 * Only whitelisted fields from F0 qa_ai_attempt events enter state or UI.
 * This intentionally does not query private Supabase logs or store raw text.
 */
export const MAX_AI_LOG_FILE_BYTES=2*1024*1024;
const MODES=new Set(["discovery","task","task-fields","task-scenarios","diagram",
 "diagram-summary","post","teste","semantic:task","semantic:post",
 "semantic:teste","revision:post_excerpt","revision:test_case"]);
const MODELS=new Set(["catalog","z-ai/glm-5.3-flash","nvidia/nemotron-3.5-lightning-30b-a3b"]);
const STAGES=new Set(["provider","quota","discovery"]);
const OUTCOMES=new Set(["ok","timeout","length","empty","schema_invalid",
 "context_exceeded","rate_limited","upstream_5xx","http_error","aborted",
 "upstream_error","stream_overflow","breaker_open"]);
export type AiAttempt={
 stage:"provider"|"quota"|"discovery";mode:string;model:string;outcome:string;
 elapsed_ms:number;http_status:number;fallback_model:boolean;
 prompt_tokens_est:number;total_tokens:number|null
};
export type AiLogImport={attempts:AiAttempt[];ignored:number};
export type AiMetricSummary={
 total:number;providerAttempts:number;providerSuccess:number;
 successPercent:number|null;quotaDenied:number;providerRateLimited:number;
 fallbackAttempts:number;truncated:number;timeouts:number;
 p50Ms:number|null;p95Ms:number|null;estimatedPromptTokens:number;
 reportedTokens:number;
};
const asObject=(v:unknown):Record<string,unknown>|null=>
 v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
const numeric=(x:unknown,limit:number)=>
 typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=limit?Math.floor(x):null;
function unwrap(entry:unknown):Record<string,unknown>|null{
 const row=asObject(entry);
 if(!row)return null;
 if(row.event==="qa_ai_attempt")return row;
 if(row.metadata&&asObject(row.metadata)?.event==="qa_ai_attempt")
  return asObject(row.metadata);
 if(typeof row.event_message==="string"&&row.event_message.startsWith("qa_ai_attempt ")){
  // Supabase's serialized log string is accepted ONLY when its suffix is JSON.
  try{return asObject(JSON.parse(row.event_message.slice(14)));}catch{return null;}
 }
 return null;
}
function sanitize(row:unknown):AiAttempt|null{
 const data=unwrap(row);
 if(!data||data.version!==1||!STAGES.has(data.stage as string)||
  !MODES.has(data.mode as string)||!MODELS.has(data.model as string)||
  !OUTCOMES.has(data.outcome as string))return null;
 const ms=numeric(data.elapsed_ms,3600000);
 const status=numeric(data.http_status,599);
 if(ms===null||status===null)return null;
 const usage=asObject(data.usage);
 return {
  stage:data.stage as AiAttempt["stage"],mode:data.mode as string,
  model:data.model as string,outcome:data.outcome as string,
  elapsed_ms:ms,http_status:status,fallback_model:data.fallback_model===true,
  prompt_tokens_est:numeric(data.prompt_tokens_est,10000000)??0,
  total_tokens:numeric(usage?.total_tokens,10000000)
 };
}
/** Accepts a JSON array, {events:[...]}, a single object or JSONL.
 * Failed/unknown rows are counted but never displayed or persisted.
 */
export function parseAiLogExport(text:string):AiLogImport{
 if(typeof text!=="string"||new TextEncoder().encode(text).length>MAX_AI_LOG_FILE_BYTES)
  throw Error("O arquivo excede o limite de 2 MB.");
 let rows:unknown[];
 try{
  const parsed=JSON.parse(text);
  rows=Array.isArray(parsed)?parsed:Array.isArray(asObject(parsed)?.events)?
   asObject(parsed)!.events as unknown[]:[parsed];
 }catch{
  rows=text.split(/\r?\n/).filter(Boolean).map(line=>{
   try{return JSON.parse(line);}catch{return null;}
  });
 }
 if(rows.length>12000)throw Error("A exportação possui registros demais.");
 const attempts=rows.map(sanitize).filter((r):r is AiAttempt=>r!==null);
 return {attempts,ignored:rows.length-attempts.length};
}
const fraction=(a:number,b:number)=>b?Number((100*a/b).toFixed(1)):null;
const quantile=(sorted:number[],fraction:number)=>sorted.length?
 sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)]:null;
export function summarizeAiAttempts(rows:AiAttempt[]):AiMetricSummary{
 const providers=rows.filter(r=>r.stage==="provider");
 const latency=providers.filter(r=>r.elapsed_ms>0).map(r=>r.elapsed_ms).sort((a,b)=>a-b);
 const quota=rows.filter(r=>r.stage==="quota"&&r.outcome==="rate_limited");
 return {
  total:rows.length,providerAttempts:providers.length,
  providerSuccess:providers.filter(r=>r.outcome==="ok").length,
  successPercent:fraction(providers.filter(r=>r.outcome==="ok").length,providers.length),
  quotaDenied:quota.length,
  providerRateLimited:providers.filter(r=>r.outcome==="rate_limited").length,
  fallbackAttempts:providers.filter(r=>r.fallback_model).length,
  truncated:providers.filter(r=>r.outcome==="length"||r.outcome==="stream_overflow").length,
  timeouts:providers.filter(r=>r.outcome==="timeout").length,
  p50Ms:quantile(latency,.50),p95Ms:quantile(latency,.95),
  estimatedPromptTokens:providers.reduce((sum,r)=>sum+r.prompt_tokens_est,0),
  reportedTokens:providers.reduce((sum,r)=>sum+(r.total_tokens??0),0)
 };
}
export function groupAiAttempts(rows:AiAttempt[]):Array<{key:string;summary:AiMetricSummary}>{
 const groups=new Map<string,AiAttempt[]>();
 for(const item of rows.filter(r=>r.stage==="provider")){
  const key=item.mode+" · "+item.model;
  groups.set(key,[...(groups.get(key)??[]),item]);
 }
 return [...groups.entries()].map(([key,items])=>({
  key,summary:summarizeAiAttempts(items)
 })).sort((a,b)=>b.summary.providerAttempts-a.summary.providerAttempts);
}
export function aiMetricWarnings(summary:AiMetricSummary):string[]{
 const notices:string[]=[];
 if(summary.providerAttempts<20)return ["Amostra insuficiente: menos de 20 tentativas reais do provedor."];
 if(summary.successPercent!==null&&summary.successPercent<90)
  notices.push("Sucesso do provedor abaixo de 90% nesta amostra.");
 if(summary.p95Ms!==null&&summary.p95Ms>40000)
  notices.push("P95 do provedor acima de 40 segundos nesta amostra.");
 if(summary.truncated/summary.providerAttempts>.05)
  notices.push("Truncamento acima de 5% das tentativas nesta amostra.");
 return notices;
}
