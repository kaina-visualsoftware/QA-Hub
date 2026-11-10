import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import {mkdirSync} from "node:fs";

const root="http://127.0.0.1:4173/QA-Hub/";
const userId="11111111-1111-4111-8111-111111111111";
const taskId="22222222-2222-4222-8222-222222222222";
const scenarioId="33333333-3333-4333-8333-333333333333";
const user={id:userId,email:"capturas@fixture.invalid",aud:"authenticated",role:"authenticated",
 app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-11-10T12:00:00Z"};
const task={id:taskId,user_id:userId,titulo:"Evidência de teste com captura",
 codigo:"QA-371",descricao:"Dados sintéticos",tipo_teste:"BUILD",status:"em_teste",
 sistema:"Financeiro",versao:"12.10.16.0003",publica:false};
const scenario={id:scenarioId,tarefa_id:taskId,user_id:userId,titulo:"Testar retirada de desconto",
 ordem:1,status:"reprovado",obtido:"Desconto não removido",passos:"Abrir pedido e retirar desconto",
 esperado:"Desconto removido",observacoes:"O cenário tem histórico de falha"};
const files=[],unexpected=[],stored=[];
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOa2nx0AAAAASUVORK5CYII=","base64");
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
 "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,PUT,OPTIONS"};
async function mock(route){
 const req=route.request(),url=new URL(req.url()),p=url.pathname,m=req.method();
 const send=(data,status=200)=>route.fulfill({status,headers:cors,
   contentType:"application/json",body:JSON.stringify(data)});
 if(m==="OPTIONS")return route.fulfill({status:204,headers:cors});
 if(p.endsWith("/auth/v1/token"))return send({
  access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
  refresh_token:"fixture-refresh",token_type:"bearer",expires_in:3600,
  expires_at:Math.floor(Date.now()/1000)+3600,user});
 if(p.endsWith("/auth/v1/user"))return send(user);
 if(await mockF4Rpc(route,[task],[scenario]))return;
 if(p.endsWith("/rest/v1/qa_admins"))return send(null);
 if(p.endsWith("/rest/v1/qa_tarefas"))return send([task]);
 if(p.endsWith("/rest/v1/qa_cenarios"))return send([scenario]);
 if(p.endsWith("/rest/v1/qa_evidencia_arquivos")){
   if(m==="POST"){
     const record={...req.postDataJSON(),created_at:"2026-11-10T12:00:00Z",publica:false};
     assert.equal(record.cenario_id,scenarioId,"Capture must link to this scenario");
     assert.equal(record.user_id,userId);
     assert.equal(record.tarefa_id,taskId);
     files.push(record);
     return send(record,201);
   }
   if(m==="PATCH"){
     const patch=req.postDataJSON();
     assert.deepEqual(patch,{publica:true});
     assert.equal(url.searchParams.get("user_id"),"eq."+userId);
     assert.equal(url.searchParams.get("tarefa_id"),"eq."+taskId);
     const found=files.find(file=>url.searchParams.get("id")==="eq."+file.id);
     assert.ok(found,"Can publish only uploaded record");
     Object.assign(found,patch);
     return send({id:found.id,publica:true});
   }
   return send(files);
 }
 if(p.startsWith("/storage/v1/object/")){
   if(m==="POST"){
     assert.match(p,/\/qa-evidence-private\/11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\//);
     stored.push(p);
     return send({Key:p});
   }
   if(m==="GET")return route.fulfill({status:200,headers:cors,contentType:"image/png",body:png});
 }
 if(p.endsWith("/rest/v1/qa_eventos")||p.endsWith("/rest/v1/qa_evidencias")||
    p.endsWith("/rest/v1/qa_requisito_fontes"))return send([]);
 unexpected.push(m+" "+p);
 return send({message:"Unexpected fixture API"},500);
}
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on("pageerror",e=>unexpected.push("PAGE "+e.message));
 await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
 await page.goto(root);
 await page.getByRole("textbox",{name:"Email"}).fill(user.email);
 await page.getByLabel("Senha").fill("fixture");
 await page.getByRole("button",{name:"Entrar",exact:true}).click();
 await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:18000});
 await page.goto(root+"#/tarefa/"+taskId);
 await page.getByRole("heading",{name:task.titulo}).waitFor({timeout:15000});
 await page.getByRole("tab",{name:"Cenários"}).click();
 await page.getByRole("button",{name:"Lista",exact:true}).click();
 const toggler=page.getByText("Colar captura ou visualizar imagens deste teste",{exact:true});
 await toggler.click();
 const paste=page.getByRole("group",{name:"Colar captura de tela no teste "+scenario.titulo});
 await paste.waitFor();
 await paste.focus();
 await page.evaluate(base64=>{
   const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
   const file=new File([bytes],"print.png",{type:"image/png"});
   const clipboard=new DataTransfer();clipboard.items.add(file);
   const event=new ClipboardEvent("paste",{clipboardData:clipboard,bubbles:true,cancelable:true});
   document.querySelector(".qa-scenario-paste")?.dispatchEvent(event);
 },png.toString("base64"));
 await page.getByText(/captura-\d+\.png/).first().waitFor();
 await page.getByRole("textbox",{name:"Observação da captura"}).fill("Captura após reprovação do teste");
 await page.getByRole("checkbox",{name:/Permitir exibição na página pública/}).check();
 page.once("dialog",d=>void d.accept());
 await page.getByRole("button",{name:"Vincular ao teste"}).click();
 await page.getByText("Captura vinculada ao cenário "+scenario.titulo).waitFor({timeout:14000});
 assert.equal(files.length,1);assert.equal(files[0].publica,true);
 assert.equal(stored.length,1);
 await page.getByText("Autorizada para página pública").waitFor();
 mkdirSync("artifacts/scenario-evidence",{recursive:true});
 for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=1,"Case evidence overflow at "+width+" = "+overflow);
   await page.screenshot({path:"artifacts/scenario-evidence/paste-"+width+".png"});
 }
 assert.deepEqual(unexpected,[]);
 console.log("Clipboard evidence E2E: paste PNG, scenario linkage, private Storage, opt-in publishing, 4 breakpoints.");
}finally{await browser.close();}
