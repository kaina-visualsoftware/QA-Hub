import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";

const ROOT="http://127.0.0.1:4173/QA-Hub/";
const USER="11111111-1111-4111-8111-111111111111";
const TASK="22222222-2222-4222-8222-222222222222";
const user={
  id:USER,email:"f0@fixture.invalid",aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-08T12:00:00Z"
};
const task={
  id:TASK,user_id:USER,titulo:"Validar descontos ao fechar pedido",codigo:"67866",
  tipo_teste:"BUILD",status:"em_teste",sistema:"Vendas",versao:"12.08",
  descricao:"Verificar os campos de desconto após alterações no pedido.",
  causa:"O cálculo anterior não incluía os itens desdobrados.",
  correcao:"Revisado o rateio de descontos.",publica:false
};
const scenarios=[
  {id:"33333333-3333-4333-8333-333333333333",tarefa_id:TASK,user_id:USER,
    titulo:"Concluir venda",ordem:1,passos:"Abrir venda e confirmar",esperado:"Venda concluída",
    status:"aprovado",obtido:"",observacoes:""},
  {id:"44444444-4444-4444-8444-444444444444",tarefa_id:TASK,user_id:USER,
    titulo:"Remover desconto",ordem:2,passos:"Abrir venda e retirar desconto",
    esperado:"Total recalculado",status:"nao_executado",obtido:"",observacoes:""}
];
const errors=[];
const writes=[];
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
};
async function mock(route){
  const request=route.request(),url=new URL(request.url());
  const path=url.pathname,method=request.method();
  const send=(value,status=200)=>route.fulfill({
    status,contentType:"application/json",headers:cors,body:JSON.stringify(value)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"f0-refresh",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(await mockF4Rpc(route,[task],scenarios))return;
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/qa_tarefas"))return send([task]);
  if(path.endsWith("/rest/v1/qa_cenarios"))return send(scenarios);
  if(path.endsWith("/rest/v1/qa_diagramas"))return send([]);
  if(path.endsWith("/rest/v1/qa_documentos"))return send([]);
  if(path.endsWith("/rest/v1/qa_requisitos"))return send([]);
  if(path.endsWith("/rest/v1/qa_requisito_fontes"))return send([]);
  if(path.endsWith("/rest/v1/qa_evidencias"))return send([]);
  if(path.endsWith("/rest/v1/qa_evidencia_arquivos"))return send([]);
  if(path.endsWith("/rest/v1/qa_eventos"))return send([]);
  if(method!=="GET")writes.push(method+" "+path);
  errors.push(method+" "+path);
  return send({message:"Unexpected synthetic endpoint"},500);
}
async function check(page,width,view){
  const data=await page.evaluate(()=>({
    document:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    body:document.body.scrollWidth-document.body.clientWidth
  }));
  assert.ok(data.document<=1,"Horizontal overflow "+view+" / "+width+": "+JSON.stringify(data));
  const axe=await page.evaluate(async()=>window.axe.run(document,{
    runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
    rules:{region:{enabled:false}}
  }));
  assert.deepEqual(axe.violations.map(v=>({
    rule:v.id,targets:v.nodes.slice(0,4).map(n=>n.target.join(" "))
  })),[],"WCAG "+view+" / "+width);
  await page.screenshot({path:"artifacts/f0-workspace/"+view+"-"+width+".png"});
}

mkdirSync("artifacts/f0-workspace",{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",e=>errors.push("PAGE "+e.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
  await page.goto(ROOT);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("fixture-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  await page.goto(ROOT+"#/tarefa/"+TASK);
  await page.getByRole("heading",{name:task.titulo}).waitFor({timeout:18000});
  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const summary=page.getByRole("tab",{name:"Visão geral"});
    await summary.click();
    assert.equal(await summary.getAttribute("aria-selected"),"true");
    await page.getByRole("heading",{name:"Informações da TF"}).waitFor();
    assert.equal(await page.getByRole("tabpanel",{name:"Visão geral"}).isVisible(),true);
    assert.equal(await page.getByRole("tabpanel",{name:"Cenários"}).isVisible(),false);
    assert.equal(await page.getByRole("tabpanel",{name:"Relatórios e posts"}).isVisible(),false);
    assert.equal(await page.getByRole("tabpanel",{name:"Arquivos e requisitos"}).isVisible(),false);
    assert.equal(await page.getByRole("button",{name:"Abrir ações rápidas da TF"}).count(),0,
      "The duplicate floating action menu must be removed");
    await check(page,width,"geral");

    await page.getByRole("tab",{name:"Cenários"}).click();
    await page.getByRole("button",{name:"Lista"}).click();
    assert.equal(await page.getByRole("tabpanel",{name:"Cenários"})
      .getByRole("group",{name:"Resultado de Remover desconto"}).count(),1);
    assert.equal(await page.getByRole("button",{name:"Cenário",exact:true}).count(),1);
    await check(page,width,"cenarios");

    await page.getByRole("tab",{name:"Relatórios e posts"}).click();
    await page.getByRole("heading",{name:"Indicadores da execução"}).waitFor();
    const actions=page.getByRole("group",{name:"Criar relatórios e publicações"});
    assert.equal(await actions.getByRole("button",{name:"Gerar post"}).count(),1);
    assert.equal(await actions.getByRole("button",{name:"Criar relatório"}).count(),1);
    assert.equal(await actions.getByRole("button",{name:"Criar diagrama"}).count(),1);
    assert.equal(await page.locator(".qa-task-results-legend").locator("div").count(),4);
    assert.equal(await page.getByRole("tabpanel",{name:"Relatórios e posts"})
      .getByRole("button",{name:"Novo diagrama"}).count(),0,
      "Creation must only appear in the report toolbar, not again in the gallery");
    await check(page,width,"relatorios");

    await page.getByRole("tab",{name:"Arquivos e requisitos"}).click();
    const resources=page.getByRole("tablist",{name:"Documentos e informações de apoio"});
    assert.equal(await resources.getByRole("tab").count(),4);
    await page.getByRole("heading",{name:"Requisitos e cobertura"}).waitFor();
    await check(page,width,"arquivos");
  }

  await page.setViewportSize({width:390,height:844});
  await page.getByRole("tab",{name:"Visão geral"}).click();
  await page.getByRole("tab",{name:"Visão geral"}).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab",{name:"Cenários"}).getAttribute("aria-selected"),"true");
  await page.keyboard.press("End");
  assert.equal(await page.getByRole("tab",{name:"Arquivos e requisitos"})
    .getAttribute("aria-selected"),"true");
  await page.keyboard.press("Home");
  assert.equal(await page.getByRole("tab",{name:"Visão geral"}).getAttribute("aria-selected"),"true");

  await page.getByRole("tab",{name:"Relatórios e posts"}).click();
  await page.getByRole("group",{name:"Criar relatórios e publicações"})
    .getByRole("button",{name:"Gerar post"}).click();
  await page.getByRole("dialog",{name:"Gerar post com IA"}).waitFor({timeout:20000});
  assert.equal(await page.getByRole("navigation",{name:"Ferramentas da central de IA"}).count(),0,
    "Cross-linked AI tools are no longer duplicated inside each creation modal");
  assert.equal(writes.length,0,"Opening a report cannot write data");
  await page.getByRole("button",{name:"Fechar Gerar post com IA"}).click();

  // Follow the application's real one-shot continuation link.
  await page.goto(ROOT);
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor();
  await page.getByRole("link",{name:"Continuar testes"}).click();
  await page.getByRole("tab",{name:"Cenários"}).waitFor({state:"visible"});
  await page.waitForFunction(()=>document.activeElement?.getAttribute("data-qa-guided-primary")==="true");
  assert.equal(await page.getByRole("tab",{name:"Cenários"}).getAttribute("aria-selected"),"true");
  assert.equal(writes.length,0,"Resume must not execute scenarios");
  assert.deepEqual(errors,[]);
  console.log("Task v2: four distinct tabs, real result metrics, no duplicate actions, WCAG, keyboard tabs and guided resume.");
}finally{await browser.close();}
