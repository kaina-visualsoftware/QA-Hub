import {createClient} from "npm:@supabase/supabase-js@2.119.0";
import {messagesForGenerator} from "./prompts.mjs";

// Only explicit free-endpoint NVIDIA Build models, not paid endpoints.
const MODELS=["z-ai/glm-5.3-flash","nvidia/nemotron-3.5-lightning-30b-a3b"];
const BASE="https://integrate.api.nvidia.com/v1";
const ORIGINS=new Set(["https://kaina-visualsoftware.github.io","http://127.0.0.1:8765","http://localhost:8765"]);
function headers(origin){
  return {"Access-Control-Allow-Origin":origin&&ORIGINS.has(origin)?origin:"https://kaina-visualsoftware.github.io",
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store","Vary":"Origin"};
}
function json(origin,status,body,extraHeaders={}){
  return new Response(JSON.stringify(body),{status,headers:{...headers(origin),"Content-Type":"application/json; charset=utf-8",...extraHeaders}});
}
async function allowedModels(key){
  try{
    const r=await fetch(BASE+"/models",{headers:{Authorization:"Bearer "+key},signal:AbortSignal.timeout(6500)});
    if(!r.ok)return MODELS;
    const d=await r.json();
    if(!Array.isArray(d.data))return MODELS;
    const found=new Set(d.data.map(x=>x.id));
    return MODELS.filter(m=>found.has(m));
  }catch{return MODELS;}
}
function readDelta(part){
  const msg=part?.choices?.[0]?.delta;
  if(typeof msg?.content==="string")return msg.content;
  if(Array.isArray(msg?.content))return msg.content.map(p=>p.text||"").join("");
  return "";
}
const sse=(event,body)=>"event: "+event+"\ndata: "+JSON.stringify(body)+"\n\n";
function sendStream(upstream,origin,model){
  const decoder=new TextDecoder();
  const encoder=new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller){
      const send=(e,d)=>controller.enqueue(encoder.encode(sse(e,d)));
      let content="",raw="",finishReason=null,stopped=false;
      const reader=upstream.body.getReader();
      function processEvent(eventText){
        const data=eventText.split(/\r?\n/).filter(l=>l.startsWith("data:")).map(l=>l.slice(5).trimStart()).join("\n");
        if(!data)return;
        if(data==="[DONE]"){stopped=true;return;}
        try{
          const parsed=JSON.parse(data);
          if(parsed.error){send("error",{message:"O modelo interrompeu a geração."});return;}
          const delta=readDelta(parsed);
          if(delta){
            content+=delta;
            if(content.length>115000){stopped=true;send("error",{message:"O resultado excedeu o limite permitido."});return;}
            send("chunk",{text:delta});
          }
          finishReason=parsed?.choices?.[0]?.finish_reason||finishReason;
        }catch{/* Malformed partial upstream events never become code. */}
      }
      try{
        while(!stopped){
          const {value,done}=await reader.read();
          if(done)break;
          raw+=decoder.decode(value,{stream:true});
          if(raw.length>175000)throw Error("stream_overflow");
          let pos;
          while((pos=raw.search(/\r?\n\r?\n/))>=0){
            const event=raw.slice(0,pos);
            const separator=raw.slice(pos).match(/^\r?\n\r?\n/)[0];
            raw=raw.slice(pos+separator.length);
            processEvent(event);
            if(stopped)break;
          }
        }
        if(raw.trim()&&!stopped)processEvent(raw);
        if(!content.trim())send("error",{message:"O modelo não retornou texto utilizável. Tente novamente."});
        else send("done",{model,truncated:finishReason==="length",characters:content.length});
      }catch(error){
        console.warn("qa-generators stream failure",{model,reason:error instanceof DOMException?error.name:"read_failed"});
        send("error",{message:"A conexão com a NVIDIA foi interrompida. O texto parcial pode ser recuperado."});
      }finally{
        try{await reader.cancel();}catch{}
        controller.close();
      }
    }
  }),{status:200,headers:{...headers(origin),"Content-Type":"text/event-stream; charset=utf-8",
    "X-Accel-Buffering":"no","Connection":"keep-alive"}});
}
Deno.serve(async req=>{
  const origin=req.headers.get("Origin");
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=="POST")return json(origin,405,{error:"method_not_allowed",message:"Método não permitido."});
  if(origin&&!ORIGINS.has(origin))return json(origin,403,{error:"forbidden",message:"Origem não autorizada."});
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))return json(origin,401,{error:"unauthorized",message:"Entre no QA Hub para gerar com IA."});
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!url||!anon)return json(origin,503,{error:"auth_not_configured",message:"Autenticação não configurada."});
  const db=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:identity,error:authError}=await db.auth.getUser(auth.slice(7));
  if(authError||!identity.user||identity.user.is_anonymous)
    return json(origin,401,{error:"unauthorized",message:"Faça login novamente para gerar com IA."});
  let data;
  try{
    if(Number(req.headers.get("Content-Length")||0)>120000)throw Error("large");
    data=await req.json();
  }catch{return json(origin,400,{error:"bad_request",message:"Entrada inválida ou muito extensa."});}
  const mode=data?.mode;
  const tarefa=typeof data?.tarefa==="string"?data.tarefa.trim():"";
  const requisito=typeof data?.requisito==="string"?data.requisito.trim():"";
  if(!["post","teste"].includes(mode)||!tarefa||tarefa.length>30000||requisito.length>20000)
    return json(origin,400,{error:"bad_input",message:"Informe uma tarefa válida e, se necessário, um requisito."});
  const key=Deno.env.get("NVIDIA_API_KEY");
  if(!key)return json(origin,503,{error:"missing_key",message:"A chave NVIDIA ainda não está configurada no Supabase."});
  const models=await allowedModels(key);
  if(!models.length)return json(origin,503,{error:"models_unavailable",message:"Nenhum modelo gratuito da NVIDIA está disponível neste momento."});
  const messages=messagesForGenerator(mode,tarefa,requisito);
  for(const model of models){
    // Count EVERY upstream attempt, including model fallback, against the
    // same 15/minute rolling window as qa-ai. No daily limit applies.
    const claim=await db.rpc("qa_ai_claim_minute_request");
    if(claim.error||!claim.data||typeof claim.data!=="object")
      return json(origin,503,{error:"quota_unavailable",message:"Não foi possível verificar o limite por minuto."});
    if(!claim.data.allowed){
      const retry=Math.max(1,Math.min(60,Math.ceil(Number(claim.data.retry_after_seconds)||60)));
      return json(origin,429,{
        error:"rate_limited",retry_after_seconds:retry,
        message:"Limite de 15 solicitações por minuto atingido. Tente novamente em "+retry+" segundo(s)."
      },{"Retry-After":String(retry)});
    }
    try{
      const r=await fetch(BASE+"/chat/completions",{
        method:"POST",
        headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json","Accept":"text/event-stream"},
        body:JSON.stringify({model,messages,stream:true,temperature:0.15,max_tokens:mode==="teste"?11000:3500,
          ...(model.startsWith("nvidia/nemotron-")?{chat_template_kwargs:{enable_thinking:false}}:{})}),
        signal:AbortSignal.timeout(110000)
      });
      if(r.status===401||r.status===403)return json(origin,503,{error:"invalid_key",message:"A chave NVIDIA precisa ser revisada no Supabase."});
      if(r.status===429)return json(origin,429,{error:"rate_limit",message:"A NVIDIA limitou as requisições. Tente novamente mais tarde."});
      if(!r.ok||!r.body){console.warn("qa-generators provider",{model,status:r.status});continue;}
      return sendStream(r,origin,model);
    }catch(e){console.warn("qa-generators request",{model,type:e instanceof DOMException?e.name:"upstream_unavailable"});}
  }
  return json(origin,503,{error:"provider_unavailable",message:"Nenhum modelo gratuito respondeu. Tente mais tarde."});
});
