import test from "node:test";
import assert from "node:assert/strict";
import {MODEL_IDS,MODEL_REGISTRY,modelRequestOptions,discoverModels,
 clearModelDiscoveryCache} from "../supabase/functions/_shared/llm/models.mjs";
import {ProviderError,retryAfterSeconds,classifyStatus} from "../supabase/functions/_shared/llm/errors.mjs";
import {callModel,modelBreakerState,resetModelBreakers} from "../supabase/functions/_shared/llm/call-model.mjs";

const model=MODEL_IDS[0];
const messages=[{role:"system",content:"Answer with JSON"},{role:"user",content:"synthetic test"}];
const payload=(content='{"descricao":"Regra documentada"}',finish_reason="stop")=>({
 choices:[{message:{content},finish_reason}],usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}
});
const valid=()=>new Response(JSON.stringify(payload()),{status:200,
 headers:{"Content-Type":"application/json"}});
const fetchFrom=fn=>async(_url,init)=>fn(init);
const mockOpts=(changes={})=>({apiKey:"SYNTHETIC_TEST_ONLY",model,messages,stream:false,
 maxRetries:0,fetchImpl:fetchFrom(()=>valid()),...changes});
const sse=events=>new Response(new ReadableStream({
 start(controller){
  const bytes=new TextEncoder();
  for(const event of events)controller.enqueue(bytes.encode(event));
  controller.close();
 }
}),{status:200,headers:{"Content-Type":"text/event-stream"}});
const event=(obj)=>"data: "+JSON.stringify(obj)+"\n\n";

test("model catalogue preserves priority, declarative reasoning and JSON modes",()=>{
 assert.equal(MODEL_IDS.length,2);
 assert.equal(MODEL_REGISTRY[model].reasoning,"always");
 assert.equal(MODEL_REGISTRY[MODEL_IDS[1]].reasoning,"off");
 assert.equal(modelRequestOptions(model,"task").response_format.type,"json_object");
 assert.equal(modelRequestOptions(model,"task").reasoning_effort,"low");
 assert.equal(modelRequestOptions(MODEL_IDS[1],"task").chat_template_kwargs.enable_thinking,false);
 assert.equal(modelRequestOptions(model,"diagram").response_format,undefined);
 assert.equal(modelRequestOptions(model,"summary").response_format,undefined);
 assert.equal(modelRequestOptions(model,"task").max_tokens,8192);
 assert.equal(MODEL_REGISTRY[model].contextTokens,null); // F3, not guessed
});
test("discovery uses one GET for cached and concurrent requests",async()=>{
 clearModelDiscoveryCache();let calls=0;
 const fetchImpl=async()=>{calls++;return new Response(JSON.stringify({
  data:[{id:model},{id:"unlisted-model"}]}),{status:200});};
 const args={apiKey:"synthetic",fetchImpl};
 const results=await Promise.all([discoverModels(args),discoverModels(args),discoverModels(args)]);
 assert.deepEqual(results,[[model],[model],[model]]);
 assert.equal(calls,1);
 assert.deepEqual(await discoverModels(args),[model]);
 assert.equal(calls,1);
 clearModelDiscoveryCache();
});
test("failed model discovery falls back safely without caching an error",async()=>{
 clearModelDiscoveryCache();let calls=0;
 const models=await discoverModels({apiKey:"synthetic",fetchImpl:async()=>{
  calls++;return new Response("error",{status:503});
 }});
 assert.deepEqual(models,MODEL_IDS);
 await discoverModels({apiKey:"synthetic",fetchImpl:async()=>{
  calls++;return new Response("error",{status:503});
 }});
 assert.equal(calls,2);
 clearModelDiscoveryCache();
});
test("one valid JSON completion reserves exactly one slot, emits safe telemetry",async()=>{
 resetModelBreakers();let slots=0,body,attempts=[];
 const result=await callModel(mockOpts({
  reserveAttempt:async()=>{slots++;return {allowed:true};},
  onAttempt:x=>attempts.push(x),
  fetchImpl:async(_url,init)=>{body=JSON.parse(init.body);return valid();}
 }));
 assert.equal(slots,1);
 assert.equal(result.finishReason,"stop");
 assert.equal(result.usage.total_tokens,14);
 assert.equal(result.model,model);
 assert.equal(result.text,'{"descricao":"Regra documentada"}');
 assert.equal(body.stream,false);
 assert.equal(body.response_format.type,"json_object");
 assert.equal(attempts.length,1);
 assert.equal(attempts[0].outcome,"ok");
 assert.equal(JSON.stringify(attempts).includes("synthetic test"),false);
});
test("retry on 503 consumes one quota slot for each actual request",async()=>{
 resetModelBreakers();let slots=0,calls=0,attempts=[];
 const result=await callModel(mockOpts({
  maxRetries:1,sleep:async()=>{},random:()=>0,
  reserveAttempt:async()=>{slots++;return {allowed:true};},
  onAttempt:x=>attempts.push(x),
  fetchImpl:fetchFrom(()=>++calls===1?new Response("provider down",{status:503}):valid())
 }));
 assert.equal(result.finishReason,"stop");
 assert.equal(calls,2);assert.equal(slots,2);
 assert.deepEqual(attempts.map(x=>x.outcome),["upstream_5xx","ok"]);
});
test("429 Retry-After is respected when explicit retry is enabled",async()=>{
 resetModelBreakers();let waits=[],calls=0;
 const response=()=>new Response("rate limit",{status:429,headers:{"Retry-After":"2"}});
 const result=await callModel(mockOpts({
  maxRetries:1,retryOnRateLimit:true,deadlineAt:Date.now()+10000,
  sleep:async ms=>{waits.push(ms);},
  fetchImpl:fetchFrom(()=>++calls===1?response():valid()),
  reserveAttempt:async()=>({allowed:true})
 }));
 assert.equal(result.text,'{"descricao":"Regra documentada"}');
 assert.deepEqual(waits,[2000]);assert.equal(calls,2);
 assert.equal(retryAfterSeconds("4"),4);
 assert.equal(classifyStatus(429).kind,"rate_limited");
});
test("quota denial stops before fetch and no bypass occurs",async()=>{
 resetModelBreakers();let calls=0,denied=0;
 await assert.rejects(callModel(mockOpts({
  reserveAttempt:async()=>({allowed:false,kind:"rate_limited",retryAfterSeconds:42}),
  fetchImpl:fetchFrom(()=>{calls++;return valid();}),
  onQuotaDenied:()=>denied++
 })),e=>e instanceof ProviderError&&e.kind==="rate_limited"&&
  e.stage==="quota"&&e.retryAfterSeconds===42);
 assert.equal(calls,0);assert.equal(denied,1);
});
test("expired global deadline stops before quota and network",async()=>{
 resetModelBreakers();let slots=0,calls=0;
 await assert.rejects(callModel(mockOpts({
  deadlineAt:Date.now()-1,
  reserveAttempt:async()=>{slots++;return {allowed:true};},
  fetchImpl:fetchFrom(()=>{calls++;return valid();})
 })),e=>e.kind==="timeout");
 assert.equal(slots,0);assert.equal(calls,0);
});
test("auth and context errors do not retry, partial JSON length is not success",async()=>{
 resetModelBreakers();let calls=0;
 await assert.rejects(callModel(mockOpts({maxRetries:2,
  fetchImpl:fetchFrom(()=>{calls++;return new Response("bad key",{status:401});})
 })),e=>e.kind==="auth");
 assert.equal(calls,1);
 await assert.rejects(callModel(mockOpts({maxRetries:2,
  fetchImpl:fetchFrom(()=>new Response("maximum tokens context limit",{status:400}))
 })),e=>e.kind==="context_exceeded");
 await assert.rejects(callModel(mockOpts({fetchImpl:fetchFrom(()=>
  new Response(JSON.stringify(payload('{"descricao":"parcial"}',"length")),{status:200}))
 })),e=>e.kind==="length"&&e.partial?.includes("parcial"));
 const compatible=await callModel(mockOpts({rejectLength:false,
  fetchImpl:fetchFrom(()=>new Response(JSON.stringify(payload('{"descricao":"parcial"}',"length")),{status:200}))
 }));
 assert.equal(compatible.finishReason,"length");
});
test("circuit breaker skips a failed model before charging quota",async()=>{
 resetModelBreakers();let slots=0,calls=0,skips=0;
 const config=mockOpts({
  reserveAttempt:async()=>{slots++;return {allowed:true};},
  fetchImpl:fetchFrom(()=>{calls++;return new Response("offline",{status:503});}),
  onBreakerSkip:()=>skips++
 });
 for(let i=0;i<3;i++)await assert.rejects(callModel(config),e=>e.kind==="upstream");
 assert.equal(modelBreakerState(model).open,true);
 await assert.rejects(callModel(config),e=>e.kind==="breaker_open");
 assert.equal(calls,3);assert.equal(slots,3);assert.equal(skips,1);
 resetModelBreakers();
});
test("model fallback is independent and a second model may succeed",async()=>{
 resetModelBreakers();const tried=[];
 for(const id of MODEL_IDS){
  try{
   const result=await callModel(mockOpts({model:id,
    reserveAttempt:async()=>({allowed:true}),
    fetchImpl:fetchFrom(()=>{tried.push(id);return id===MODEL_IDS[0]?
     new Response("not available",{status:503}):valid();})
   }));
   assert.equal(result.model,MODEL_IDS[1]);break;
  }catch(error){assert.equal(error.kind,"upstream");}
 }
 assert.deepEqual(tried,MODEL_IDS);
});
test("streaming is default, concatenates split SSE chunks, sends deltas and usage",async()=>{
 resetModelBreakers();const chunks=[],attempts=[];
 const output=sse([
  event({choices:[{delta:{content:"ola "},finish_reason:null}]}).slice(0,16),
  event({choices:[{delta:{content:"ola "},finish_reason:null}]}).slice(16),
  event({choices:[{delta:{content:"mundo"},finish_reason:"stop"}]},
   usage:{prompt_tokens:12,completion_tokens:2}}),
  "data: [DONE]\n\n"
 ]);
 const result=await callModel({
  apiKey:"synthetic",model,messages,fetchImpl:fetchFrom(()=>output),
  reserveAttempt:async()=>({allowed:true}),
  onDelta:text=>chunks.push(text),onAttempt:a=>attempts.push(a),maxRetries:0
 });
 assert.equal(result.text,"ola mundo");
 assert.deepEqual(chunks,["ola ","mundo"]);
 assert.equal(result.finishReason,"stop");
 assert.equal(result.usage.prompt_tokens,12);
 assert.equal(attempts[0].outcome,"ok");
});
test("interrupted SSE without finish or DONE is not a false success",async()=>{
 resetModelBreakers();
 await assert.rejects(callModel({apiKey:"synthetic",model,messages,
  stream:true,maxRetries:0,fetchImpl:fetchFrom(()=>
   sse([event({choices:[{delta:{content:"partial"},finish_reason:null}]})]))
 }),e=>e.kind==="upstream"&&e.partial==="partial");
});
test("pre-aborted request performs no outbound call",async()=>{
 resetModelBreakers();const ctrl=new AbortController();ctrl.abort();let calls=0;
 await assert.rejects(callModel(mockOpts({
  signal:ctrl.signal,fetchImpl:fetchFrom(()=>{calls++;return valid();})
 })),e=>e.kind==="aborted");
 assert.equal(calls,0);
});
