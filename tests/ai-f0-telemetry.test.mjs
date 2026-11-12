import test from "node:test";
import assert from "node:assert/strict";
import {
 correlationId,promptChars,usageMetadata,exceptionOutcome,httpOutcome,
 makeAttemptEvent,logAiAttempt
} from "../supabase/functions/_shared/ai-observability.mjs";

test("correlation IDs are UUIDs, and untrusted header content is ignored",()=>{
 const value="123e4567-e89b-42d3-a456-426614174000";
 assert.equal(correlationId(value.toUpperCase()),value);
 const generated=correlationId("token=SECRET\nAuthorization: Bearer leaked");
 assert.match(generated,/^[0-9a-f-]{36}$/);
 assert.notEqual(generated,value);
});
test("prompt characters include system and user instructions without logging text",()=>{
 const messages=[{role:"system",content:"A".repeat(11)},
  {role:"user",content:[{type:"text",text:"B".repeat(43)}]}];
 assert.equal(promptChars(messages),54);
 const row=makeAttemptEvent({
  correlation_id:"123e4567-e89b-42d3-a456-426614174000",
  mode:"task",model:"z-ai/glm-5.3-flash",
  prompt_chars:promptChars(messages),max_tokens:1500,started_at:100,ended_at:380,
  http_status:200,finish_reason:"stop",usage:{prompt_tokens:19,completion_tokens:3,
    total_tokens:22,completion_tokens_details:{reasoning_tokens:1}},
  outcome:"ok",attempt:1,fallback_model:false
 });
 assert.equal(row.prompt_tokens_est,14);
 assert.equal(row.elapsed_ms,280);
 assert.equal(row.usage.reasoning_tokens,1);
 assert.equal(row.max_tokens,1500);
 assert.equal(row.http_status,200);
 assert.equal(row.fallback_model,false);
 assert.equal(JSON.stringify(row).includes("AAA"),false);
});
test("metadata is strictly allowlisted even if a caller passes secrets and user content",()=>{
 const event=makeAttemptEvent({correlation_id:"API_KEY=secret",mode:"USER REPORT: personal",
  model:"https://malicious.example/?secret=ABCD",
  outcome:"Secret from TF",stage:"arbitrary",finish_reason:"SECRET",
  usage:{prompt_tokens:12,token:"provider-access",completion_tokens:2,
    prompt:"clinical report"},raw_text:"customer-secret",headers:"Authorization: Bearer SECRET",
  started_at:100,ended_at:1e99,http_status:503,attempt:2,fallback_model:true});
 const raw=JSON.stringify(event);
 for(const secret of ["customer-secret","provider-access","Bearer","malicious.example","clinical report","API_KEY","personal"])
  assert.equal(raw.includes(secret),false,secret+" leaked");
 assert.equal(event.mode,"task");
 assert.equal(event.model,"catalog");
 assert.equal(event.outcome,"upstream_error");
 assert.equal(event.finish_reason,"unknown");
 assert.equal(event.stage,"provider");
 assert.equal(event.fallback_model,true);
 assert.equal(event.elapsed_ms,0);
});
test("structured usage and errors have safe classifications",()=>{
 assert.deepEqual(usageMetadata({unexpected:"SECRET"}),null);
 assert.equal(exceptionOutcome({name:"TimeoutError"}),"timeout");
 assert.equal(exceptionOutcome({name:"AbortError"}),"aborted");
 assert.equal(exceptionOutcome({name:"Other"}),"upstream_error");
 assert.equal(httpOutcome(429),"rate_limited");
 assert.equal(httpOutcome(503),"upstream_5xx");
 assert.equal(httpOutcome(401),"http_error");
});
test("logging emits a safe event, not the raw caller object",()=>{
 const previous=console.info;
 let received;
 console.info=(...args)=>{received=args;};
 try{
  const row=logAiAttempt({mode:"teste",model:"nvidia/nemotron-3.5-lightning-30b-a3b",
   prompt_chars:1000,max_tokens:3500,started_at:100,ended_at:200,
   http_status:200,finish_reason:"length",outcome:"length",attempt:2,fallback_model:true,
   input:"BANCO DADOS",token:"TOPSECRET"});
  assert.equal(received[0],"qa_ai_attempt");
  assert.deepEqual(received[1],row);
  assert.equal(JSON.stringify(received).includes("TOPSECRET"),false);
  assert.equal(row.outcome,"length");
 }finally{console.info=previous;}
});
