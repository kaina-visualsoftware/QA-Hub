import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const edgePaths=[
 "qa-ai","qa-generators","qa-context","qa-revisions"
];
for(const name of edgePaths){
 test(name+" uses the current exact free NVIDIA GLM model ID as first choice",()=>{
  const src=readFileSync(new URL("../supabase/functions/"+name+"/index.ts",import.meta.url),"utf8");
  assert.ok(src.includes('"z-ai/glm-5.3-flash"'),"Official /v1/models ID missing");
  assert.ok(!src.includes("z-ai/glm-5-3-flash"),"Outdated/nonexistent ID remains");
  const glm=src.indexOf('"z-ai/glm-5.3-flash"');
  const nemotron=src.indexOf('"nvidia/nemotron-3.5-lightning-30b-a3b"');
  assert.ok(glm>=0&&nemotron>=0&&glm<nemotron,
    "The fast fallback must be preferred over a saturated Nemotron endpoint");
  assert.match(src,/qa_ai_claim_minute_request/,
    "Provider attempts must still count against the shared quota.");
 });
}
test("task extraction bounds two provider attempts inside frontend's 65s timeout",()=>{
 const src=readFileSync(new URL("../supabase/functions/qa-ai/index.ts",import.meta.url),"utf8");
 const request=readFileSync(new URL("../supabase/functions/qa-ai/request.mjs",import.meta.url),"utf8");
 const frontend=readFileSync(new URL("../frontend/src/features/tasks/task-ai.ts",import.meta.url),"utf8");
 const ms=Number(request.match(/PROVIDER_TIMEOUT_MS=(\d+)/)?.[1]);
 const client=Number(frontend.match(/signal:AbortSignal\.timeout\((\d+)\)/)?.[1]);
 // Discovery + two provider attempts + response time must fit the browser deadline.
 assert.ok(ms>=30000&&ms*2+7000+5000<client,"Combined provider timeout exceeds frontend");
 assert.match(src,/error:"ai_temporarily_unavailable"/);
 assert.match(src,/error:"rate_limited"/);
 assert.match(src,/error:"nvidia_rate_limited"/);
});
