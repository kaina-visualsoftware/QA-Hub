import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {GENERATOR_STAGE_IDS,parseGeneratorBatch} from "../supabase/functions/qa-generators/batches.mjs";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("batch validation happens before quota and provider discovery",()=>{
 const s=file("supabase/functions/qa-generators/index.ts");
 const validated=s.indexOf("const batch=data?.batch===undefined?");
 const discovery=s.indexOf("await allowedModels(");
 const quota=s.indexOf('db.rpc("qa_ai_claim_minute_request")');
 assert.ok(validated>0&&validated<discovery&&discovery<quota);
 assert.match(s,/if\(data\?\.batch!==undefined&&!batch\)/);
 assert.match(s,/if\(!claim\.data\.allowed\)/);
 assert.match(s,/retry_after_seconds/);
 assert.match(s,/!identity\.user\|\|identity\.user\.is_anonymous/);
 assert.match(s,/!ORIGINS\.has\(origin\)/);
});
test("legacy calls without batch retain existing full prompts and output limits",()=>{
 const s=file("supabase/functions/qa-generators/index.ts");
 assert.match(s,/batch\?messagesForGeneratorBatch\(/);
 assert.match(s,/:baseMessages/);
 assert.match(s,/mode==="teste"\?11000:3500/);
});
test("SSE distinguishes length and dropped transport from actual completion",()=>{
 const s=file("supabase/functions/qa-generators/index.ts");
 assert.match(s,/finishReason==="length"/);
 assert.match(s,/!sawDone&&!finishReason/);
 assert.match(s,/if\(failed\)/);
 assert.match(s,/send\("error"/);
 assert.match(s,/send\("done"/);
});
test("frontend assembles before formatting or attaching and keeps old results on failure",()=>{
 const s=file("frontend/src/features/generators/GeneratorPanel.tsx");
 const generated=s.indexOf("const response = await generateBatchedWithNvidia(");
 const formatted=s.indexOf("const formatted = formatGeneratedPost(",generated);
 const cases=s.indexOf("const candidates = parseGeneratedCases(",generated);
 assert.ok(generated>0&&formatted>generated&&cases>generated);
 assert.match(s,/batchCheckpoint\.current=null;setBatchProgress\(null\)/);
 assert.match(s,/unfinishedGeneratorStages\(/);
 assert.match(s,/setRaw\(previousRaw\)/);
 assert.match(s,/attachReviewedCases\(/);
});
test("stages and continuations are bounded, no privilege leaks",()=>{
 for(const mode of ["post","teste"]){
  const names=GENERATOR_STAGE_IDS[mode];
  assert.ok(names.length>=3&&names.length<=5);
  for(const [index,stage] of names.entries()){
   const batch={version:1,index,total:names.length,stage,continuation:0,previousTail:""};
   assert.deepEqual(parseGeneratorBatch(batch,mode),batch);
  }
 }
 const s=file("supabase/functions/qa-generators/index.ts");
 assert.match(s,/Deno\.env\.get\("NVIDIA_API_KEY"\)/);
 assert.doesNotMatch(file("frontend/src/features/generators/batched-stream.ts"),/NVIDIA_API_KEY/);
});
