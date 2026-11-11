import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root=new URL("../",import.meta.url);
const file=path=>readFileSync(new URL(path,root),"utf8");
const functions=["qa-ai","qa-generators","qa-context","qa-revisions"];

test("all four NVIDIA endpoints record catalog, quota and each provider attempt",()=>{
 for(const name of functions){
  const source=file("supabase/functions/"+name+"/index.ts");
  assert.match(source,/from "\.\.\/_shared\/ai-observability\.mjs"/,name);
  assert.match(source,/correlationId\(req\.headers\.get\("x-correlation-id"\)\)/,name);
  assert.match(source,/logAiAttempt\(/,name);
  assert.match(source,/stage:"discovery"/,name);
  assert.match(source,/stage:"quota"/,name);
  assert.match(source,/fallback_model:/,name);
  assert.match(source,/qa_ai_claim_minute_request/,name);
  if(name==="qa-ai"){
   assert.match(source,/callModel\(/,name);
   assert.match(file("supabase/functions/_shared/llm/call-model.mjs"),/finally\s*\{/,name);
  }else assert.match(source,/finally\s*\{/,name);
  assert.match(source,/promptChars\(messages\)/,name);
 }
});
test("SSE and non-streaming requests instrument their completion and timeout paths",()=>{
 const ai=file("supabase/functions/qa-ai/index.ts");
 const g=file("supabase/functions/qa-generators/index.ts");
 const c=file("supabase/functions/qa-context/index.ts");
 const r=file("supabase/functions/qa-revisions/index.ts");
 assert.match(ai,/callModel\(/);
 assert.match(ai,/onAttempt:event=>logAiAttempt/);
 assert.match(ai,/onQuotaDenied:info=>logAiAttempt/);
 assert.match(ai,/rejectLength:false/);
 assert.match(g,/finish_reason:finishReason,usage,outcome/);
 assert.match(g,/outcome=finishReason==="length"\?"length":"ok"/);
 assert.match(g,/if\(!handedOff\)logAiAttempt/);
 assert.match(c,/finishReason=payload\?\.choices\?\.\[0\]\?\.finish_reason/);
 assert.match(r,/finishReason=payload\?\.choices\?\.\[0\]\?\.finish_reason/);
});
test("security boundaries and the shared 15/minute quota remain in place",()=>{
 for(const name of functions){
  const source=file("supabase/functions/"+name+"/index.ts");
  assert.match(source,/\.auth\.getUser\(/,name);
  assert.match(source,/is_anonymous/,name);
  assert.match(source,/qa_ai_claim_minute_request/,name);
  assert.match(source,/integrate\.api\.nvidia\.com\/v1/,name);
  assert.match(source,/https:\/\/kaina-visualsoftware\.github\.io/,name);
  assert.doesNotMatch(source,/console\.(?:log|info|warn)\([^)]*(?:sourceText|reportText|Authorization|NVIDIA_API_KEY)/,name);
 }
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
