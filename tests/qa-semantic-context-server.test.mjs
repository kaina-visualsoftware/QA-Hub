import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseModelFacts} from "../supabase/functions/qa-context/facts.mjs";

test("truncated semantic response cannot masquerade as verified source facts",()=>{
 const snippet="RF-5: Não remover descontos negativos.";
 const result=parseModelFacts({choices:[{finish_reason:"length",
  message:{content:JSON.stringify({facts:[{category:"regra",quote:snippet,summary:"Regra"}]})}}]},snippet);
 assert.equal(result.valid,false);
});
test("qa-context retains timeout code, bounded shared provider and JSON-mode citations",()=>{
 const src=readFileSync(new URL("../supabase/functions/qa-context/index.ts",import.meta.url),"utf8");
 const registry=readFileSync(new URL("../supabase/functions/_shared/llm/models.mjs",import.meta.url),"utf8");
 assert.match(src,/semantic_timeout/);
 assert.match(src,/timeoutMs:compact\?19000:26000/);
 assert.match(src,/deadlineMs:compact\?43000:56000/);
 assert.match(src,/maxTokens:compact\?900:1700/);
 assert.match(src,/profile===\"compact\"/);
 assert.match(src,/retry_after_seconds:15/);
 assert.doesNotMatch(src,/escolha o modo r[aá]pido/i);
 assert.match(src,/modelMode:"semantic"/);
 assert.match(src,/response_format:\{type:"json_object"\}/);
 assert.match(registry,/reasoning_effort:"low"/);
});
