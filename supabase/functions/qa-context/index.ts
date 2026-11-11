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
 extra:Record<string,string>={}){
 return new Response(JSON.stringify(body),{status,
  headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8",...extra}});
}
async function freeModels(key:string){
 try{
  const response=await fetch(NVIDIA+"/models",{
   headers:{Authorization:"Bearer "+key},signal:AbortSignal.timeout(6000)});
  if(!response.ok)return MODELS;
  const json=await response.json();
  if(!Array.isArray(json?.data))return MODELS;
  const ids=new Set(json.data.map((item:{id?:string})=>item.id));
  return MODELS.filter(id=>ids.has(id));
 }catch{return MODELS;}
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return respond(origin,405,{message:"Método não permitido."});
 if(origin&&!ORIGINS.has(origin))return respond(origin,403,{message:"Origem não autorizada."});
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return respond(origin,401,{message:"Faça login para usar a IA."});
 const url=Deno.env.get("SUPABASE_URL")||"",
  anon=Deno.env.get("SUPABASE_ANON_KEY")||"",
  key=Deno.env.get("NVIDIA_API_KEY")||"";
 if(!url||!anon)return respond(origin,503,{message:"Autenticação indisponível."});
 const db=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:identity,error:authError}=await db.auth.getUser(auth.slice(7));
 if(authError||!identity.user||identity.user.is_anonymous)
  return respond(origin,401,{message:"Sua sessão expirou. Entre novamente."});
 let body:Record<string,unknown>;
 try{
  if(Number(req.headers.get("Content-Length")||0)>23000)
   return respond(origin,413,{message:"Trecho muito longo para compactação."});
  const parsed=await req.json();
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();
  body=parsed as Record<string,unknown>;
 }catch{return respond(origin,400,{message:"Envie um trecho de texto válido."});}
 const goal=body.goal,source=body.source,chunkId=body.chunkId,text=body.text;
 if(!GOALS.includes(goal)||!["TF","REQ"].includes(source)||
  typeof chunkId!=="string"||!/^(TF|REQ)-\d{3}$/.test(chunkId)||
  !chunkId.startsWith(source+"-")||
  typeof text!=="string"||text.trim().length<10||text.length>9000){
  return respond(origin,400,{message:"Contexto ou identificador da parte inválido."});
 }
 if(!key)return respond(origin,503,{message:"A chave NVIDIA não está configurada."});
 const models=await freeModels(key);
 if(!models.length)return respond(origin,503,{message:"Nenhum modelo gratuito disponível."});
 let lastStatus=0,hadUnstructured=false;
 for(const model of models){
  // Each upstream attempt consumes the same shared rolling quota (15/min).
  const claim=await db.rpc("qa_ai_claim_minute_request");
  if(claim.error||!claim.data||typeof claim.data!=="object")
   return respond(origin,503,{message:"Não foi possível consultar a quota da IA."});
  if(!claim.data.allowed){
   const retry=Math.max(1,Math.min(60,Math.ceil(Number(claim.data.retry_after_seconds)||60)));
   return respond(origin,429,{error:"rate_limited",retry_after_seconds:retry,
    message:"Limite compartilhado da NVIDIA atingido. Retome a compactação após a liberação."},
    {"Retry-After":String(retry)});
  }
  try{
   const response=await fetch(NVIDIA+"/chat/completions",{
    method:"POST",
    headers:{Authorization:"Bearer "+key,"Content-Type":"application/json",
     Accept:"application/json"},
    body:JSON.stringify({model,messages:semanticMessages(goal,source,chunkId,text),
     temperature:0,max_tokens:3200,stream:false,
     ...(model.startsWith("nvidia/nemotron-")?
      {chat_template_kwargs:{enable_thinking:false}}:{})}),
    signal:AbortSignal.timeout(52000)
   });
   lastStatus=response.status;
   if(response.status===401||response.status===403)
    return respond(origin,503,{message:"A chave NVIDIA deve ser revisada."});
   if(response.status===429)
    return respond(origin,429,{error:"provider_rate_limited",
     message:"A NVIDIA limitou as solicitações. Retome mais tarde."});
   if(!response.ok){console.warn("qa-context provider",{status:response.status,model});continue;}
   const payload=await response.json();
   const result=parseModelFacts(payload,text);
   if(!result.valid){hadUnstructured=true;continue;}
   return respond(origin,200,{chunkId,source,goal,
    facts:result.facts,unverified:result.unverified,model,provider:"NVIDIA Build"});
  }catch(reason){
   console.warn("qa-context upstream",{model,
    reason:reason instanceof DOMException?reason.name:"request_failed"});
  }
 }
 return respond(origin,503,{error:"semantic_unavailable",status:lastStatus,
  message:hadUnstructured?
   "A NVIDIA não retornou citações estruturadas. O texto original permanece disponível.":
   "Não foi possível analisar esta parte. Retome sem perder o progresso."});
});
