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
test("qa-context returns a distinct timeout code and uses bounded requests",()=>{
 const src=readFileSync(new URL("../supabase/functions/qa-context/index.ts",import.meta.url),"utf8");
 assert.match(src,/semantic_timeout/);
 assert.match(src,/AbortSignal\.timeout\(30000\)/);
 assert.match(src,/reasoning_effort:"low"/);
 assert.match(src,/response_format:\{type:"json_object"\}/);
});
