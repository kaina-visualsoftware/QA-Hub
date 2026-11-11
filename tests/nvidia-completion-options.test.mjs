import test from "node:test";
import assert from "node:assert/strict";
import {nvidiaRequestOptions,hasMeaningfulTaskData,PROVIDER_TIMEOUT_MS} from "../supabase/functions/qa-ai/request.mjs";

test("GLM requests use low reasoning and reserve tokens for JSON",()=>{
 const req=nvidiaRequestOptions("z-ai/glm-5.3-flash");
 assert.equal(req.reasoning_effort,"low");
 assert.equal(req.chat_template_kwargs,undefined);
 assert.equal(req.response_format.type,"json_object");
 assert.ok(req.max_tokens>=8192);
 assert.ok(PROVIDER_TIMEOUT_MS>=30000);
});
test("Nemotron disables thinking but still enforces structured JSON",()=>{
 const req=nvidiaRequestOptions("nvidia/nemotron-3.5-lightning-30b-a3b");
 assert.equal(req.chat_template_kwargs.enable_thinking,false);
 assert.equal(req.response_format.type,"json_object");
 assert.ok(req.max_tokens>=4800);
});
test("Mermaid and summary generation remain free-form, never JSON forced",()=>{
 for(const mode of ["diagram","summary"]){
  assert.equal(nvidiaRequestOptions("z-ai/glm-5.3-flash",mode).response_format,undefined);
  assert.equal(nvidiaRequestOptions("nvidia/nemotron-3.5-lightning-30b-a3b",mode).response_format,undefined);
 }
});
test("metadata-only and empty model responses never count as extracted tasks",()=>{
 assert.equal(hasMeaningfulTaskData({codigo:"67866",titulo:"Pedido 67866",cenarios:[]}),false);
 assert.equal(hasMeaningfulTaskData({descricao:"..."}),false);
 assert.equal(hasMeaningfulTaskData({descricao:"O desconto não foi removido."}),true);
 assert.equal(hasMeaningfulTaskData({cenarios:[{passos:"Abrir o pedido e conferir o desconto"}]}),true);
 assert.equal(hasMeaningfulTaskData(null),false);
});
