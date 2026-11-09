import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = "http://127.0.0.1:4173/QA-Hub/";
const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const ownTaskId = "33333333-3333-4333-8333-333333333333";
const otherTaskId = "44444444-4444-4444-8444-444444444444";
const user = {
  id:userId, email:"test@fixture.invalid", aud:"authenticated", role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-06T12:00:00Z"
};
const tasks = [{
  id:ownTaskId,user_id:userId,titulo:"Revisão de pagamentos",codigo:"67866",
  tipo_teste:"BUILD",status:"rascunho",sistema:"Financeiro",versao:"12.00",
  descricao:"Desconto em pagamentos",publica:false,executado_em:"2026-11-06",
  updated_at:"2026-11-06T12:00:00Z"
}, {
  id:otherTaskId,user_id:otherId,titulo:"TF de outra conta",codigo:"98765",
  tipo_teste:"RELEASE",status:"aprovado",sistema:"Estoque",versao:"12.01",
  descricao:"Regra de estoque",publica:true,executado_em:"2026-11-06",
  updated_at:"2026-11-06T12:00:00Z"
}];
let publicationCalls=0, adminListCalls=0, guestScenarioReads=0, publicRpcReads=0;
const errors=[];
const browser=await chromium.launch({headless:true});
function responder({admin=false}={}){
 return async (route)=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const headers={
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
    "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
  };
  const send=(data,status=200)=>route.fulfill({
    status,headers,contentType:"application/json",body:JSON.stringify(data)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"synthetic-refresh",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(await mockF4Rpc(route,tasks,[]))return;
  if(path.endsWith("/rest/v1/qa_admins"))return send(admin?{user_id:userId}:null);
  if(path.endsWith("/rest/v1/rpc/qa_public_tasks_v1")) {
    publicRpcReads++;
    assert.equal(method,"POST","Public list must use the allowlisted RPC");
    return send(tasks.filter((item)=>item.publica).map((item)=>({
      id:item.id,titulo:item.titulo,codigo:item.codigo,
      tipo_teste:item.tipo_teste,sistema:item.sistema,versao:item.versao,
      executado_em:item.executado_em
    })));
  }
  if(path.endsWith("/rest/v1/rpc/qa_public_task_v1")) {
    publicRpcReads++;
    assert.equal(method,"POST","Public detail must use the allowlisted RPC");
    const id=req.postDataJSON()?.p_task_id;
    const item=tasks.find((task)=>task.id===id&&task.publica);
    if(!item)return send(null);
    const {id:taskId,titulo,codigo,tipo_teste,sistema,versao,executado_em,
      status,descricao,explicacao,causa,correcao,conclusao,observacoes}=item;
    return send({task:{id:taskId,titulo,codigo,tipo_teste,sistema,versao,
      executado_em,status,descricao,explicacao,causa,correcao,conclusao,
      observacoes},scenarios:[],diagrams:[]});
  }
  if(path.endsWith("/rest/v1/qa_tarefas")) {
    if(method==="PATCH"){
      publicationCalls++;
      assert.equal(url.searchParams.get("user_id"),"eq."+userId,
        "Publication updates must be scoped to owner");
      const id=url.searchParams.get("id")?.replace("eq.","");
      assert.equal(id,ownTaskId);
      const changes=req.postDataJSON();
      assert.equal(Object.keys(changes).includes("user_id"),false);
      Object.assign(tasks[0],changes);
      return send({id:ownTaskId,publica:tasks[0].publica});
    }
    const query=url.searchParams;
    assert.equal(query.has("publica"),false,
      "Public visitors must not read base table rows with publica=true");
    const owner=query.get("user_id");
    if(owner) {
      assert.equal(owner,"eq."+userId);
      return send(tasks.filter((item)=>item.user_id===userId));
    }
    if(!admin)errors.push("Normal user attempted privileged task read");
    else adminListCalls++;
    return send(admin?tasks:tasks.filter((item)=>item.user_id===userId));
  }
  if(path.endsWith("/rest/v1/qa_cenarios")) {
    guestScenarioReads++;
    return send([]);
  }
  if(path.endsWith("/rest/v1/qa_diagramas"))return send([]);
  errors.push("Unexpected API: "+method+" "+path);
  return send({message:"Unexpected fixture route"},500);
 };
}
async function waitForReview(page, phase) {
  try {
    await page.getByRole("heading",{name:"Conferir campos identificados"}).waitFor({timeout:20000});
  } catch (error) {
    const state=await page.evaluate(()=>({
      hash:location.hash,
      formVisible:!!document.querySelector('textarea[name="descricao"]'),
      descriptionLength:document.querySelector('textarea[name="descricao"]')?.value?.length ?? null,
      notices:[...document.querySelectorAll('[role="status"],[role="alert"]')]
        .map(element=>(element.textContent||"").trim().slice(0,180))
        .filter(Boolean)
        .slice(0,5)
    }));
    throw new Error(phase+" preview missing: "+String(error)+
      " / state="+JSON.stringify(state));
  }
}

try{
  const guest=await browser.newPage({viewport:{width:390,height:844}});
  guest.on("pageerror",e=>errors.push("Guest: "+e.message));
  await guest.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",responder());
  await guest.goto(origin+"#/publicas");
  await guest.getByRole("heading",{name:"TFs públicas"}).waitFor({timeout:20000});
  const skip=guest.getByRole("button",{name:"Pular para o conteúdo"});
  await skip.focus();
  await skip.press("Enter");
  assert.equal(await guest.evaluate(()=>document.activeElement?.id),"public-content");
  assert.match(guest.url(),/#\/publicas$/,"Skip link cannot corrupt the hash route");
  const mobileOverflow=await guest.evaluate(()=>
    document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(mobileOverflow<=1,"Public library must not overflow at 390px");
  await guest.getByText("TF de outra conta").waitFor();
  assert.equal(await guest.getByText("Revisão de pagamentos").count(),0);
  await guest.getByText("TF de outra conta").click();
  await guest.getByRole("heading",{name:"TF de outra conta"}).waitFor();
  await guest.getByRole("heading",{name:"Cenários de teste"}).waitFor();
  await guest.goto(origin+"#/publicas?tf="+ownTaskId);
  await guest.getByText("Esta TF não é pública ou não existe.").waitFor();
  assert.equal(guestScenarioReads,0,"Public API must not read direct scenario tables");

  const normal=await browser.newPage({viewport:{width:1366,height:768}});
  normal.on("pageerror",e=>errors.push("Normal: "+e.message));
  await normal.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",responder());
  await normal.goto(origin);
  await normal.getByRole("textbox",{name:"Email"}).fill("test@fixture.invalid");
  await normal.getByLabel("Senha").fill("synthetic-password");
  await normal.getByRole("button",{name:"Entrar",exact:true}).click();
  await normal.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  await normal.getByRole("button",{name:"Nova TF"}).click();
  await normal.getByLabel("Descrição / problema").fill([
    "TF #67866",
    "TÍTULO: Atualização de descontos negativos",
    "TIPO DE TESTE: [X] BUILD [ ] RELEASE",
    "VERSÃO: 12.08.08.0000",
    "O QUE FOI TESTADO:",
    "Remover desconto gravado em pedido.",
    "CENÁRIO 1 — Remover desconto do pedido",
    "PASSOS:",
    "- Abrir pedido 67866",
    "RESULTADO ESPERADO: O desconto deve zerar."
  ].join("\n"));
  await normal.getByRole("button",{name:"Extrair sem IA"}).click();
  await waitForReview(normal,"Deterministic extraction");
  assert.equal(await normal.getByRole("checkbox",{name:/Remover desconto do pedido/}).isChecked(),false,
    "Extração local não pode anexar cenários por padrão");
  await normal.getByRole("button",{name:"Aplicar campos revisados"}).click();
  assert.equal(await normal.getByLabel("Título da tarefa").inputValue(),
    "Atualização de descontos negativos");
  assert.equal(await normal.getByLabel("Código da TF").inputValue(),"67866");
  assert.equal(await normal.getByRole("button",{name:"Analisar com IA local"}).count(),0,
    "New TF must not offer a generative local model");
  assert.equal(await normal.getByText("Assistente local avançado (opcional)").count(),0);
  assert.equal(await normal.getByRole("button",{name:"Gerar com IA NVIDIA"}).isDisabled(),true,
    "NVIDIA must require explicit consent to the current text");
  await normal.getByText("Mais opções").click();
  assert.equal(await normal.getByRole("textbox",{name:"Versão",exact:true}).inputValue(),"12.08.08.0000");
  await normal.getByRole("button",{name:"Cancelar",exact:true}).click();
  await normal.goto(origin+"#/admin");
  await normal.getByRole("heading",{name:"Acesso restrito"}).waitFor();
  await normal.goto(origin+"#/tarefa/"+ownTaskId);
  await normal.getByRole("heading",{name:"Revisão de pagamentos"}).waitFor();
  await normal.getByRole("button",{name:"Configurações da TF"}).click();
  const publish=normal.getByRole("button",{name:"Publicar TF"});
  assert.equal(publicationCalls,0);
  normal.once("dialog",d=>void d.accept());
  await publish.click();
  await normal.getByText("TF publicada por sua confirmação.").waitFor();
  assert.equal(publicationCalls,1);
  assert.equal(tasks[0].publica,true);
  await normal.getByRole("link",{name:"Abrir visão pública"}).click();
  await normal.getByRole("heading",{name:"Revisão de pagamentos"}).waitFor();
  await normal.goto(origin+"#/tarefa/"+ownTaskId);
  await normal.getByRole("button",{name:"Configurações da TF"}).click();
  const unpublish=normal.getByRole("button",{name:"Retirar publicação"});
  normal.once("dialog",d=>void d.accept());
  await unpublish.click();
  await normal.getByText("Publicação desativada.").waitFor();
  assert.equal(publicationCalls,2);
  assert.equal(tasks[0].publica,false);

  const elevated=await browser.newPage({viewport:{width:1280,height:768}});
  elevated.on("pageerror",e=>errors.push("Admin: "+e.message));
  await elevated.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",responder({admin:true}));
  await elevated.goto(origin+"#/admin");
  await elevated.getByRole("heading",{name:"Entrar"}).waitFor();
  await elevated.getByRole("textbox",{name:"Email"}).fill("test@fixture.invalid");
  await elevated.getByLabel("Senha").fill("synthetic-password");
  await elevated.getByRole("button",{name:"Entrar",exact:true}).click();
  await elevated.getByRole("heading",{name:"Painel administrativo"}).waitFor({timeout:20000});
  await elevated.getByText("TF de outra conta").waitFor();
  assert.ok(adminListCalls>=1,"Admin read should happen only after server-confirmed role");
  await elevated.getByRole("combobox",{name:"Filtrar por autor"}).selectOption("mine");
  assert.equal(await elevated.getByText("TF de outra conta").count(),0);
  await elevated.getByRole("combobox",{name:"Filtrar por autor"}).selectOption("others");
  await elevated.getByText("TF de outra conta").waitFor();
  assert.ok(publicRpcReads>=4,"Published reads must use allowlisted RPCs");
  assert.deepEqual(errors,[]);
  console.log("E2E de acesso: visitante anônimo, publicação/despublicação explícita, usuário não-admin e administrador verificado.");
}finally{await browser.close()}
