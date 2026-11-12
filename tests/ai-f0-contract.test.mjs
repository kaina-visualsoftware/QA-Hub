import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root=new URL("../",import.meta.url);
const file=path=>readFileSync(new URL(path,root),"utf8");
const functions=["qa-ai","qa-generators","qa-context","qa-revisions"];

const providerPath="supabase/functions/_shared/llm/edge-runtime.mjs";
test("all four NVIDIA endpoints retain metadata-only attempt telemetry",()=>{
 const runtime=file(providerPath);
 for(const name of functions){
  const src=file("supabase/functions/"+name+"/index.ts");
  assert.match(src,/from "\.\.\/_shared\/ai-observability\.mjs"/,name);
  assert.match(src,/correlationId\(req\.headers\.get\("x-correlation-id"\)\)/,name);
  if(name==="qa-ai"){
   assert.match(src,/callModel\(/);
   assert.match(src,/logAiAttempt\(/);
  }else{
   assert.match(src,/edgeModels\(/,name);
   assert.match(src,/from "\.\.\/_shared\/llm\/edge-runtime\.mjs"/,name);
  }
 }
 assert.match(runtime,/logAiAttempt\(/);
 assert.match(runtime,/stage:"discovery"/);
 assert.match(runtime,/stage:"quota"/);
 assert.match(runtime,/fallback_model:/);
 assert.match(runtime,/qa_ai_claim_minute_request/);
 assert.match(runtime,/promptChars\(messages\)/);
 assert.match(file("supabase/functions/_shared/llm/call-model.mjs"),/finally\s*\{/);
});
test("SSE and JSON models share timeout, streaming outcomes and redacted telemetry",()=>{
 const ai=file("supabase/functions/qa-ai/index.ts");
 const runtime=file(providerPath);
 const model=file("supabase/functions/_shared/llm/call-model.mjs");
 assert.match(ai,/callModel\(/);
 assert.match(runtime,/edgeStreamingModels\(/);
 assert.match(runtime,/edgeJsonModels\(/);
 assert.match(runtime,/send\("done"/);
 assert.match(runtime,/send\("error"/);
 assert.match(runtime,/truncated:result\.finishReason==="length"/);
 assert.match(runtime,/onQuotaDenied:/);
 assert.match(model,/timeoutMs=/);
 assert.match(model,/finish_reason:result\?\.finishReason/);
});
test("all four endpoints preserve their own auth and CORS; quota is centralized",()=>{
 const runtime=file(providerPath);
 for(const name of functions){
  const src=file("supabase/functions/"+name+"/index.ts");
  assert.match(src,/\.auth\.getUser\(/,name);
  assert.match(src,/is_anonymous/,name);
  assert.match(src,/https:\/\/kaina-visualsoftware\.github\.io/,name);
  assert.doesNotMatch(src,/console\.(?:log|info|warn)\([^)]*(?:sourceText|reportText|Authorization|NVIDIA_API_KEY)/,name);
 }
 assert.match(runtime,/qa_ai_claim_minute_request/);
 assert.match(file("supabase/functions/_shared/llm/models.mjs"),/integrate\.api\.nvidia\.com\/v1/);
});
const names=["curta","media","longa-80k","apenas-requisito","apenas-roteiro",
 "rotulos-interface","instrucao-maliciosa","tabelas-sql"];
test("F0 fixtures cover all eight synthetic categories and a large full-text source",()=>{
 const docs=names.map(name=>file("frontend/tests/fixtures/ia/"+name+".md"));
 assert.equal(docs.length,8);
 assert.ok(docs[0].includes("Problema"));
 assert.ok(docs[1].includes("Cenário 35"));
 assert.ok(docs[2].length>=80000,"long source must have at least 80,000 chars");
 assert.ok(docs[2].includes("RF-808"));
 assert.ok(docs[2].includes("RF-809"));
 assert.ok(docs[2].includes("Cenário final"));
 assert.ok(docs[3].includes("RF-24"));
 assert.ok(docs[4].includes("Resultado esperado"));
 assert.ok(docs[5].includes("Google Drive"));
 assert.ok(docs[6].includes("IGNORAR O SISTEMA"));
 assert.ok(docs[7].includes("SELECT"));
 for(const doc of docs)assert.ok(!doc.includes("-----BEGIN PRIVATE KEY-----"));
});
test("document distinguishes verified behavior from production hypotheses",()=>{
 const report=file("docs/DIAGNOSTICO_PIPELINE_IA.md");
 for(const topic of ["Hipóteses a confirmar","Timeout","Cota por fallback",
  "Tokens vs. caracteres","Privacidade","Rollback"])
   assert.ok(report.toLowerCase().includes(topic.toLowerCase()),topic);
});
