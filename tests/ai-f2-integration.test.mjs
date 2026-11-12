import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const paths=["qa-ai","qa-generators","qa-context","qa-revisions"];
test("all four Edge Functions retain auth and quota while sending F2 errors",()=>{
 for(const name of paths){
  const source=file("supabase/functions/"+name+"/index.ts");
  assert.match(source,/ai-error-response\.mjs/,name);
  assert.match(source,/errorBody\(/,name);
  assert.match(source,/errorHeaders\(/,name);
  assert.match(source,/X-Request-ID/,name);
  assert.match(source,/Access-Control-Expose-Headers/,name);
  assert.match(source,/qa_ai_claim_minute_request/,name);
  assert.match(source,/\.auth\.getUser\(/,name);
  assert.match(source,/is_anonymous/,name);
  assert.match(source,/retry_after_seconds/,name);
  assert.match(source,/Retry-After/,name);
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
test("context retry does not discard successful outcomes",()=>{
 const source=file("frontend/src/features/generators/useSemanticContext.ts");
 assert.match(source,/!outcomes\[c.id\]/);
 assert.match(source,/next=\{\.\.\.next,\[chunk\.id\]:result\}/);
 assert.match(source,/setQuotaWait\(wait\)/);
 assert.match(source,/signal\.aborted/);
});
test("task generator does not retry auth or schema failures",()=>{
 const source=file("frontend/src/features/tasks/task-ai.ts");
 assert.match(source,/response\.error\.context\?\.status===429/);
 assert.match(source,/withAiRateLimitRetry\(/);
 assert.match(source,/protectedErrors/);
 assert.match(source,/rate_limited/);
});
