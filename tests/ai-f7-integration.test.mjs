import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const funcs=["qa-ai","qa-context","qa-revisions","qa-generators"];
test("F7 all four functions call the shared provider without direct NVIDIA fetch",()=>{
 for(const name of funcs){
  const src=read("supabase/functions/"+name+"/index.ts");
  assert.match(src,/\.auth\.getUser\(/,name);
  assert.match(src,/is_anonymous/,name);
  assert.match(src,/errorBody\(/,name);
  assert.match(src,/errorHeaders\(/,name);
  assert.match(src,/Access-Control-Expose-Headers/,name);
  assert.doesNotMatch(src,/fetch\((?:BASE|NVIDIA)\+"\/chat\/completions"/,name);
 }
 assert.match(read("supabase/functions/qa-ai/index.ts"),/callModel\(/);
 for(const name of funcs.filter(x=>x!=="qa-ai"))
  assert.match(read("supabase/functions/"+name+"/index.ts"),/edgeModels\(/);
 assert.match(read("supabase/functions/qa-context/index.ts"),/edgeJsonModels\(/);
 assert.match(read("supabase/functions/qa-revisions/index.ts"),/edgeJsonModels\(/);
 assert.match(read("supabase/functions/qa-generators/index.ts"),/edgeStreamingModels\(/);
});
test("F7 centralizes per-attempt RPC, model discovery, breaker and metadata-only traces",()=>{
 const shared=read("supabase/functions/_shared/llm/edge-runtime.mjs");
 const models=read("supabase/functions/_shared/llm/models.mjs");
 const provider=read("supabase/functions/_shared/llm/call-model.mjs");
 assert.match(shared,/qa_ai_claim_minute_request/);
 assert.match(shared,/onQuotaDenied:/);
 assert.match(shared,/onBreakerSkip:/);
 assert.match(shared,/onDiscovery:/);
 assert.match(shared,/retryAfterSeconds/);
 assert.match(shared,/maxRetries:0/);
 assert.match(models,/z-ai\/glm-5\.3-flash/);
 assert.match(models,/nvidia\/nemotron-3\.5-lightning-30b-a3b/);
 assert.match(provider,/planTokenBudget\(/);
 assert.match(provider,/breakerCheck\(/);
 assert.doesNotMatch(shared,/console\.log\(/);
});
test("F7 HTTP error separation and post-stream SSE rules retained",()=>{
 const edge=read("supabase/functions/qa-generators/index.ts");
 const shared=read("supabase/functions/_shared/llm/edge-runtime.mjs");
 assert.match(edge,/batch\?messagesForGeneratorBatch\(/);
 assert.match(edge,/mode==="teste"\?11000:3500/);
 assert.match(edge,/edgeErrorHttp\(/);
 assert.match(edge,/Retry-After, X-Request-ID/);
 assert.match(shared,/if\(!hasStarted\)\{hasStarted=true;start\(\{started:true\}\);\}/);
 assert.match(shared,/if\(hasStarted\)/);
 assert.match(shared,/send\("error"/);
 assert.match(shared,/send\("done"/);
 assert.match(shared,/truncated:result\.finishReason==="length"/);
});
test("F7 keeps semantic and revision-specific validation outside shared runtime",()=>{
 const semantic=read("supabase/functions/qa-context/index.ts");
 const rev=read("supabase/functions/qa-revisions/index.ts");
 assert.match(semantic,/parseModelFacts\(payload,text\)/);
 assert.match(semantic,/response_format:\{type:"json_object"\}/);
 assert.match(semantic,/semantic_timeout/);
 assert.match(semantic,/goal,source,chunkId,text/);
 assert.match(rev,/validateRevisionInput\(body\)/);
 assert.match(rev,/normalizeRevision\(payload,input\.operation\)/);
 assert.match(rev,/revision_unavailable/);
});
