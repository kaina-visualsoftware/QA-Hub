import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
import {mockF4Rpc} from "./f4-mock-rpc.mjs";

const ROOT="http://127.0.0.1:4173/QA-Hub/";
const USER="11111111-1111-4111-8111-111111111111";
const TASK="22222222-2222-4222-8222-222222222222";
const user={id:USER,email:"summary-fixture@fixture.invalid",aud:"authenticated",
  role:"authenticated",app_metadata:{provider:"email",providers:["email"]},
  user_metadata:{},created_at:"2026-11-08T10:00:00Z"};
const task={id:TASK,user_id:USER,titulo:"TF com 30 cenários e falhas",
  codigo:"QA-302",status:"em_teste",tipo_teste:"BUILD",sistema:"Financeiro",
  versao:"12.08",descricao:"Fluxo completo de pagamentos, registros e devoluções. ".repeat(170),
  correcao:"Corrigir desconto negativo e manter comportamento anterior.",
  publica:false,executado_em:"2026-11-08"};
const statuses=["aprovado","reprovado","bloqueado","nao_executado"];
const scenarios=Array.from({length:30},(_,i)=>({
  id:"33333333-3333-4333-8333-"+String(i+1).padStart(12,"0"),
  tarefa_id:TASK,user_id:USER,ordem:i+1,titulo:"Função "+(i+1),
  passos:"Acessar pagamentos. Verificar o lançamento "+(i+1)+". ".repeat(16),
  esperado:"Resultado correto da função "+(i+1),
  obtido:i%4===1?"O valor não atualizou":i%4===0?"Confirmado":"",
  observacoes:"",status:statuses[i%4]
}));
const requirements=[{id:"44444444-4444-4444-8444-444444444444",
  tarefa_id:TASK,codigo:"RF-01",titulo:"Conferir lançamentos",
  descricao:"Recalcular descontos",criterios_aceite:"Valores corretos",estado:"aprovado",
  tipo:"funcional",ordem:1}];
const summaryPrompts=[],diagramPrompts=[],unexpected=[],writes=[];
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
};
async function mock(route){
 const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
 const send=(body,status=200)=>route.fulfill({
   status,headers:cors,contentType:"application/json",body:JSON.stringify(body)
 });
 if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
 if(path.endsWith("/auth/v1/token"))return send({
   access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
   refresh_token:"fixture",token_type:"bearer",expires_in:3600,
   expires_at:Math.floor(Date.now()/1000)+3600,user
 });
 if(path.endsWith("/auth/v1/user"))return send(user);
 if(await mockF4Rpc(route,[task],scenarios))return;
 if(path.endsWith("/rest/v1/qa_admins"))return send(null);
 if(path.endsWith("/rest/v1/qa_tarefas"))return send([task]);
 if(path.endsWith("/rest/v1/qa_cenarios"))return send(scenarios);
 if(path.endsWith("/rest/v1/qa_requisitos"))return send(requirements);
 if(path.endsWith("/rest/v1/qa_diagramas")){
   if(method!=="GET")writes.push(method);
   return send([]);
 }
 if(path.endsWith("/functions/v1/qa-ai")){
   const body=req.postDataJSON();
   assert.equal(method,"POST");
   assert.ok(body.text.length<=20000,"AI payload must fit provider limit");
   if(body.mode==="diagram-summary"){
     summaryPrompts.push(body);
     return send({provider:"NVIDIA Build",summary:
       "FUNCIONALIDADES E FLUXOS: registrar pagamentos e devoluções com desconto corrigido. "+
       "REGRAS: conferir o total. TESTES APROVADOS: existem testes aprovados. "+
       "FALHAS/REPROVAÇÕES: alguns cenários falham. BLOQUEIOS: pendentes de validação. "+
       "PENDENTES: não executados."});
   }
   if(body.mode==="diagram"){
     diagramPrompts.push(body);
     return send({provider:"NVIDIA Build",
       mermaid:'flowchart LR\n A["Abrir pagamentos"]\n B{"Valor válido?"}\n C["Validar desconto"]\n D["Registrar falha"]\n A --> B\n B -->|Sim| C\n B -->|Não| D'});
   }
   throw Error("AI mode unexpected: "+body.mode);
 }
 if(path.endsWith("/rest/v1/qa_documentos")||
    path.endsWith("/rest/v1/qa_evidencias")||
    path.endsWith("/rest/v1/qa_evidencia_arquivos")||
    path.endsWith("/rest/v1/qa_eventos"))return send([]);
 unexpected.push(method+" "+path);
 return send({message:"Unexpected endpoint"},500);
}
mkdirSync("artifacts/diagram-summary",{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on("pageerror",e=>unexpected.push("PAGE "+e.message));
 await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
 await page.goto(ROOT);
 await page.getByRole("textbox",{name:"Email"}).fill(user.email);
 await page.getByLabel("Senha").fill("fixture");
 await page.getByRole("button",{name:"Entrar",exact:true}).click();
 await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
 await page.goto(ROOT+"#/tarefa/"+TASK);
 await page.getByRole("heading",{name:task.titulo}).waitFor({timeout:20000});
 await page.getByRole("tab",{name:"Relatórios e posts"}).click();
 await page.getByRole("group",{name:"Criar relatórios e publicações"})
   .getByRole("button",{name:"Criar diagrama"}).click();
 const dialog=page.getByRole("dialog",{name:"Criar diagrama"});
 await dialog.waitFor();
 await dialog.getByText("Criar diagrama com IA").waitFor();
 assert.equal(await dialog.getByText("30",{exact:true}).count(),1);
 assert.equal(await dialog.getByRole("checkbox",{name:/cenário/i}).count(),0,
   "No individual scenario selection is needed");
 const readSource=dialog.locator('textarea[aria-label="Contexto completo da TF"]');
 assert.equal(await readSource.count(),1);
 const source=await readSource.inputValue();
 assert.match(source,/CENÁRIO 30/);
 assert.match(source,/REPROVADO \/ falhou em teste/);
 assert.match(source,/PENDENTE \/ não executado/);
 assert.equal(await dialog.getByRole("button",{name:"Gerar diagrama da TF"}).isDisabled(),true);
 await dialog.getByRole("checkbox",{name:/Autorizo enviar os dados da TF à NVIDIA/}).check();
 await dialog.getByRole("button",{name:"Resumir TF com IA"}).click();
 await dialog.getByRole("textbox",{name:"Resumo da TF para diagrama"}).waitFor({timeout:60000});
 assert.ok(summaryPrompts.length>1,"All 30 scenarios should require multiple source chunks");
 assert.ok(summaryPrompts.some(v=>v.text.includes("CENÁRIO 30")),"Last scenario was not sent");
 assert.ok(summaryPrompts.some(v=>v.text.includes("REPROVADO")));
 assert.ok(summaryPrompts.every(v=>v.text.length<=20000));
 await dialog.getByRole("textbox",{name:"Resumo da TF para diagrama"})
   .fill("FUNCIONALIDADES: pagamentos e devoluções. "+
     "IMPLEMENTADO: descontos recalculados. FALHAS: retorno bancário reprovado. "+
     "BLOQUEIOS: cenários sem teste. PENDENTES: conferir integração.");
 await dialog.getByRole("button",{name:"Gerar diagrama da TF"}).click();
 await page.waitForFunction(()=>document.getElementById("diagram-code-editor")?.value?.startsWith("flowchart LR"),null,{timeout:20000});
 const generated=await page.locator("#diagram-code-editor").inputValue();
 assert.match(generated,/flowchart LR/);
 assert.equal(diagramPrompts.length,1);
 assert.match(diagramPrompts[0].text,/retorno bancário reprovado/i);
 assert.match(diagramPrompts[0].text,/30 cenários cadastrados/);
 assert.match(diagramPrompts[0].text,/reprovados/);
 assert.deepEqual(writes,[],"Generating summaries and diagrams must not write to DB");
 for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:844});
   const extra=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(extra<=1,"Diagram modal overflow "+width);
   await page.screenshot({path:"artifacts/diagram-summary/preview-"+width+".png"});
 }
 assert.deepEqual(unexpected,[]);
 console.log("Full task diagram: 30 scenarios, all results, multi-chunk summary, review, generate, mobile, no auto-save.");
}finally{await browser.close();}
