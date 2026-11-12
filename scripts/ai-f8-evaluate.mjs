#!/usr/bin/env node
/** F8 offline, synthetic, deterministic gate. This measures our local
 * verifier, NOT truthfulness or uptime of a live NVIDIA model.
 * Nothing from a real TF leaves this process.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {verifyGrounding} from "../supabase/functions/qa-ai/grounding.mjs";
const home=fileURLToPath(new URL("../",import.meta.url));
const cases=JSON.parse(readFileSync(new URL("../tests/fixtures/ai-f8-goldens.json",import.meta.url),"utf8"));
const results=[];
for(const row of cases){
 const source=readFileSync(new URL("../frontend/tests/fixtures/ia/"+row.fixture+".md",import.meta.url),"utf8");
 const actual=verifyGrounding(source,row.value,row.quote);
 results.push({id:row.case_id,fixture:row.fixture,category:row.category,
  expected:row.expected,actual:actual.status,
  reason:actual.reason,match:row.expected===actual.status});
}
const verified=results.filter(r=>r.expected==="verified");
const blocked=results.filter(r=>r.expected==="needs_review");
const n=items=>items.filter(r=>r.match).length;
const denominator=(hits,total)=>total?Number((hits/total*100).toFixed(2)):null;
const report={
 schema_version:1,kind:"synthetic_offline_policy_eval",dataset:"f8-golden-synthetic-v1",
 warning:"Avaliação do verificador determinístico, NÃO mede resultados reais de modelos NVIDIA.",
 cases:results.length,source_fixtures:new Set(results.map(r=>r.fixture)).size,
 metrics:{
  verified_recall_percent:denominator(n(verified),verified.length),
  negative_rejection_percent:denominator(n(blocked),blocked.length),
  false_accept_count:blocked.length-n(blocked),
  mismatches:results.filter(r=>!r.match).length
 },
 results
};
const output=process.argv[2]||"";
if(output){
 const path=resolve(output);
 mkdirSync(dirname(path),{recursive:true});
 writeFileSync(path,JSON.stringify(report,null,2)+"\n",{mode:0o600});
}
if(process.argv.includes("--json"))process.stdout.write(JSON.stringify(report)+"\n");
else process.stdout.write(
 "F8 offline goldens: "+report.cases+" cases, "+report.source_fixtures+" fixtures, "+
 "verified recall "+report.metrics.verified_recall_percent+"%, "+
 "rejection "+report.metrics.negative_rejection_percent+"%\n");
if(report.metrics.mismatches||report.source_fixtures<8||report.cases<19){
 for(const row of results.filter(r=>!r.match))
  process.stderr.write(row.id+": expected "+row.expected+" got "+row.actual+" ("+row.reason+")\n");
 process.exitCode=1;
}
