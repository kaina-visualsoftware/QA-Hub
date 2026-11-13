import test from "node:test";
import assert from "node:assert/strict";
import {edgeJsonModels,edgeStreamingModels,edgeErrorHttp,edgeHooks}
 from "../supabase/functions/_shared/llm/edge-runtime.mjs";
import {MODEL_IDS,MODEL_REGISTRY,discoverModels,clearModelDiscoveryCache}
 from "../supabase/functions/_shared/llm/models.mjs";
import {resetModelBreakers} from "../supabase/functions/_shared/llm/call-model.mjs";
import {generatorModelOrder,resetGeneratorModelRotation,VERIFIED_FREE_CHAT_MODELS}
 from "../supabase/functions/qa-generators/model-order.mjs";
const messages=[{role:"system",content:"Resumo técnico em português."},
 {role:"user",content:"RF-12: não duplicar descontos."}];
const db=(items=[{allowed:true}])=>{
 let n=0;
 return {rpc:async name=>{
  assert.equal(name,"qa_ai_claim_minute_request");
  const row=items[Math.min(n++,items.length-1)];
  return {data:row,error:null};
 },count:()=>n};
};
const payload=(text,reason="stop")=>JSON.stringify({
 choices:[{message:{content:text},finish_reason:reason}],
 usage:{prompt_tokens:17,completion_tokens:10}
});
const base=(dbClient,extra={})=>({
 db:dbClient,apiKey:"DUMMY_KEY",trace:"11111111-2222-4333-8444-555555555555",
 mode:"semantic:task",modelMode:"semantic",models:[...MODEL_IDS],
 messages,maxTokens:300,timeoutMs:5000,deadlineMs:15000,...extra
});
const sse=(chunks,reason="stop")=>new Response(new ReadableStream({
 start(controller){
  const encoder=new TextEncoder();
  for(const chunk of chunks)controller.enqueue(encoder.encode(
   "data: "+JSON.stringify({choices:[{delta:{content:chunk}}]})+"\n\n"));
  controller.enqueue(encoder.encode("data: "+JSON.stringify({
   choices:[{delta:{},finish_reason:reason}]})+"\n\n"));
  controller.enqueue(encoder.encode("data: [DONE]\n\n"));controller.close();
 }
}),{status:200,headers:{"Content-Type":"text/event-stream"}});
test("F7 JSON calls validate output and use second model without exceeding per-attempt quota",async()=>{
 resetModelBreakers();
 let fetches=0;
 const quota=db([{allowed:true},{allowed:true}]);
 const result=await edgeJsonModels(base(quota,{
  fetchImpl:async(_url,request)=>{
   fetches++;
   const body=JSON.parse(request.body);
   assert.equal(body.stream,false);
   assert.ok(MODEL_IDS.includes(body.model));
   return fetches===1?new Response("unavailable",{status:503}):
    new Response(payload('{"facts":[{"category":"regra"}]}'),{status:200});
  },
  validate:response=>{
   if(response?.choices?.[0]?.finish_reason==="length")return null;
   return JSON.parse(response.choices[0].message.content).facts;
  }
 }));
 assert.equal(result.ok,true);
 assert.equal(result.model,MODEL_IDS[1]);
 assert.equal(fetches,2);assert.equal(quota.count(),2);
});
test("F7 no provider attempt when shared quota is exhausted; HTTP 429 has Retry-After",async()=>{
 resetModelBreakers();
 let calls=0;
 const quota=db([{allowed:false,error:"rate_limited",retry_after_seconds:19}]);
 const result=await edgeJsonModels(base(quota,{
  fetchImpl:async()=>{calls++;throw Error("Must not run");},
  validate:()=>null
 }));
 assert.equal(result.ok,false);assert.equal(calls,0);
 assert.equal(quota.count(),1);
 const mapped=edgeErrorHttp(result.error);
 assert.equal(mapped.status,429);
 assert.equal(mapped.body.retry_after_seconds,19);
 assert.equal(mapped.headers["Retry-After"],"19");
});
test("F7 provider 429 is distinct from local quota and retains retry hints",async()=>{
 resetModelBreakers();
 const quota=db();
 const result=await edgeJsonModels(base(quota,{
  fetchImpl:async()=>new Response(JSON.stringify({error:"too many"}),{
   status:429,headers:{"Retry-After":"8"}
  }),validate:()=>null
 }));
 const mapped=edgeErrorHttp(result.error);
 assert.equal(mapped.status,429);
 assert.equal(mapped.body.error,"provider_rate_limited");
 assert.equal(mapped.headers["Retry-After"],"8");
 assert.equal(quota.count(),1);
});
test("F7 SSE uses shared model, delivers real-time chunks and done event",async()=>{
 resetModelBreakers();
 const quota=db();
 let fetches=0;
 const result=await edgeStreamingModels(base(quota,{
  mode:"post",modelMode:"post",maxTokens:600,timeoutMs:5000,
  fetchImpl:async(_url,request)=>{
   fetches++;const options=JSON.parse(request.body);
   assert.equal(options.stream,true);
   assert.equal(options.model,MODEL_IDS[0]);
   return sse(["Primeiro ","cenário"]); }
 }));
 assert.equal(result.ok,true);
 const raw=await new Response(result.body).text();
 assert.match(raw,/event: chunk/);
 assert.match(raw,/Primeiro/);assert.match(raw,/cenário/);
 assert.match(raw,/event: done/);assert.match(raw,/"truncated":false/);
 assert.equal(quota.count(),1);assert.equal(fetches,1);
});
test("F7 SSE provider quota denial occurs before HTTP 200 stream headers",async()=>{
 resetModelBreakers();
 const quota=db([{allowed:false,error:"rate_limited",retry_after_seconds:11}]);
 const result=await edgeStreamingModels(base(quota,{
  mode:"teste",modelMode:"teste",maxTokens:800,
  fetchImpl:async()=>{throw Error("Cannot fetch");}
 }));
 assert.equal(result.ok,false);
 assert.equal(edgeErrorHttp(result.error).status,429);
 assert.equal(quota.count(),1);
});
test("F7 SSE after first delta never switches models; partial error is an SSE error",async()=>{
 resetModelBreakers();
 const quota=db();
 let fetches=0;
 const result=await edgeStreamingModels(base(quota,{
  mode:"post",modelMode:"post",maxTokens:600,
  fetchImpl:async()=>{
   fetches++;
   const text="data: "+JSON.stringify({choices:[{delta:{content:"Trecho parcial que chegou."}}]})+
    "\n\ndata: {INVALID_JSON}\n\n";
   return new Response(text,{status:200,headers:{"Content-Type":"text/event-stream"}});
  }
 }));
 assert.equal(result.ok,true);
 const data=await new Response(result.body).text();
 assert.match(data,/event: chunk/);
 assert.match(data,/event: error/);
 assert.doesNotMatch(data,/event: done/);
 assert.equal(fetches,1);assert.equal(quota.count(),1);
});
test("F7 length finish reason maps to resumable done truncated=true",async()=>{
 resetModelBreakers();
 const result=await edgeStreamingModels(base(db(),{
  mode:"post",modelMode:"post",maxTokens:600,
  fetchImpl:async()=>sse(["Introdução documentada."],"length")
 }));
 assert.equal(result.ok,true);
 const text=await new Response(result.body).text();
 assert.match(text,/"truncated":true/);
 assert.match(text,/event: done/);
});
test("F7 headers and quota callbacks never include raw prompt data",async()=>{
 const x=db();
 const hooks=edgeHooks({db:x,trace:"11111111-2222-4333-8444-555555555555",
  mode:"revision",model:MODEL_IDS[0],modelIndex:0,
  messages,maxTokens:500});
 const claim=await hooks.reserveAttempt();
 assert.deepEqual(claim,{allowed:true});
 assert.equal(x.count(),1);
});

test("F7 model choice is dynamic among verified free chat endpoints",()=>{
 resetGeneratorModelRotation();
 assert.deepEqual(MODEL_IDS,[
  "z-ai/glm-5.3-flash","nvidia/nemotron-3.5-lightning-30b-a3b"
 ],"The default TF/other-flow model list must remain unchanged");
 assert.ok(VERIFIED_FREE_CHAT_MODELS.length>=3);
 assert.ok(VERIFIED_FREE_CHAT_MODELS.every(id=>Object.hasOwn(MODEL_REGISTRY,id)));
 assert.equal(generatorModelOrder("post",[...MODEL_IDS]).join(","),MODEL_IDS.join(","));
 const first=generatorModelOrder("teste",[...VERIFIED_FREE_CHAT_MODELS]);
 const second=generatorModelOrder("teste",[...VERIFIED_FREE_CHAT_MODELS]);
 assert.equal(first[0],"nvidia/nemotron-3.5-lightning-30b-a3b");
 assert.equal(second[0],"openai/gpt-oss-20b");
 assert.deepEqual([...first].sort(),[...VERIFIED_FREE_CHAT_MODELS].sort());
 assert.deepEqual([...second].sort(),[...VERIFIED_FREE_CHAT_MODELS].sort());
 assert.deepEqual(generatorModelOrder("teste",["partner/paid-private-model"]),[]);
 assert.deepEqual(generatorModelOrder("teste",[]),[]);
 assert.deepEqual(generatorModelOrder("teste",["openai/gpt-oss-20b"]),["openai/gpt-oss-20b"]);
});
test("F7 availability and breaker health win over rotation or unavailable endpoints",()=>{
 resetGeneratorModelRotation();
 const discovered=["partner/paid-private-model","z-ai/glm-5.3-flash",
  "nvidia/nemotron-3.5-lightning-30b-a3b","openai/gpt-oss-20b"];
 const ranked=generatorModelOrder("teste",discovered,{
  breakerState:id=>id==="nvidia/nemotron-3.5-lightning-30b-a3b"?
   {open:true,failures:3}:{open:false,failures:0}
 });
 assert.equal(ranked[0],"openai/gpt-oss-20b");
 assert.equal(ranked.at(-1),"nvidia/nemotron-3.5-lightning-30b-a3b");
 assert.ok(!ranked.includes("partner/paid-private-model"));
});
test("F7 catalog discovery accepts only vetted free models, not every model exposed by NVIDIA",async()=>{
 clearModelDiscoveryCache();
 const response=await discoverModels({
  apiKey:"TEST_ONLY",modelIds:VERIFIED_FREE_CHAT_MODELS,
  fetchImpl:async()=>new Response(JSON.stringify({data:[
   {id:"openai/gpt-oss-20b"},
   {id:"partner/paid-private-model"},
   {id:"z-ai/glm-5.3-flash"}
  ]}),{status:200})
 });
 assert.deepEqual(response,["openai/gpt-oss-20b","z-ai/glm-5.3-flash"]);
 clearModelDiscoveryCache();
});
test("F7 case generation recovers HTTP 502 with the next available free model",async()=>{
 resetModelBreakers();
 resetGeneratorModelRotation();
 const quota=db([{allowed:true},{allowed:true}]);
 const order=generatorModelOrder("teste",[...VERIFIED_FREE_CHAT_MODELS]);
 const seen=[];
 const result=await edgeStreamingModels(base(quota,{
  mode:"teste",modelMode:"teste",models:order,maxTokens:600,timeoutMs:5000,
  fetchImpl:async(_url,request)=>{
   const {model,stream}=JSON.parse(request.body);
   assert.equal(stream,true);
   seen.push(model);
   return seen.length===1?
    new Response(JSON.stringify({error:"Bad gateway"}),{status:502}):
    sse(["## Cenário 01 — Validar desconto\\n",
     "### Passos\\n1. Abrir pedido\\n### Resultado esperado\\nDesconto corrigido."]);
  }
 }));
 assert.equal(result.ok,true);
 const text=await new Response(result.body).text();
 assert.deepEqual(seen,order.slice(0,2));
 assert.ok(seen.every(id=>VERIFIED_FREE_CHAT_MODELS.includes(id)));
 assert.equal(quota.count(),2,"Each provider attempt consumes one quota slot");
 assert.match(text,/event: chunk/);
 assert.match(text,/event: done/);
 assert.doesNotMatch(text,/event: error/);
});
