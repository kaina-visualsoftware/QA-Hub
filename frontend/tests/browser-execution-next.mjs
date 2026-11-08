import assert from "node:assert/strict";
import { chromium } from "playwright";

// The Supabase endpoints are fully intercepted. This does not write real QA data.
const root = "http://127.0.0.1:4173/QA-Hub/";
const userId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const user = {
  id:userId,email:"execution-flow@fixture.invalid",aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-07T12:00:00Z"
};
const task = {
  id:taskId,user_id:userId,titulo:"Execução progressiva",
  codigo:"QA-123",descricao:"Somente dados sintéticos",
  tipo_teste:"BUILD",status:"em_teste",sistema:"QA",versao:"1.0",
  publica:false,executado_em:"2026-11-07"
};
const scenarios = [
  {id:"33333333-3333-4333-8333-333333333333",titulo:"Primeira pendência",ordem:1,
    status:"nao_executado",obtido:""},
  {id:"44444444-4444-4444-8444-444444444444",titulo:"Segunda pendência",ordem:2,
    status:"nao_executado",obtido:""},
  {id:"55555555-5555-4555-8555-555555555555",titulo:"Falha antiga",ordem:3,
    status:"reprovado",obtido:"O desconto não foi removido."}
].map((item)=>({
  tarefa_id:taskId,user_id:userId,passos:"Abrir tela de fixture",
  esperado:"Comportamento correto",observacoes:"",...item
}));
const mutations = [],errors=[];
let failOnce=true;
const browser=await chromium.launch({headless:true});
async function mock(route) {
  const request=route.request(),url=new URL(request.url());
  const path=url.pathname,method=request.method();
  const headers={
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
    "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
  };
  const send=(body,status=200)=>route.fulfill({
    status,headers,contentType:"application/json",body:JSON.stringify(body)
  });
  if(method==="OPTIONS") return route.fulfill({status:204,headers});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"synthetic-refresh",token_type:"bearer",
    expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/qa_tarefas")&&method==="GET")return send([task]);
  if(path.endsWith("/rest/v1/qa_cenarios")) {
    if(method==="GET"){
      // Both the TaskPage scenario list (eq) and the home-page progress
      // query (in) may complete during route navigation.
      const constraint=url.searchParams.get("tarefa_id");
      assert.ok(constraint==="eq."+taskId||constraint==="in.("+taskId+")",
        "GET must remain scoped to the selected QA task: "+constraint);
      return send(scenarios);
    }
    if(method==="PATCH"){
      assert.equal(url.searchParams.get("tarefa_id"),"eq."+taskId);
      const id=url.searchParams.get("id")?.replace("eq.","");
      const target=scenarios.find(item=>item.id===id);
      assert.ok(target,"Patch must belong to the selected QA task");
      const update=request.postDataJSON();
      assert.equal(typeof update.updated_at,"string");
      assert.deepEqual(Object.keys(update).sort(),["obtido","status","updated_at"]);
      if(failOnce) {
        failOnce=false;
        return send({message:"Simulação de rede indisponível"},503);
      }
      mutations.push({id,status:update.status,obtido:update.obtido});
      target.status=update.status;
      target.obtido=update.obtido;
      return send({id},200);
    }
  }
  errors.push(method+" "+path);
  return send({message:"API inesperada"},500);
}
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",e=>errors.push("Page: "+e.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
  await page.goto(root);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("synthetic-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor();
  await page.goto(root+"#/tarefa/"+taskId);
  await page.getByRole("heading",{name:"Execução progressiva"}).waitFor();

  await page.getByRole("region",{name:"Fluxo rápido de QA"})
    .getByRole("button",{name:"Testar pendentes"}).click();
  // The historical list is still available for bulk review.
  await page.getByRole("button",{name:"Lista",exact:true}).click();
  await page.getByRole("button",{name:"Pendentes",exact:true}).click();
  const pendingActions = page.getByRole("group",{name:"Resultado de Primeira pendência"});
  await page.waitForFunction(()=>
    document.activeElement?.getAttribute("data-qa-next-pending")==="true");
  await pendingActions.getByRole("button",{name:"Funcionou",exact:true}).click();

  await page.getByRole("alert").getByText("Simulação de rede indisponível").waitFor();
  assert.equal(mutations.length,0,"Failed save must not register an execution");
  assert.equal(scenarios[0].status,"nao_executado");

  await pendingActions.getByRole("button",{name:"Funcionou",exact:true}).click();
  await page.getByRole("group",{name:"Resultado de Segunda pendência"}).waitFor();
  await page.waitForFunction(() => document.activeElement?.closest('[role="group"]')
    ?.getAttribute("aria-label")==="Resultado de Segunda pendência");
  assert.deepEqual(mutations[0],{
    id:scenarios[0].id,status:"aprovado",obtido:""
  },"Passing an unexecuted scenario must never fabricate an observed result");
  assert.equal(task.status,"em_teste","Scenario execution cannot auto-approve the TF");

  await page.getByRole("group",{name:"Resultado de Segunda pendência"})
    .getByRole("button",{name:"Funcionou",exact:true}).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-qa-filter")==="pending");
  assert.equal(await page.getByRole("group",{name:"Resultado de Segunda pendência"}).count(),0);
  assert.equal(mutations.length,2);

  await page.getByRole("button",{name:"Todos",exact:true}).click();
  const priorFailure=page.getByRole("group",{name:"Resultado de Falha antiga"})
    .getByRole("button",{name:"Funcionou",exact:true});
  page.once("dialog",dialog=>void dialog.dismiss());
  await priorFailure.click();
  assert.equal(mutations.length,2,"Canceling replacement must preserve the old observation");
  assert.equal(scenarios[2].obtido,"O desconto não foi removido.");

  page.once("dialog",dialog=>void dialog.accept());
  await priorFailure.click();
  await page.getByRole("status").getByText(/Execução registrada/).waitFor();
  assert.deepEqual(mutations[2],{
    id:scenarios[2].id,status:"aprovado",obtido:""
  },"Old failure explanation must not be shown as approved test observation");
  assert.equal(scenarios[2].obtido,"");
  assert.equal(task.status,"em_teste");
  assert.deepEqual(errors,[]);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=1,"Execution flow must work without horizontal overflow at 390px");
  console.log("Execução progressiva: erro de rede, próximo pendente, fim da fila, revisão de falha e TF inalterada.");
} finally {
  await browser.close();
}
