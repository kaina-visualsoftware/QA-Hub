import assert from "node:assert/strict";
import { chromium } from "playwright";

const root="http://127.0.0.1:4173/QA-Hub/";
const owner="11111111-1111-4111-8111-111111111111";
const taskId="22222222-2222-4222-8222-222222222222";
const user={
  id:owner,email:"ai-diagrams@fixture.invalid",aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-07T10:00:00Z"
};
const task={
  id:taskId,user_id:owner,titulo:"Validar desconto no pedido",codigo:"78912",
  descricao:"Recalcular totais quando o desconto é removido.",
  tipo_teste:"BUILD",status:"em_teste",sistema:"Vendas",versao:"12.00",
  executado_em:"2026-11-07",publica:false,causa:"O rateio não atualizava o total."
};
const scenario={
  id:"33333333-3333-4333-8333-333333333333",tarefa_id:taskId,user_id:owner,
  titulo:"Remover desconto",ordem:1,status:"nao_executado",obtido:"",
  passos:"Abrir o pedido",esperado:"Valor recalculado",observacoes:""
};
const diagrams=[];
const errors=[];
const prompts=[];
let diagramSaves=0,taskWrites=0,scenarioWrites=0;
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
};
async function fakeBackend(route){
  const request=route.request(),url=new URL(request.url());
  const path=url.pathname,method=request.method();
  const send=(body,status=200)=>route.fulfill({
    status,headers:cors,contentType:"application/json",body:JSON.stringify(body)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"fixture-refresh",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/qa_tarefas")){
    if(method!=="GET")taskWrites++;
    return send([task]);
  }
  if(path.endsWith("/rest/v1/qa_cenarios")){
    if(method!=="GET")scenarioWrites++;
    return send([scenario]);
  }
  if(path.endsWith("/rest/v1/qa_requisitos")||
    path.endsWith("/rest/v1/qa_documentos")||
    path.endsWith("/rest/v1/qa_evidencias")||
    path.endsWith("/rest/v1/qa_eventos")||
    path.endsWith("/rest/v1/qa_requisito_revisoes")||
    path.endsWith("/rest/v1/qa_requisito_fontes"))return send([]);
  if(path.endsWith("/rest/v1/qa_diagramas")){
    if(method==="GET")return send(diagrams);
    if(method==="POST"){
      const body=request.postDataJSON();
      assert.equal(body.tarefa_id,taskId);
      assert.equal(body.user_id,owner);
      assert.ok(body.conteudo.startsWith("flowchart LR"));
      assert.ok(body.conteudo.includes("Validação"));
      diagramSaves++;
      diagrams.push({
        ...body,id:"44444444-4444-4444-8444-444444444444"
      });
      return send(null,201);
    }
    throw Error("Unexpected diagram mutation");
  }
  if(path.endsWith("/functions/v1/qa-ai")){
    assert.equal(method,"POST");
    const body=request.postDataJSON();
    assert.equal(body.mode,"diagram");
    assert.ok(body.text.includes("Dados do processo")||body.text.includes("DADOS DO PROCESSO"));
    assert.ok(body.text.includes("Iniciar conferência"));
    prompts.push(body);
    return send({mermaid:"flowchart TD\n A[Início] --> B[Validação] --> C[Fim]",provider:"NVIDIA Build"});
  }
  errors.push(method+" "+path);
  return send({message:"Synthetic API not available"},500);
}
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",error=>errors.push("PAGE "+error.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",fakeBackend);
  await page.goto(root);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("fixture-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  await page.goto(root+"#/tarefa/"+taskId);
  await page.getByRole("heading",{name:task.titulo}).waitFor({timeout:20000});
  const fast=page.getByRole("region",{name:"Fluxo rápido de QA"});
  assert.equal(await fast.getByRole("button",{name:"Gerar casos com IA"}).count(),1);
  assert.equal(await fast.getByRole("button",{name:"Gerar post com IA"}).count(),1);
  assert.equal(await fast.getByRole("button",{name:"Gerar diagrama com IA"}).count(),1);
  await fast.getByRole("button",{name:"Gerar post com IA"}).click();
  await page.getByRole("heading",{name:"Gerar post técnico"}).waitFor({timeout:20000});
  await fast.getByRole("button",{name:"Gerar casos com IA"}).click();
  await page.getByRole("heading",{name:"Gerar casos de teste"}).waitFor();
  await fast.getByRole("button",{name:"Gerar diagrama com IA"}).click();
  await page.getByRole("heading",{name:"Criar diagrama com IA"}).waitFor();
  await page.waitForFunction(()=>document.activeElement?.id==="diagram-ai-heading");
  assert.equal(prompts.length,0,"Opening IA does not send TF data automatically");

  await page.getByRole("radio",{name:"Texto livre"}).check();
  await page.getByRole("textbox",{name:"Descreva o processo"}).fill("Iniciar conferência, verificar dados e concluir.");
  assert.equal(await page.getByRole("button",{name:"Gerar fluxograma com IA"}).isDisabled(),true);
  await page.getByRole("checkbox",{name:/Autorizo enviar este texto à NVIDIA/}).check();
  await page.getByRole("button",{name:"Gerar fluxograma com IA"}).click();
  await page.getByRole("textbox",{name:"Código Mermaid"}).waitFor({timeout:20000});
  await page.waitForFunction(()=>{
    const code=document.getElementById("diagram-code-editor");
    return code?.value?.includes("Validação");
  },{timeout:20000});
  const code=await page.getByRole("textbox",{name:"Código Mermaid"}).inputValue();
  assert.ok(code.startsWith("flowchart LR"),"Diagram should be normalized to horizontal layout");
  assert.equal(prompts.length,1);
  assert.equal(diagrams.length,0,"Generated diagrams must not be saved without confirmation");
  assert.equal(taskWrites,0);
  assert.equal(scenarioWrites,0);

  await page.getByRole("button",{name:"Salvar diagrama"}).click();
  await page.getByText("Diagrama salvo.",{exact:true}).waitFor({timeout:10000});
  assert.equal(diagramSaves,1);
  assert.equal(diagrams.length,1);
  assert.equal(task.status,"em_teste","Generating/saving a diagram never approves a TF");
  const overflow=await page.evaluate(()=>
    document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,"AI workbench must fit 390px mobile viewport");
  assert.deepEqual(errors,[],"Unexpected synthetic backend requests or script errors");
  console.log("AI workbench: visible post/test/diagram actions, consent, safe Mermaid draft, explicit save and mobile.");
}finally{await browser.close();}
