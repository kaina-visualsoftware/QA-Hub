import test from "node:test";
import assert from "node:assert/strict";
import {callModel} from "../supabase/functions/_shared/llm/call-model.mjs";
import {MODEL_IDS} from "../supabase/functions/_shared/llm/models.mjs";
import {makeAttemptEvent} from "../supabase/functions/_shared/ai-observability.mjs";
import {planTokenBudget} from "../supabase/functions/_shared/llm/token-budget.mjs";
import {readFileSync} from "node:fs";

const model=MODEL_IDS[0];
test("oversized prompts are stopped before quota reservation or NVIDIA fetch",async()=>{
 let quota=0,network=0;
 const messages=[{role:"user",content:"🧪".repeat(140000)}];
 await assert.rejects(callModel({
  apiKey:"TEST_DUMMY",model,messages,mode:"semantic",maxRetries:2,
  reserveAttempt:async()=>{quota++;return {allowed:true};},
  fetchImpl:async()=>{network++;return new Response("{}");}
 }),e=>e.kind==="context_exceeded");
 assert.equal(quota,0);
 assert.equal(network,0);
});
test("valid prompts leave the shared 15/min quota behavior unchanged",async()=>{
 let quota=0,network=0;
 const captured=[];
 const messages=[{role:"system",content:"Documente."},{role:"user",content:"RF-11: validar vendas."}];
 const result=await callModel({
  apiKey:"TEST_DUMMY",model,messages,stream:false,maxRetries:0,
  reserveAttempt:async()=>{quota++;return {allowed:true};},
  fetchImpl:async()=>{network++;return new Response(JSON.stringify({
   choices:[{message:{content:'{"descricao":"Validação da venda"}'},finish_reason:"stop"}],
   usage:{prompt_tokens:27,completion_tokens:10}
  }),{status:200})},
  onAttempt:event=>captured.push(event)
 });
 assert.equal(result.model,model);
 assert.equal(quota,1);
 assert.equal(network,1);
 assert.ok(captured[0].estimated_prompt_tokens>0);
 assert.ok(!JSON.stringify(captured).includes("RF-11"));
 const log=makeAttemptEvent({mode:"task",model,correlation_id:crypto.randomUUID(),
  prompt_chars:20,estimated_prompt_tokens:captured[0].estimated_prompt_tokens,
  outcome:"ok",http_status:200});
 assert.equal(log.prompt_tokens_est,captured[0].estimated_prompt_tokens);
});
test("test a source that contains accented Portuguese, SQL and long requirements",()=>{
 const messages=[{role:"system",content:"Não invente correções."},{role:"user",
  content:"RF-442: Exceção na emissão. SELECT * FROM nfes; ".repeat(2000)}];
 const plan=planTokenBudget({messages,model,mode:"teste",maxOutputTokens:11000});
 assert.equal(plan.exact,false);
 assert.equal(plan.fits,true);
 assert.ok(plan.estimatedInputTokens>30000);
});
test("F3 contracts keep front-end review before generating and do not claim exact tokens",()=>{
 const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const f=file("frontend/src/features/generators/context-preparation.ts");
 const panel=file("frontend/src/features/generators/ContextPreparationPanel.tsx");
 const budget=file("supabase/functions/_shared/llm/token-budget.mjs");
 assert.match(f,/fitsContextBudget\(original,limit,tokenLimit\)/);
 assert.match(f,/sentEstimatedTokens:/);
 assert.match(panel,/TOKEN_ESTIMATE_NOTICE/);
 assert.match(budget,/exact:false/);
 assert.match(budget,/APP_CONTEXT_BUDGETS/);
});
