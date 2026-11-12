import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const goldens=JSON.parse(readFileSync(new URL("../tests/fixtures/ai-f8-goldens.json",import.meta.url),"utf8"));
test("F8 goldens cover eight independent synthetic source classes",()=>{
 const files=new Set(goldens.map(row=>row.fixture));
 assert.deepEqual([...files].sort(),[
  "apenas-requisito","apenas-roteiro","curta","instrucao-maliciosa",
  "longa-80k","media","rotulos-interface","tabelas-sql"
 ]);
 assert.ok(goldens.length>=19);
 assert.ok(goldens.some(row=>row.category==="execution"));
 assert.ok(goldens.some(row=>row.category==="injection"));
});
test("F8 offline quality report distinguishes policy metrics from real NVIDIA quality",()=>{
 const body=execFileSync(process.execPath,[
  new URL("../scripts/ai-f8-evaluate.mjs",import.meta.url).pathname,"--json"
 ],{encoding:"utf8"});
 const report=JSON.parse(body);
 assert.equal(report.kind,"synthetic_offline_policy_eval");
 assert.match(report.warning,/NÃO mede resultados reais/);
 assert.equal(report.metrics.false_accept_count,0);
 assert.equal(report.metrics.mismatches,0);
 assert.equal(report.metrics.verified_recall_percent,100);
 assert.equal(report.metrics.negative_rejection_percent,100);
});
