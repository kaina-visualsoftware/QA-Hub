import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
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
  if(await mockF4Rpc(route,[task],[scenario]))return;
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
    path.endsWith("/rest/v1/qa_evidencia_arquivos")||
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
    if(body.mermaid){
      assert.match(body.mermaid,/flowchart LR/);
      assert.ok(body.syntaxError?.length>0,"Repair must include parser diagnosis");
      return send({mermaid:'flowchart LR\n A["Início"]\n B["Validação recuperada"]\n A --> B',
        provider:"NVIDIA Build"});
    }
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
  mkdirSync("artifacts/mobile-ux",{recursive:true});
  const sizes=[320,390,768,1366];
  for(const width of sizes){
    await page.setViewportSize({width,height:844});
    const layout=await page.evaluate(()=>{
      const shell=document.querySelector(".app-shell");
      return {
        overflow:document.documentElement.scrollWidth-innerWidth,
        hero:document.querySelector(".qa-task-hero")?.getBoundingClientRect().width,
        shell:shell?.getBoundingClientRect().width
      };
    });
    assert.ok(layout.overflow<=1, "Task layout overflow at "+width+": "+JSON.stringify(layout));
    if(width<=390){
      assert.equal(await page.getByRole("link",{name:"TFs públicas"}).isVisible(),true);
      assert.equal(await page.getByRole("button",{name:"Sair"}).isVisible(),true);
    }
    await page.screenshot({path:"artifacts/mobile-ux/tf-"+width+".png"});
  }
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.getByRole("button",{name:"Abrir ações rápidas da TF"}).count(),0,
    "Duplicate floating task menu must be removed");
  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  for(const mode of ["Post","Casos"]){
    if(mode==="Post"){
      await page.getByRole("tab",{name:"Relatórios e posts"}).click();
      const deliverables=page.getByRole("tabpanel",{name:"Relatórios e posts"});
      assert.equal(await deliverables.getByRole("button",{name:"Gerar post"}).count(),1);
      await deliverables.getByRole("button",{name:"Gerar post"}).click();
      await page.getByRole("heading",{name:"Gerar post técnico"}).waitFor({timeout:20000});
      const modal=page.locator(".qa-modal-surface-post");
      await modal.waitFor();
      assert.equal(await modal.locator(".qa-post-steps li").count(),3);
      assert.equal(await modal.locator(".qa-post-configuration").count(),1);
      assert.equal(await modal.locator(".qa-post-empty-preview").count(),1,
        "The initial post modal should show an empty review panel, not an editor full of placeholders");
      assert.equal(await modal.getByRole("checkbox",{name:/Autorizo enviar/}).count(),1);
    }else{
      await page.getByRole("tab",{name:"Cenários"}).click();
      await page.getByRole("button",{name:"Gerar casos"}).click();
      await page.getByRole("heading",{name:"Gerar casos de teste"}).waitFor();
    }
    assert.equal(await page.getByRole("navigation",{name:"Ferramentas da central de IA"}).count(),0,
      "AI tool navigation must not be duplicated inside each modal");
    for(const width of [320,390,768,1366]){
      await page.setViewportSize({width,height:844});
      const layout=await page.evaluate(()=>{
        const modal=[...document.querySelectorAll(".qa-modal")]
          .find(element=>element.getClientRects().length>0);
        const content=modal?.querySelector(".qa-modal-content");
        return {
          page:document.documentElement.scrollWidth-innerWidth,
          content:content?.scrollWidth-content?.clientWidth
        };
      });
      assert.ok(layout.page<=1&&layout.content<=1,
        "AI "+mode+" overflows at "+width+": "+JSON.stringify(layout));
      if(width===320||width===390||width===1366){
        const audit=await page.evaluate(async()=>window.axe.run(document,{
          runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
          rules:{region:{enabled:false}}
        }));
        assert.deepEqual(audit.violations.map(v=>({
          id:v.id,targets:v.nodes.slice(0,3).map(n=>n.target.join(" "))
        })),[],"AI "+mode+" WCAG at "+width);
      }
      await page.screenshot({path:"artifacts/mobile-ux/f2-"+mode+"-"+width+".png"});
    }
    await page.getByRole("button",{name:mode==="Post"?
      "Fechar Gerar post com IA":"Fechar Gerar casos com IA"}).click();
  }
  await page.getByRole("tab",{name:"Relatórios e posts"}).click();
  await page.getByRole("group",{name:"Criar relatórios e publicações"})
    .getByRole("button",{name:"Criar diagrama"}).click();
  await page.getByRole("heading",{name:"Criar diagrama com IA"}).waitFor();
  const diagramModal=page.locator(".qa-modal-surface-diagram");
  await diagramModal.waitFor();
  assert.equal(await diagramModal.locator(".qa-diagram-stage-track li").count(),3,
    "Full-TF diagram creation must show context, summary and generation stages");
  assert.equal(await diagramModal.getByRole("button",{name:"Resumir TF com IA"}).count(),1);
  await page.waitForFunction(()=>document.activeElement?.id==="diagram-ai-heading");
  assert.equal(prompts.length,0,"Opening IA does not send TF data automatically");
  assert.equal(await page.getByRole("textbox",{name:"Código Mermaid"}).count(),0,
    "Advanced Mermaid code must stay hidden before generation");
  for(const width of sizes){
    await page.setViewportSize({width,height:844});
    const layout=await page.evaluate(()=>{
      const modal=[...document.querySelectorAll(".qa-modal")]
        .find(element=>element.getClientRects().length>0);
      const content=modal?.querySelector(".qa-modal-content");
      const primary=[...modal?.querySelectorAll("button")??[]]
        .find(element=>element.textContent?.includes("Gerar diagrama"));
      return {
        documentOverflow:document.documentElement.scrollWidth-innerWidth,
        modalOverflow:content?content.scrollWidth-content.clientWidth:999,
        modalWidth:modal?.getBoundingClientRect().width,
        viewport:innerWidth,
        primaryHeight:primary?.getBoundingClientRect().height
      };
    });
    assert.ok(layout.documentOverflow<=1,"Document overflow at "+width+": "+JSON.stringify(layout));
    assert.ok(layout.modalOverflow<=1,"Modal content overflow at "+width+": "+JSON.stringify(layout));
    assert.ok((layout.primaryHeight??0)>=44,"CTA is too small at "+width+": "+JSON.stringify(layout));
    assert.ok((layout.modalWidth??0)<=width+1,"Modal outside viewport at "+width);
    if(width===320||width===390||width===1366){
      const audit=await page.evaluate(async()=>window.axe.run(document,{
        runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
        rules:{region:{enabled:false}}
      }));
      assert.deepEqual(audit.violations.map(v=>({
        id:v.id,targets:v.nodes.slice(0,3).map(n=>n.target.join(" "))
      })),[],"Diagram dialog violates WCAG at "+width);
    }
    await page.screenshot({path:"artifacts/mobile-ux/diagrama-"+width+".png"});
  }
  await page.setViewportSize({width:390,height:844});

  await page.getByRole("radio",{name:"Texto livre"}).check();
  await page.getByRole("textbox",{name:"Descreva o processo"}).fill("Iniciar conferência, verificar dados e concluir.");
  await page.getByRole("combobox",{name:"Modelo do diagrama"}).selectOption("decisoes");
  assert.equal(await page.getByRole("button",{name:"Gerar diagrama"}).isDisabled(),true);
  await page.getByRole("checkbox",{name:/Autorizo enviar este texto à NVIDIA/}).check();
  await page.getByRole("button",{name:"Gerar diagrama"}).click();
  await page.getByTitle("Visualização do diagrama Mermaid").waitFor({timeout:20000});
  assert.equal(await page.getByRole("textbox",{name:"Código Mermaid"}).count(),0,
    "Code editor must start collapsed in the quick flow");
  await page.waitForFunction(()=>{
    const code=document.getElementById("diagram-code-editor");
    return code?.value?.includes("Validação");
  },{timeout:20000});
  const code=await page.locator("#diagram-code-editor").inputValue();
  assert.ok(code.startsWith("flowchart LR"),"Diagram should be normalized to horizontal layout");
  assert.equal(prompts.length,1);
  assert.match(prompts[0].text,/Destaque condições, decisões e caminhos alternativos/i);
  assert.equal(diagrams.length,0,"Generated diagrams must not be saved without confirmation");
  assert.equal(await page.getByRole("button",{name:"Salvar diagrama"}).isEnabled(),true);
  assert.equal(taskWrites,0);
  assert.equal(scenarioWrites,0);

  await page.getByRole("button",{name:"Salvar diagrama"}).click();
  await page.getByText("Diagrama salvo.",{exact:true}).waitFor({timeout:10000});
  assert.equal(diagramSaves,1);
  assert.equal(diagrams.length,1);
  assert.equal(task.status,"em_teste","Generating/saving a diagram never approves a TF");

  // A user may paste broken Mermaid into the editor. Such code MUST NOT be
  // persisted; expose the real parser error and offer explicit AI repair.
  await page.getByText("Editar título ou código Mermaid").click();
  const codeEditor=page.getByRole("textbox",{name:"Código Mermaid"});
  await codeEditor.fill('flowchart LR\n A["Início"\n A --> B');
  await page.getByRole("button",{name:"Salvar diagrama"}).click();
  await page.getByRole("group",{name:"Erro de sintaxe Mermaid"})
    .getByRole("alert").waitFor({timeout:20000});
  assert.equal(diagramSaves,1,"Invalid Mermaid must never be saved");
  await page.getByRole("button",{name:"Ir para Corrigir com IA"}).click();
  await page.getByRole("button",{name:"Corrigir com IA",exact:true}).waitFor();
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"Corrigir com IA",exact:true}).click();
  await page.waitForFunction(()=>{
    const text=document.getElementById("diagram-code-editor");
    return text?.value?.includes("Validação recuperada");
  },{timeout:20000});
  assert.equal(prompts.length,2,"Repair requires a new explicit AI call");
  assert.ok(prompts[1].syntaxError.length>0);
  assert.equal(diagramSaves,1,"A corrected suggestion is still only an unsaved draft");
  await page.getByRole("button",{name:"Salvar diagrama"}).click();
  await page.getByText("Diagrama salvo.",{exact:true}).waitFor();
  assert.equal(diagramSaves,2,"Only corrected and confirmed Mermaid may be saved");

  // Retry is available without sending the invalid code or parser error.
  await page.getByRole("button",{name:"Alterar ou gerar novamente"}).click();
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"Gerar novamente",exact:true}).click();
  await page.waitForFunction(()=>{
    const text=document.getElementById("diagram-code-editor");
    return text?.value?.includes("Validação") && !text?.value?.includes("recuperada");
  },{timeout:20000});
  assert.equal(prompts.length,3);
  assert.equal(prompts[2].mermaid,undefined,"Fresh retry must not reuse a repair payload");
  assert.equal(diagramSaves,2,"Retry must not save anything");

  const overflow=await page.evaluate(()=>
    document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,"AI workbench must fit 390px mobile viewport");
  assert.deepEqual(errors,[],"Unexpected synthetic backend requests or script errors");
  console.log("AI workbench: visible post/test/diagram actions, consent, safe Mermaid draft, explicit save and mobile.");
}finally{await browser.close();}
