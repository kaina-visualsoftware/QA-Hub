import test from "node:test";
import assert from "node:assert/strict";
import {MODEL_CONTEXT_PUBLISHED,APP_CONTEXT_BUDGETS,
 estimateTextTokens,estimateMessageTokens,planTokenBudget,TOKEN_ESTIMATE_METHOD}
 from "../supabase/functions/_shared/llm/token-budget.mjs";

const model="z-ai/glm-5.3-flash";
const msg=t=>[{role:"system",content:"Analise todas as regras."},{role:"user",content:t}];
test("F3 model card windows are separate from strict operational budgets",()=>{
 assert.equal(MODEL_CONTEXT_PUBLISHED[model],1048576);
 assert.equal(MODEL_CONTEXT_PUBLISHED["nvidia/nemotron-3.5-lightning-30b-a3b"],1000000);
 assert.ok(APP_CONTEXT_BUDGETS.task<MODEL_CONTEXT_PUBLISHED[model]);
 const x=planTokenBudget({messages:msg("TF-1"),model,mode:"task",maxOutputTokens:8192});
 assert.equal(x.exact,false);
 assert.equal(x.method,TOKEN_ESTIMATE_METHOD);
 assert.ok(x.safetyTokens>0);
 assert.equal(x.fits,true);
 assert.equal(x.inputLimitTokens+x.maxOutputTokens+x.safetyTokens,x.operationalContextTokens);
});
test("UTF-8 estimates include accents and emojis without silent truncation",()=>{
 const small=estimateTextTokens("a".repeat(200));
 const accented=estimateTextTokens("á".repeat(200));
 const emoji=estimateTextTokens("🧪".repeat(200));
 assert.ok(emoji>accented);
 assert.ok(accented>small);
 assert.equal(estimateTextTokens(""),0);
});
test("prompt estimate accounts for complete messages and role wrappers",()=>{
 assert.ok(estimateMessageTokens(msg("requisito"))>estimateTextTokens("requisito"));
 assert.throws(()=>estimateMessageTokens([{role:"user",content:{private:"text"}}]));
 assert.throws(()=>estimateMessageTokens([]));
});
test("preflight rejects only over operational budget, before quota",()=>{
 const huge=planTokenBudget({messages:msg("REQ-1: "+("🚀".repeat(150000))),
  model,mode:"semantic",maxOutputTokens:3200});
 assert.equal(huge.fits,false);
 assert.ok(huge.estimatedInputTokens>huge.inputLimitTokens);
 assert.equal(huge.remainingEstimatedTokens,0);
});
test("output reserve and model-specific availability are explicit",()=>{
 const a=planTokenBudget({messages:msg("TF: saída parcial"),
  model,mode:"teste",maxOutputTokens:11000});
 const b=planTokenBudget({messages:msg("TF: saída parcial"),
  model,mode:"teste",maxOutputTokens:3500});
 assert.ok(a.inputLimitTokens<b.inputLimitTokens);
 assert.throws(()=>planTokenBudget({messages:msg("x"),model:"arbitrary-model"}));
 assert.throws(()=>planTokenBudget({messages:msg("x"),model,maxOutputTokens:0}));
});
test("frontend and backend use matching UTF-8 estimate (guard against drift)",async()=>{
 const {readFileSync}=await import("node:fs");
 const file=readFileSync(new URL("../frontend/src/lib/token-budget.ts",import.meta.url),"utf8");
 assert.match(file,/Math\.ceil\(encoder\.encode\(text\)\.length\/3\)/);
 assert.match(file,/Estimativa local/);
});
