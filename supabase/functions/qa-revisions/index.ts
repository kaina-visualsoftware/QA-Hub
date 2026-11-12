import {errorBody,errorHeaders} from "../_shared/ai-error-response.mjs";
import {correlationId} from "../_shared/ai-observability.mjs";
import {edgeModels,edgeJsonModels,edgeErrorHttp} from "../_shared/llm/edge-runtime.mjs";
import {createClient} from "npm:@supabase/supabase-js@2.119.0";
import {revisionMessages,validateRevisionInput,normalizeRevision} from "./revision.mjs";

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
  if(Number(req.headers.get("Content-Length")||0)>80000)
   return reply(413,{message:"Dados extensos demais para revisão de trecho."});
  const parsed=await req.json();
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();
  body=parsed as Record<string,unknown>;
 }catch{return reply(400,{message:"Envie um trecho de texto válido."});}
 const input=validateRevisionInput(body);
 if(!input)return reply(400,{message:"Selecione um trecho válido do post ou um caso de teste."});
 if(!key)return reply(503,{message:"A chave NVIDIA não está configurada."});
 const models=await edgeModels({apiKey:key,trace});
 if(!models.length)return reply(503,{message:"Nenhum modelo gratuito disponível."});
 const mode="revision:"+input.operation;
 const messages=revisionMessages(input);
 const outcome=await edgeJsonModels({apiKey:key,db,trace,mode,modelMode:"revision",
  messages,models,maxTokens:3100,timeoutMs:52000,deadlineMs:82000,
  options:{temperature:0.12},
  validate:payload=>normalizeRevision(payload,input.operation)});
 if(outcome.ok)return reply(200,{operation:input.operation,
  proposal:outcome.value,model:outcome.model,provider:"NVIDIA Build"});
 const mapped=edgeErrorHttp(outcome.error,{
  quotaMessage:"Limite compartilhado da NVIDIA atingido. O rascunho foi preservado.",
  providerMessage:"A NVIDIA limitou as solicitações. O conteúdo foi preservado."
 });
 if(mapped)return reply(mapped.status,mapped.body,mapped.headers as Record<string,string>);
 if(outcome.contextExceeded&&!outcome.unstructured)
  return reply(400,{error:"model_context_exceeded",
   message:"O trecho ultrapassa o orçamento estimado do modelo. Revise a seleção."});
 return reply(503,{error:"revision_unavailable",status:outcome.lastStatus,
  message:outcome.unstructured?
   "A NVIDIA não retornou o trecho no formato esperado. O rascunho permanece intacto.":
   "Não foi possível revisar este trecho. O conteúdo anterior foi preservado."});
});
