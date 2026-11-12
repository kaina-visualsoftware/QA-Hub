import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {MODEL_IDS,MODEL_REGISTRY} from "../supabase/functions/_shared/llm/models.mjs";
const functions=["qa-ai","qa-generators","qa-context","qa-revisions"];
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
for(const name of functions){
 test(name+" gets the same prioritized NVIDIA free model registry",()=>{
  const src=file("supabase/functions/"+name+"/index.ts");
  const registry=file("supabase/functions/_shared/llm/models.mjs");
  assert.deepEqual(MODEL_IDS,[
   "z-ai/glm-5.3-flash","nvidia/nemotron-3.5-lightning-30b-a3b"
  ]);
  assert.ok(registry.includes('"z-ai/glm-5.3-flash"'));
  assert.ok(registry.indexOf('"z-ai/glm-5.3-flash"')<
   registry.indexOf('"nvidia/nemotron-3.5-lightning-30b-a3b"'));
  assert.ok(MODEL_REGISTRY[MODEL_IDS[0]]);
  if(name==="qa-ai")assert.match(src,/modelIds:MODEL_IDS/);
  else assert.match(src,/edgeModels\(/);
 });
}
test("task extraction has a single 83s global deadline below frontend 95s",()=>{
 const src=file("supabase/functions/qa-ai/index.ts");
 const frontend=file("frontend/src/features/tasks/task-ai-phased.ts");
 const deadline=Number(src.match(/deadlineAt=Date\.now\(\)\+(\d+)/)?.[1]);
 const client=Number(frontend.match(/signal:AbortSignal\.timeout\((\d+)\)/)?.[1]);
 assert.ok(deadline>=60000&&deadline+7000<client);
 assert.match(src,/error:"ai_temporarily_unavailable"/);
 assert.match(src,/error:"rate_limited"/);
 assert.match(src,/error:"nvidia_rate_limited"/);
});
