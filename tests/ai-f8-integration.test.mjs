import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("F8 rollout is server-side, behind Supabase Auth, on all four routes",()=>{
 for(const name of ["qa-ai","qa-generators","qa-context","qa-revisions"]){
  const s=file("supabase/functions/"+name+"/index.ts");
  assert.match(s,/aiFeatureEnabled\("general"/,name);
  assert.match(s,/disabledAiResponse\(\)/,name);
  assert.match(s,/\.auth\.getUser\(/,name);
  assert.match(s,/is_anonymous/,name);
  assert.ok(s.indexOf("aiFeatureEnabled(")>s.indexOf(".auth.getUser("),name);
 }
 const ai=file("supabase/functions/qa-ai/index.ts");
 const generator=file("supabase/functions/qa-generators/index.ts");
 const context=file("supabase/functions/qa-context/index.ts");
 const revision=file("supabase/functions/qa-revisions/index.ts");
 assert.match(ai,/aiFeatureEnabled\("task-phased"/);
 assert.match(generator,/aiFeatureEnabled\("generator-batch"/);
 assert.match(context,/aiFeatureEnabled\("semantic"/);
 assert.match(revision,/aiFeatureEnabled\("revision"/);
});
test("F8 disabled has distinct non-retryable F2 error classification",()=>{
 const s=file("supabase/functions/_shared/ai-error-response.mjs");
 assert.match(s,/feature_disabled:"feature_disabled"/);
 assert.match(s,/"feature_disabled"/);
 assert.doesNotMatch(s,/retryable:\[[^\]]*feature_disabled/);
});
test("F8 dashboard is admin gated and imports only local logs",()=>{
 const admin=file("frontend/src/pages/AdminPage.tsx");
 const panel=file("frontend/src/features/ai-monitoring/AiMonitoringPanel.tsx");
 const metrics=file("frontend/src/features/ai-monitoring/ai-metrics.ts");
 assert.match(admin,/if \(!role\.data\) return/);
 assert.match(admin,/<AiMonitoringPanel/);
 assert.match(panel,/await file\.text\(\)/);
 assert.doesNotMatch(panel,/supabase\.functions\.invoke|fetch\(|localStorage|sessionStorage/);
 assert.doesNotMatch(metrics,/fetch\(|localStorage|sessionStorage/);
 assert.match(metrics,/qa_ai_attempt/);
});
test("F8 offline evaluation is distinguishable from real NVIDIA production quality",()=>{
 const s=file("scripts/ai-f8-evaluate.mjs");
 assert.match(s,/synthetic_offline_policy_eval/);
 assert.match(s,/NÃO mede resultados reais/);
 assert.match(s,/process\.exitCode=1/);
 assert.doesNotMatch(s,/NVIDIA_API_KEY|Authorization|fetch\(/);
});
