import {test} from "node:test";
import assert from "node:assert/strict";
import {createPublicAttachmentHandler} from "../supabase/functions/qa-public-evidence/handler.mjs";
const owner="11111111-1111-4111-8111-111111111111";
const task="22222222-2222-4222-8222-222222222222";
const id="33333333-3333-4333-8333-333333333333";
function fixture({kind="evidence",published=true,foreign=false,failed=false}={}){
 const calls=[];
 const fetcher=async url=>{
  calls.push(String(url));
  const u=new URL(url);
  if(u.pathname.includes("storage/v1"))return new Response("file content");
  if(u.pathname.endsWith("qa_tarefas"))return new Response(JSON.stringify(published?[{id:task}]:[]));
  if(failed)return new Response("unavailable",{status:503});
  const path=(foreign?"other":owner)+"/"+task+"/"+id+(kind==="source"?".docx":".pdf");
  return new Response(JSON.stringify(kind==="source"?
   [{user_id:owner,tarefa_id:task,tipo_fonte:"arquivo",mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",tamanho_arquivo:12,storage_path:path,nome_arquivo:"documento.docx"}]:
   [{user_id:owner,tarefa_id:task,cenario_id:null,mime_type:"application/pdf",tamanho_bytes:12,objeto_path:path,nome_original:"resultado.pdf",publica:false}]));
 };
 const handler=createPublicAttachmentHandler({base:"https://example.supabase.co",key:"test-server-key",fetcher});
 return {calls,request:()=>handler(new Request("https://example.invalid/?file="+id+"&kind="+kind))};
}
test("TF pública publica PDF sem flag individual nem cenário",async()=>{
 const {request,calls}=fixture();const response=await request();
 assert.equal(response.status,200);assert.equal(await response.text(),"file content");
 assert.equal(response.headers.get("Content-Type"),"application/pdf");
 assert.match(response.headers.get("Content-Disposition"),/^attachment/);
 assert.match(response.headers.get("Cache-Control"),/no-store/);
 assert.ok(calls.some(url=>url.includes("publica=eq.true")));
});
test("fontes DOCX herdam visibilidade da TF e usam bucket correto",async()=>{
 const {request,calls}=fixture({kind:"source"});assert.equal((await request()).status,200);
 assert.ok(calls.some(url=>url.includes("authenticated/qa-requisitos/")));
});
test("retirar publicação bloqueia o próximo acesso, sem URL assinada",async()=>{
 const {request,calls}=fixture({published:false});assert.equal((await request()).status,404);
 assert.ok(!calls.some(url=>url.includes("storage/v1")));
});
test("caminho de outra conta e falha de consulta negam acesso",async()=>{
 for(const options of [{foreign:true},{failed:true}]){
  const {request,calls}=fixture(options);assert.equal((await request()).status,404);
  assert.ok(!calls.some(url=>url.includes("storage/v1")));
 }
});
test("identificadores e tipos inválidos não consultam dados",async()=>{
 let calls=0;const handler=createPublicAttachmentHandler({base:"https://example.invalid",key:"key",fetcher:async()=>{calls++;throw Error();}});
 for(const query of ["file=invalid","file="+id+"&kind=unknown"]){
  assert.equal((await handler(new Request("https://example.invalid/?"+query))).status,400);
 }
 assert.equal(calls,0);
});
