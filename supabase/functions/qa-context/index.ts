import {errorBody,errorHeaders} from "../_shared/ai-error-response.mjs";
import {correlationId,promptChars,logAiAttempt,exceptionOutcome,httpOutcome} from "../_shared/ai-observability.mjs";
import {createClient} from "npm:@supabase/supabase-js@2.119.0";
import {GOALS,semanticMessages,parseModelFacts} from "./facts.mjs";

const MODELS=["z-ai/glm-5.3-flash","nvidia/nemotron-3.5-lightning-30b-a3b"];
const NVIDIA="https://integrate.api.nvidia.com/v1";
const ORIGINS=new Set(["https://kaina-visualsoftware.github.io",
 "http://127.0.0.1:8765","http://localhost:8765"]);
function cors(origin:string|null){
 return {"Access-Control-Allow-Origin":origin&&ORIGINS.has(origin)?origin:
  "https://kaina-visualsoftware.github.io",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Cache-Control":"no-store","Vary":"Origin"};
}
function respond(origin:string|null,status:number,body:Record<string,unknown>,
 extra:Record<string,string>={},trace=""){
 const payload=status>=400?errorBody(status,body,trace):body;
 return new Response(JSON.stringify(payload),{status,
  headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8",
   "Access-Control-Expose-Headers":"Retry-After, X-Request-ID",
   ...errorHeaders(status>=400?body:{},extra,trace)}});
}
async function freeModels(key:string,trace:string){
 const started=Date.now();
 let status=0,outcome="upstream_error";
 try{
  const response=await fetch(NVIDIA+"/models",{
   headers:{Authorization:"Bearer "+key},signal:AbortSignal.timeout(6000)});
  status=response.status;outcome=response.ok?"ok":httpOutcome(status);
  if(!response.ok)return MODELS;
  const json=await response.json();
  if(!Array.isArray(json?.data))return MODELS;
  const ids=new Set(json.data.map((item:{id?:string})=>item.id));
  return MODELS.filter(id=>ids.has(id));
 }catch(error){outcome=exceptionOutcome(error);return MODELS;}
 finally{
  logAiAttempt({correlation_id:trace,stage:"discovery",mode:"discovery",model:"catalog",
   prompt_chars:0,max_tokens:0,started_at:started,http_status:status,
   outcome,attempt:0,fallback_model:false});
 }
}
Deno.serve(async(req:Request)=>{
 const trace=correlationId(req.headers.get("x-correlation-id"));
 const origin=req.headers.get("Origin");
 const reply=(status:number,body:Record<string,unknown>,extra:Record<string,string>={})=>respond(origin,status,body,extra,trace);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return reply(405,{message:"Método não permitido."});
 if(origin&&!ORIGINS.has(origin))return reply(403,{message:"Origem não autorizada."});
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return reply(401,{message:"Faça login para usar a IA."});
 const url=Deno.env.get("SUPABASE_URL")||"",
  anon=Deno.env.get("SUPABASE_ANON_KEY")||"",
  key=Deno.env.get("NVIDIA_API_KEY")||"";
 if(!url||!anon)return reply(503,{message:"Autenticação indisponível."});
 const db=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:identity,error:authError}=await db.auth.getUser(auth.slice(7));
 if(authError||!identity.user||identity.user.is_anonymous)
  return reply(401,{message:"Sua sessão expirou. Entre novamente."});
 let body:Record<string,unknown>;
 try{
  if(Number(req.headers.get("Content-Length")||0)>23000)
   return reply(413,{message:"Trecho muito longo para compactação."});
  const parsed=await req.json();
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();
  body=parsed as Record<string,unknown>;
 }catch{return reply(400,{message:"Envie um trecho de texto válido."});}
 const goal=body.goal,source=body.source,chunkId=body.chunkId,text=body.text;
 if(!GOALS.includes(goal)||!["TF","REQ"].includes(source)||
  typeof chunkId!=="string"||!/^(TF|REQ)-\d{3}$/.test(chunkId)||
  !chunkId.startsWith(source+"-")||
  typeof text!=="string"||text.trim().length<10||text.length>9000){
  return reply(400,{message:"Contexto ou identificador da parte inválido."});
 }
 if(!key)return reply(503,{message:"A chave NVIDIA não está configurada."});
 const models=await freeModels(key,trace);
 if(!models.length)return reply(503,{message:"Nenhum modelo gratuito disponível."});
 const mode="semantic:"+goal;
 const messages=semanticMessages(goal,source,chunkId,text);
 const chars=promptChars(messages);
 let lastStatus=0,hadUnstructured=false,hadTimeout=false;
 for(const [modelIndex,model] of models.entries()){
  const telemetry={correlation_id:trace,mode,model,prompt_chars:chars,max_tokens:3200,
   attempt:modelIndex+1,fallback_model:modelIndex>0};
  // Each upstream attempt consumes the same shared rolling quota (15/min).
  const claim=await db.rpc("qa_ai_claim_minute_request");
  if(claim.error||!claim.data||typeof claim.data!=="object")
   return reply(503,{message:"Não foi possível consultar a quota da IA."});
  if(!claim.data.allowed){
   logAiAttempt({...telemetry,stage:"quota",started_at:Date.now(),
    http_status:429,outcome:"rate_limited"});
   const retry=Math.max(1,Math.min(60,Math.ceil(Number(claim.data.retry_after_seconds)||60)));
   return reply(429,{error:"rate_limited",retry_after_seconds:retry,
    message:"Limite compartilhado da NVIDIA atingido. Retome a compactação após a liberação."},
    {"Retry-After":String(retry)});
  }
  const started=Date.now();
  let responseStatus=0,finishReason=null,usage=null,outcome="upstream_error";
  try{
   const response=await fetch(NVIDIA+"/chat/completions",{
    method:"POST",
    headers:{Authorization:"Bearer "+key,"Content-Type":"application/json",
     Accept:"application/json"},
    body:JSON.stringify({model,messages,
     temperature:0,max_tokens:3200,stream:false,
     response_format:{type:"json_object"},
     ...(model==="z-ai/glm-5.3-flash"?{reasoning_effort:"low"}:
      model.startsWith("nvidia/nemotron-")?
      {chat_template_kwargs:{enable_thinking:false}}:{})}),
    signal:AbortSignal.timeout(30000)
   });
   lastStatus=response.status;responseStatus=response.status;
   if(!response.ok)outcome=httpOutcome(response.status);
   if(response.status===401||response.status===403)
    return reply(503,{message:"A chave NVIDIA deve ser revisada."});
   if(response.status===429){
     const wait=response.headers.get("Retry-After");
     return reply(429,{error:"provider_rate_limited",
      ...(wait&&Number.isFinite(Number(wait))?{retry_after_seconds:Number(wait)}:{}),
      message:"A NVIDIA limitou as solicitações. O conteúdo foi preservado."},
      wait&&Number.isFinite(Number(wait))?{"Retry-After":wait}:{});
    }
   if(!response.ok){console.warn("qa-context provider",{status:response.status,model});continue;}
   const payload=await response.json();
   finishReason=payload?.choices?.[0]?.finish_reason??null;
   usage=payload?.usage??null;
   outcome=finishReason==="length"?"length":
     payload?.choices?.[0]?.message?.content?"schema_invalid":"empty";
   const result=parseModelFacts(payload,text);
   if(!result.valid){hadUnstructured=true;continue;}
   outcome="ok";
   return reply(200,{chunkId,source,goal,
    facts:result.facts,unverified:result.unverified,model,provider:"NVIDIA Build"});
  }catch(reason){
   outcome=exceptionOutcome(reason);
   if(reason instanceof DOMException&&reason.name==="TimeoutError")hadTimeout=true;
   console.warn("qa-context upstream",{model,
    reason:reason instanceof DOMException?reason.name:"request_failed"});
  }finally{
   logAiAttempt({...telemetry,started_at:started,http_status:responseStatus,
    finish_reason:finishReason,usage,outcome});
  }
 }
 return reply(503,{error:hadTimeout?"semantic_timeout":"semantic_unavailable",status:lastStatus,
  message:hadTimeout?
   "Os modelos NVIDIA ultrapassaram o tempo de resposta desta parte. Os blocos concluídos foram mantidos; tente continuar ou escolha o modo rápido.":
   hadUnstructured?
   "A NVIDIA não retornou citações estruturadas. O texto original permanece disponível.":
   "Não foi possível analisar esta parte. Retome sem perder o progresso."});
});
