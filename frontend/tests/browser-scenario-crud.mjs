import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import {mkdirSync} from "node:fs";

const BASE="http://127.0.0.1:4173/QA-Hub/";
const userId="11111111-1111-4111-8111-111111111111";
const taskId="22222222-2222-4222-8222-222222222222";
const scenarioId="33333333-3333-4333-8333-333333333333";
const imageId="44444444-4444-4444-8444-444444444444";
const user={id:userId,email:"crud-fixture@example.invalid",aud:"authenticated",role:"authenticated",
 app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-11-10T12:00:00Z"};
const task={id:taskId,user_id:userId,titulo:"CRUD dos cenários",codigo:"QA-CRUD",
 descricao:"Dados sintéticos",tipo_teste:"BUILD",status:"em_teste",sistema:"Financeiro",
 versao:"12.10.16.0003",publica:false};
let scenarios=[{id:scenarioId,tarefa_id:taskId,user_id:userId,titulo:"Cenário antigo",
 ordem:1,status:"reprovado",obtido:"Saldo incorreto",passos:"Abrir pedido",
 esperado:"Saldo corrigido",observacoes:"Observação existente"}];
const evidence={id:imageId,tarefa_id:taskId,cenario_id:scenarioId,user_id:userId,publica:true};
const log=[],errors=[];
const cors={"Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
 "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"};
async function mock(route){
 const req=route.request(),url=new URL(req.url()),p=url.pathname,method=req.method();
 const send=(data,status=200)=>route.fulfill({
   status,headers:cors,contentType:"application/json",body:JSON.stringify(data)
 });
 if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
 if(p.endsWith("/auth/v1/token"))return send({
   access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
   refresh_token:"fixture-refresh",token_type:"bearer",expires_in:3600,
   expires_at:Math.floor(Date.now()/1000)+3600,user
 });
 if(p.endsWith("/auth/v1/user"))return send(user);
 if(await mockF4Rpc(route,[task],scenarios))return;
 if(p.endsWith("/rest/v1/qa_admins"))return send(null);
 if(p.endsWith("/rest/v1/qa_tarefas"))return send([task]);
 if(p.endsWith("/rest/v1/qa_cenarios")){
   if(method==="PATCH"){
     const patch=req.postDataJSON();
     assert.equal(url.searchParams.get("tarefa_id"),"eq."+taskId);
     const target=scenarios.find(x=>url.searchParams.get("id")==="eq."+x.id);
     assert.ok(target);
     Object.assign(target,patch);
     log.push("edited:"+target.id);
     return send({id:target.id});
   }
   if(method==="DELETE"){
     assert.equal(url.searchParams.get("tarefa_id"),"eq."+taskId);
     assert.equal(url.searchParams.get("id"),"eq."+scenarioId);
     assert.equal(evidence.publica,false,"public evidence must be revoked before deletion");
     log.push("deleted-scenario");
     scenarios=scenarios.filter(x=>x.id!==scenarioId);
     return send({id:scenarioId});
   }
   return send(scenarios);
 }
 if(p.endsWith("/rest/v1/qa_evidencia_arquivos")){
   if(method==="PATCH"){
     assert.deepEqual(req.postDataJSON(),{publica:false});
     assert.equal(url.searchParams.get("cenario_id"),"eq."+scenarioId);
     evidence.publica=false;log.push("revoked-evidence");
     return send([evidence]);
   }
   if(url.searchParams.get("publica")==="eq.true")
     return send(evidence.publica?[evidence]:[]);
   return send([evidence]);
 }
 if(p.includes("/rest/v1/"))return send([]);
 return send({});
}
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on("pageerror",error=>errors.push(error.message));
 await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
 await page.goto(BASE);
 await page.getByRole("textbox",{name:"Email"}).fill(user.email);
 await page.getByLabel("Senha").fill("fixture");
 await page.getByRole("button",{name:"Entrar",exact:true}).click();
 await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:18000});
 await page.goto(BASE+"#/tarefa/"+taskId);
 await page.getByRole("heading",{name:task.titulo}).waitFor({timeout:16000});
 await page.getByRole("tab",{name:"Cenários"}).click();
 await page.getByRole("button",{name:"Lista",exact:true}).click();
 await page.getByRole("button",{name:"Editar cenário",exact:true}).click();
 const editor=page.getByRole("dialog",{name:"Editar cenário"});
 await editor.waitFor();
 await editor.getByRole("textbox",{name:"Título"}).fill("Cenário editado");
 await editor.getByRole("textbox",{name:"Passos"}).fill("Abrir pedido e conferir");
 await editor.getByRole("button",{name:"Salvar cenário"}).click();
 await editor.waitFor({state:"hidden"});
 await page.getByRole("heading",{name:"Cenário editado"}).waitFor();
 mkdirSync("artifacts/scenario-crud",{recursive:true});
 for(const width of [320,390,1366]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=1,"Scenario editing actions overflow at "+width+": "+overflow);
   await page.screenshot({path:"artifacts/scenario-crud/edit-actions-"+width+".png"});
 }
 await page.setViewportSize({width:390,height:844});
 assert.ok(log.includes("edited:"+scenarioId));
 // The same actions must be discoverable during guided execution.
 await page.getByRole("button",{name:"Guiado"}).click();
 await page.getByRole("button",{name:"Todos",exact:true}).click();
 await page.getByRole("group",{name:"Gerenciar Cenário editado"})
   .getByRole("button",{name:"Editar cenário"}).waitFor();
 await page.getByRole("button",{name:"Lista",exact:true}).click();
 const deleteButton=page.getByRole("button",{name:"Excluir cenário",exact:true});
 page.once("dialog",dialog=>{
   assert.match(dialog.message(),/desvinculados|privad[oa]s/i);
   void dialog.accept();
 });
 await deleteButton.click();
 await page.getByText(/Esta TF ainda não possui cenários/).waitFor({timeout:16000});
 assert.deepEqual(log.slice(-2),["revoked-evidence","deleted-scenario"]);
 assert.deepEqual(errors,[]);
 mkdirSync("artifacts/scenario-crud",{recursive:true});
 for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=1,"CRUD overflow at "+width+": "+overflow);
   await page.screenshot({path:"artifacts/scenario-crud/deleted-"+width+".png"});
 }
 console.log("E2E scenario CRUD: edit/list/guided, safe deletion, revoked public evidence, 4 viewport sizes");
}finally{await browser.close();}
