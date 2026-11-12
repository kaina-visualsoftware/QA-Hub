import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const paths=["qa-ai","qa-generators","qa-context","qa-revisions"];
test("all four Edge Functions keep F2 errors and quota via shared provider",()=>{
 const runtime=file("supabase/functions/_shared/llm/edge-runtime.mjs");
 assert.match(runtime,/qa_ai_claim_minute_request/);
 assert.match(runtime,/retry_after_seconds/);
 assert.match(runtime,/Retry-After/);
 for(const name of paths){
  const source=file("supabase/functions/"+name+"/index.ts");
  assert.match(source,/ai-error-response\.mjs/,name);
  assert.match(source,/errorBody\(/,name);
  assert.match(source,/errorHeaders\(/,name);
  assert.match(source,/X-Request-ID/,name);
  assert.match(source,/Access-Control-Expose-Headers/,name);
  assert.match(source,/\.auth\.getUser\(/,name);
  assert.match(source,/is_anonymous/,name);
  if(name==="qa-ai")assert.match(source,/qa_ai_claim_minute_request/);
  else assert.match(source,/edgeErrorHttp\(/);
 }
});
test("quota rejected streams are retried only before SSE starts",()=>{
 const source=file("frontend/src/features/generators/stream.ts");
 const open=source.indexOf("withAiRateLimitRetry(");
 const consume=source.indexOf("consumeGeneratorSse(response.body");
 assert.ok(open>0&&consume>open);
 assert.match(source,/if\(!reply\.ok\)throw await readAiHttpError\(reply\)/);
 assert.equal(source.indexOf("withAiRateLimitRetry(",consume),-1);
});
test("parallel context retries checkpoint each NVIDIA outcome and keep per-part quota waits",()=>{
 const source=file("frontend/src/features/generators/useSemanticContext.ts");
 const queue=file("frontend/src/features/generators/semantic-queue.ts");
 assert.match(source,/!outcomes\[c.id\]/);
 assert.match(source,/next=\{\.\.\.next,\[chunk\.id\]:result\}/);
 assert.match(source,/setOutcomes\(current=>\(\{\.\.\.current,\[chunk\.id\]:result\}\)\)/);
 assert.match(source,/setQuotaWaits\(current=>/);
 assert.match(source,/runSemanticQueue\(/);
 assert.match(source,/signal\.aborted/);
 assert.match(queue,/SEMANTIC_CONCURRENCY=2/);
 assert.match(queue,/stopDispatch=true/);
});
test("task generator does not retry auth or schema failures",()=>{
 const source=file("frontend/src/features/tasks/task-ai.ts");
 assert.match(source,/response\.error\.context\?\.status===429/);
 assert.match(source,/withAiRateLimitRetry\(/);
 assert.match(source,/protectedErrors/);
 assert.match(source,/rate_limited/);
});
