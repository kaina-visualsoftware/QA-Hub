import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
import {mockF4Rpc} from "./f4-mock-rpc.mjs";

const ROOT="http://127.0.0.1:4173/QA-Hub/";
const USER="11111111-1111-4111-8111-111111111111";
const TASK="22222222-2222-4222-8222-222222222222";
const ORIGINAL="33333333-3333-4333-8333-333333333333";
const MODEL="44444444-4444-4444-8444-444444444444";
const USER_AUTH={
  id:USER,email:"f6@fixture.invalid",aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-08T12:00:00Z"
};
const task={
  id:TASK,user_id:USER,titulo:"Desconto em itens",codigo:"QA-7801",
  status:"em_teste",tipo_teste:"BUILD",sistema:"Vendas",versao:"12.08",
  descricao:"Confirmar descontos",publica:false,
  executado_em:"2026-11-08",created_at:"2026-11-08T10:00:00Z"
};
const cases=[{
  id:ORIGINAL,tarefa_id:TASK,user_id:USER,titulo:"Remover desconto",
  passos:"Abrir pedido e remover desconto",esperado:"Total recalculado",
  observacoes:"Executar com dados fictícios",status:"reprovado",
  obtido:"Houve divergência.",ordem:1
}];
const models=[],issues=[],requests=[];
let nextId=1,modelWrites=0,scenarioWrites=0;
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
};
async function backend(route){
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const send=(data,status=200)=>route.fulfill({
    status,headers:cors,contentType:"application/json",body:JSON.stringify(data)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"fixture",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user:USER_AUTH
  });
  if(path.endsWith("/auth/v1/user"))return send(USER_AUTH);
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/rpc/qa_insights_v1")){
    const body=req.postDataJSON();
    requests.push(body);
    return send({
      period_months:body.p_months,
      regressions:1,
      modules:[{modulo:"Vendas",tarefas:1,casos:cases.length,
        executados:1,problemas:1}],
      versions:[{modulo:"Vendas",versao:"12.08",tarefas:1,aprovadas:0,
        casos:cases.length,executados:1,problemas:1}],
      months:[{mes:"2026-11",alteracoes:2,regressoes:1,aprovacoes:1}]
    });
  }
  if(path.endsWith("/rest/v1/qa_modelos_cenario")){
    if(method==="GET"){
      assert.equal(url.searchParams.get("user_id"),"eq."+USER);
      return send(models);
    }
    if(method==="POST"){
      const payload=req.postDataJSON();
      assert.equal(payload.user_id,USER);
      assert.equal(payload.modulo,"Vendas");
      assert.equal(payload.tipo_teste,"BUILD");
      assert.equal(payload.titulo,cases[0].titulo);
      assert.equal("obtido" in payload,false);
      assert.equal("status" in payload,false);
      const entry={...payload,id:MODEL,created_at:"2026-11-08T11:00:00Z"};
      models.unshift(entry);modelWrites++;
      return send({id:MODEL},201);
    }
    if(method==="DELETE"){
      assert.equal(url.searchParams.get("user_id"),"eq."+USER);
      const id=url.searchParams.get("id")?.replace("eq.","");
      const index=models.findIndex(item=>item.id===id);
      assert.ok(index>=0);
      models.splice(index,1);
      return send({id});
    }
  }
  if(await mockF4Rpc(route,[task],cases))return;
  if(path.endsWith("/rest/v1/qa_tarefas")){
    const id=url.searchParams.get("id");
    return send(!id||id==="eq."+TASK?[task]:[]);
  }
  if(path.endsWith("/rest/v1/qa_cenarios")){
    if(method==="GET")return send(cases);
    if(method==="POST"){
      const payload=req.postDataJSON();
      assert.equal(payload.tarefa_id,TASK);
      assert.equal(payload.user_id,USER);
      assert.equal(payload.obtido,"");
      assert.equal(payload.status,"nao_executado");
      assert.equal(payload.ordem,2);
      const caseId="55555555-5555-4555-8555-"+String(nextId++).padStart(12,"0");
      cases.push({id:caseId,...payload});
      scenarioWrites++;
      return send(null,201);
    }
  }
  issues.push(method+" "+path);
  return send({message:"API sintética inesperada"},500);
}
mkdirSync("artifacts/f6-intelligence",{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",error=>issues.push("PAGE "+error.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",backend);
  await page.goto(ROOT);
  await page.getByRole("textbox",{name:"Email"}).fill(USER_AUTH.email);
  await page.getByLabel("Senha").fill("fixture-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});

  await page.goto(ROOT+"#/tarefa/"+TASK);
  await page.getByRole("heading",{name:"Desconto em itens"}).waitFor();
  await page.getByRole("tab",{name:"Cenários"}).click();
  await page.getByRole("button",{name:"Biblioteca",exact:true}).click();
  const library=page.getByRole("dialog",{name:"Biblioteca de cenários"});
  await library.waitFor();
  await library.getByText("Biblioteca vazia.",{exact:false}).waitFor();
  await library.getByRole("button",{name:"Salvar cenário"}).click();
  await library.getByRole("combobox",{name:"Cenário desta TF"}).selectOption(ORIGINAL);
  page.once("dialog",dialog=>void dialog.accept());
  await library.getByRole("button",{name:"Salvar na biblioteca"}).click();
  await page.getByText("Modelo salvo na biblioteca privada.").waitFor();
  assert.equal(modelWrites,1);
  assert.equal(models[0].user_id,USER);
  await library.locator(".qa-f6-library-item strong").filter({hasText:"Remover desconto"}).waitFor();
  page.once("dialog",dialog=>void dialog.accept());
  await library.getByRole("button",{name:"Adicionar à TF"}).click();
  await page.getByText("Cenário adicionado como pendente.",{exact:false}).waitFor();
  assert.equal(scenarioWrites,1);
  assert.equal(cases.length,2);
  assert.equal(cases[1].status,"nao_executado");
  assert.equal(cases[1].obtido,"");
  assert.equal(cases[0].status,"reprovado","Original execution is immutable on reuse");
  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const over=await page.evaluate(()=>{
      const modal=[...document.querySelectorAll('[role="dialog"]')]
        .find(el=>el.getClientRects().length>0);
      return {root:document.documentElement.scrollWidth-innerWidth,
        modal:modal?modal.scrollWidth-modal.clientWidth:0};
    });
    assert.ok(over.root<=1&&over.modal<=1,
      "F6 library overflow "+width+": "+JSON.stringify(over));
    const audit=await page.evaluate(async()=>window.axe.run(document,{
      runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
      rules:{region:{enabled:false}}
    }));
    assert.deepEqual(audit.violations.map(v=>v.id),[],"F6 library WCAG "+width);
    await page.screenshot({path:"artifacts/f6-intelligence/library-"+width+".png"});
  }
  await page.setViewportSize({width:390,height:844});
  page.once("dialog",dialog=>void dialog.accept());
  await library.getByRole("button",{name:"Excluir modelo"}).click();
  await page.getByText("Modelo removido apenas da biblioteca.").waitFor();
  assert.equal(models.length,0);
  assert.equal(cases.length,2,"Deleting template must keep imported scenarios");

  await page.goto(ROOT+"#/painel");
  await page.getByRole("heading",{name:"Visão geral"}).waitFor();
  assert.equal(requests.length,0,"Insights must not run until requested");
  await page.getByRole("button",{name:"Explorar indicadores"}).click();
  const dialog=page.getByRole("dialog",{name:"Inteligência de QA"});
  await dialog.getByRole("heading",{name:"Cobertura atual por módulo"}).waitFor();
  await dialog.getByText("Vendas",{exact:true}).first().waitFor();
  assert.equal(requests[0].p_months,6);
  await dialog.getByRole("combobox",{name:"Histórico"}).selectOption("12");
  await dialog.getByRole("heading",{name:/últimos 12 meses/}).waitFor();
  assert.equal(requests.at(-1).p_months,12);
  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const over=await page.evaluate(()=>{
      const dlg=[...document.querySelectorAll('[role="dialog"]')]
        .find(el=>el.getClientRects().length>0);
      return {root:document.documentElement.scrollWidth-innerWidth,
        dialog:dlg?dlg.scrollWidth-dlg.clientWidth:0};
    });
    assert.ok(over.root<=1&&over.dialog<=1,"Insights overflow "+width);
    const audit=await page.evaluate(async()=>window.axe.run(document,{
      runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
      rules:{region:{enabled:false}}
    }));
    assert.deepEqual(audit.violations.map(v=>v.id),[],"Insights WCAG "+width);
    await page.screenshot({path:"artifacts/f6-intelligence/insights-"+width+".png"});
  }
  assert.deepEqual(issues,[],"No unexpected requests or page errors");
  console.log("F6: modelo privado, importação pendente, exclusão sem regressão, RPC sob demanda, 4 larguras e WCAG.");
}finally{await browser.close();}
