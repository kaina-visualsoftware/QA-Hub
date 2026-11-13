import {errorBody,errorHeaders} from "../_shared/ai-error-response.mjs";
import {aiFeatureEnabled,disabledAiResponse} from "../_shared/ai-feature-flags.mjs";
import {correlationId} from "../_shared/ai-observability.mjs";
import {edgeModels,edgeStreamingModels,edgeErrorHttp} from "../_shared/llm/edge-runtime.mjs";
import {createClient} from "npm:@supabase/supabase-js@2.119.0";
import {messagesForGenerator} from "./prompts.mjs";
import {parseGeneratorBatch,messagesForGeneratorBatch} from "./batches.mjs";
import {generatorModelOrder,VERIFIED_FREE_CHAT_MODELS} from "./model-order.mjs";

// Only explicit free-endpoint NVIDIA Build models, not paid endpoints.
const ORIGINS=new Set(["https://kaina-visualsoftware.github.io","http://127.0.0.1:8765","http://localhost:8765"]);
function headers(origin:string|null){
  return {"Access-Control-Allow-Origin":origin&&ORIGINS.has(origin)?origin:"https://kaina-visualsoftware.github.io",
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store","Vary":"Origin"};
}
function json(origin:string|null,status:number,body:Record<string,unknown>,extraHeaders:Record<string,string>={},trace:string=""){
  const payload=status>=400?errorBody(status,body,trace):body;
  return new Response(JSON.stringify(payload),{status,headers:{...headers(origin),
    "Content-Type":"application/json; charset=utf-8",
    "Access-Control-Expose-Headers":"Retry-After, X-Request-ID",
    ...errorHeaders(status>=400?body:{},extraHeaders,trace)}});
}
Deno.serve(async req=>{
  const trace=correlationId(req.headers.get("x-correlation-id"));
  const origin=req.headers.get("Origin");
  const reply=(status:number,body:Record<string,unknown>,extra:Record<string,string>={})=>json(origin,status,body,extra,trace);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=="POST")return reply(405,{error:"method_not_allowed",message:"Método não permitido."});
  if(origin&&!ORIGINS.has(origin))return reply(403,{error:"forbidden",message:"Origem não autorizada."});
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))return reply(401,{error:"unauthorized",message:"Entre no QA Hub para gerar com IA."});
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!url||!anon)return reply(503,{error:"auth_not_configured",message:"Autenticação não configurada."});
  const db=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:identity,error:authError}=await db.auth.getUser(auth.slice(7));
  if(authError||!identity.user||identity.user.is_anonymous)
    return reply(401,{error:"unauthorized",message:"Faça login novamente para gerar com IA."});
  if(!aiFeatureEnabled("general",identity.user.id))
    return reply(503,disabledAiResponse());
  let data:{mode?:string;tarefa?:string;requisito?:string;batch?:unknown}|null;
  try{
    if(Number(req.headers.get("Content-Length")||0)>120000)throw Error("large");
    data=await req.json();
  }catch{return reply(400,{error:"bad_request",message:"Entrada inválida ou muito extensa."});}
  const mode=data?.mode;
  const tarefa=typeof data?.tarefa==="string"?data.tarefa.trim():"";
  const requisito=typeof data?.requisito==="string"?data.requisito.trim():"";
  if(!mode||!["post","teste"].includes(mode)||!tarefa||tarefa.length>30000||requisito.length>20000)
    return reply(400,{error:"bad_input",message:"Informe uma tarefa válida e, se necessário, um requisito."});
  const batch=data?.batch===undefined?null:parseGeneratorBatch(data.batch,mode);
  if(data?.batch!==undefined&&!batch)
    return reply(400,{error:"bad_input",message:"Lote de geração inválido: etapa, versão ou continuidade incorreta."});
  if(batch&&!aiFeatureEnabled("generator-batch",identity.user.id))
    return reply(503,disabledAiResponse());
  const key=Deno.env.get("NVIDIA_API_KEY");
  if(!key)return reply(503,{error:"missing_key",message:"A chave NVIDIA ainda não está configurada no Supabase."});
  // Discover currently advertised models through NVIDIA and intersect
  // with audited Free Endpoint chat models. Neither a fixed model choice nor
  // arbitrary /v1/models IDs are used (the API has no free-tier flag).
  const catalog=await edgeModels({apiKey:key,trace,
    ...(mode==="teste"?{modelIds:VERIFIED_FREE_CHAT_MODELS}:{})});
  const models=generatorModelOrder(mode,catalog);
  if(!models.length)return reply(503,{error:"models_unavailable",
    message:"Nenhum modelo gratuito da NVIDIA está disponível neste momento."});
  const baseMessages=messagesForGenerator(mode as "post"|"teste",tarefa,requisito);
  const messages=batch?messagesForGeneratorBatch(mode as "post"|"teste",
    tarefa,requisito,batch,baseMessages):baseMessages;
  const maxTokens=batch?(mode==="teste"?3200:batch.stage==="details"?3500:2300):
    mode==="teste"?11000:3500;
  // The shared SSE bridge holds the HTTP status until the first upstream
  // content token. Thus F2 quota/provider 429 remains an HTTP 429 and each
  // actual NVIDIA attempt counts in the shared 15/min DB RPC.
  const result=await edgeStreamingModels({
    apiKey:key,db,trace,mode,modelMode:mode,messages,models,maxTokens,
    options:{temperature:0.15},signal:req.signal,
    timeoutMs:65000,deadlineMs:90000
  });
  if(!result.ok){
    const mapped=edgeErrorHttp(result.error,{
      quotaMessage:"Limite de 15 solicitações por minuto atingido. A geração permanece preservada.",
      providerMessage:"A NVIDIA limitou as requisições; o contexto foi preservado.",
      authMessage:"A chave NVIDIA precisa ser revisada no Supabase."
    });
    if(mapped)return reply(mapped.status,mapped.body,mapped.headers as Record<string,string>);
    if(result.error?.kind==="context_exceeded")
      return reply(400,{error:"model_context_exceeded",
        message:"O contexto supera o orçamento de tokens do modelo. Revise a seleção."});
    return reply(503,{error:"provider_unavailable",
      message:"Nenhum modelo gratuito respondeu. O texto anterior foi preservado."});
  }
  return new Response(result.body,{status:200,headers:{
    ...headers(origin),"Content-Type":"text/event-stream; charset=utf-8",
    "X-Accel-Buffering":"no","Connection":"keep-alive",
    "Access-Control-Expose-Headers":"Retry-After, X-Request-ID","X-Request-ID":trace
  }});
});
