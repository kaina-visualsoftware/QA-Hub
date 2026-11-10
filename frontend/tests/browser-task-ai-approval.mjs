import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
import {mockF4Rpc} from "./f4-mock-rpc.mjs";

const root="http://127.0.0.1:4173/QA-Hub/";
const uid="11111111-1111-4111-8111-111111111111";
const id="22222222-2222-4222-8222-222222222222";
const user={id:uid,email:"review-fixture@example.invalid",aud:"authenticated",
  role:"authenticated",app_metadata:{provider:"email",providers:["email"]},
  user_metadata:{},created_at:"2026-11-10T10:00:00Z"};
const task={id,user_id:uid,titulo:"Validação manual de desconto",descricao:"Desconto deve ser corrigido no financeiro.",
  tipo_teste:"BUILD",codigo:"12345",versao:"12.10.16.0003",sistema:"Financeiro",
  status:"rascunho",causa:"",correcao:"",explicacao:"",conclusao:"",observacoes:"",
  publica:false,created_at:"2026-11-10T10:00:00Z",executado_em:"2026-11-10"};
const cors={"Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"};
let writes=0,aiCalls=0;
const errors=[];
async function backend(route){
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
  const send=(data,status=200)=>route.fulfill({
    status,headers:cors,contentType:"application/json",body:JSON.stringify(data)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"synthetic-refresh",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(await mockF4Rpc(route,[task],[]))return;
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/qa_tarefas")){
    if(method==="PATCH"){
      writes++;
      Object.assign(task,request.postDataJSON());
      return send([task]);
    }
    return send([task]);
  }
  if(path.endsWith("/rest/v1/qa_cenarios"))return send([]);
  if(path.endsWith("/rest/v1/qa_requisito_fontes"))return send([]);
  if(path.endsWith("/rest/v1/qa_requisitos")||
    path.endsWith("/rest/v1/qa_evidencias")||
    path.endsWith("/rest/v1/qa_documentos")||
    path.endsWith("/rest/v1/qa_eventos"))return send([]);
  if(path.endsWith("/functions/v1/qa-ai")){
    aiCalls++;
    assert.ok(request.postDataJSON().text.includes("Desconto"));
    return send({provider:"NVIDIA Build",draft:{
      titulo:"Título sugerido pela NVIDIA",
      descricao:"Resumo da correção sugerido pela IA.",
      causa:"A regra antiga ignorava descontos negativos.",
      correcao:"Ajustada a rotina de remoção de desconto.",
      conclusao:"A correção exige validação de regressões.",
      cenarios:[]
    }});
  }
  errors.push(method+" "+path);
  return send({message:"Synthetic endpoint unavailable"},404);
}

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",error=>errors.push("PAGE "+error.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",backend);
  await page.goto(root);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("synthetic-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  await page.goto(root+"#/tarefa/"+id);
  await page.getByRole("heading",{name:task.titulo}).waitFor({timeout:20000});
  await page.getByRole("button",{name:"Editar TF"}).click();
  const modal=page.getByRole("dialog",{name:"Editar TF"});
  await modal.getByText("Regerar dados da TF com IA").click();
  const stepper=modal.getByRole("list",{name:"Etapas da revisão da TF com IA"});
  assert.match(await stepper.locator(".is-current").innerText(),/Solicitar/);
  await modal.getByRole("checkbox",{name:/Autorizo enviar o texto-base/}).check();
  await modal.getByRole("button",{name:"Gerar sugestões com IA"}).click();
  const proposal=modal.getByRole("region",{name:"Revisão da regeração por IA"});
  await proposal.waitFor({timeout:20000});
  assert.equal(aiCalls,1);
  await proposal.getByRole("button",{name:"Voltar à configuração"}).click();
  await modal.getByRole("button",{name:"Voltar às sugestões anteriores"}).click();
  await proposal.waitFor();
  assert.equal(aiCalls,1,"Returning to a preserved proposal must not call the API again");
  assert.equal(writes,0,"AI must not mutate DB before explicit approval");
  assert.match(await stepper.locator(".is-current").innerText(),/Revisar/);
  assert.equal(await modal.locator('input[name="titulo"]').count(),0,
    "The editing form must be hidden on the isolated AI review screen");
  assert.ok((await proposal.innerText()).includes("Atual: Validação manual de desconto"),
    "The original value must be visible for comparison");
  assert.equal(await modal.getByRole("button",{name:"Salvar alterações"}).count(),0,
    "Saving is not exposed until the AI suggestions are explicitly approved");
  mkdirSync("artifacts/task-ai-review",{recursive:true});
  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const sizes=await page.evaluate(()=>{
      const dialog=document.querySelector('[role="dialog"][aria-modal="true"]');
      return {page:document.documentElement.scrollWidth-innerWidth,
        dialog:dialog?dialog.scrollWidth-dialog.clientWidth:999};
    });
    assert.ok(sizes.page<=1&&sizes.dialog<=1,
      "AI review overflow at "+width+": "+JSON.stringify(sizes));
    const audit=await page.evaluate(async()=>window.axe.run(document,{
      runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
      rules:{region:{enabled:false}}
    }));
    if(audit.violations.length)console.log("A11Y DETAILS",width,JSON.stringify(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary})).slice(0,7)}))));
    assert.deepEqual(audit.violations.map(v=>v.id),[],"AI review accessibility at "+width);
    await page.screenshot({path:"artifacts/task-ai-review/review-"+width+".png"});
  }
  await page.setViewportSize({width:390,height:844});
  const cause=proposal.locator(".qa-ai-proposal-field").filter({hasText:"Causa"});
  assert.ok((await cause.innerText()).includes("A regra antiga ignorava descontos negativos."));
  assert.equal(await cause.getByRole("checkbox").isChecked(),true,
    "Empty current fields can be selected by default");
  const title=proposal.locator(".qa-ai-proposal-field").filter({hasText:"Título"});
  assert.equal(await title.getByRole("checkbox").isChecked(),false,
    "Populated manual fields should not be replaced automatically");
  await modal.getByRole("button",{name:"Aplicar sugestões"}).click();
  await modal.getByText("Revisão aprovada",{exact:true}).waitFor();
  assert.equal(writes,0,"Approval only updates the form; saving is a distinct step");
  assert.equal(await modal.locator('input[name="titulo"]').inputValue(),
    "Validação manual de desconto");
  assert.match(await stepper.locator(".is-current").innerText(),/Aplicar e salvar/);
  await modal.getByRole("button",{name:"Salvar alterações"}).click();
  await page.getByText(/Alterações da TF salvas/).waitFor({timeout:20000});
  assert.equal(writes,1);
  assert.equal(task.titulo,"Validação manual de desconto");
  assert.equal(task.causa,"A regra antiga ignorava descontos negativos.");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=1,"Task AI review must fit mobile 390px");
  assert.deepEqual(errors.filter(e=>e.startsWith("PAGE")),[]);
  console.log("AI TF review: no mutation until selected approval and distinct Save; manual fields preserved.");
}finally{
  await browser.close();
}
