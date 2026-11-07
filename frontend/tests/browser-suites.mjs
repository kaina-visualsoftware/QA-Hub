import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Execute independent synthetic browser suites even when an earlier one fails.
// This prevents flaky import/AI tests from masking access-control regressions.
const suites = [
  "browser-smoke.mjs",
  "browser-qa-flow.mjs",
  "browser-access.mjs",
  "browser-quick-create.mjs",
  "browser-draft-recovery.mjs",
  "browser-auth-callback.mjs",
  "browser-accessibility.mjs",
  "browser-publication-gate.mjs"
];

const failures=[];
for(const suite of suites){
  console.log("\n========== "+suite+" ==========");
  const result=spawnSync(process.execPath,[fileURLToPath(new URL(suite,import.meta.url))],{
    cwd:process.cwd(),
    env:process.env,
    stdio:"inherit",
    timeout:120_000
  });
  if(result.error || result.status!==0){
    const detail=result.error?.message ?? ("exit="+result.status+", signal="+result.signal);
    failures.push({suite,detail});
    console.error("[FAIL] "+suite+": "+detail);
  }else{
    console.log("[PASS] "+suite);
  }
}
console.log("\nBrowser suite summary: "+(suites.length-failures.length)+
  "/"+suites.length+" passed.");
for(const item of failures) console.error(" - "+item.suite+": "+item.detail);
if(failures.length) process.exitCode=1;
