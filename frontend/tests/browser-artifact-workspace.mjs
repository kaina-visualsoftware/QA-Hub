import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
import {mockF4Rpc} from "./f4-mock-rpc.mjs";

const ROOT="http://127.0.0.1:4173/QA-Hub/";
const USER="11111111-1111-4111-8111-111111111111";
const TASK="22222222-2222-4222-8222-222222222222";
const user={id:USER,email:"quick-tools@fixture.invalid",aud:"authenticated",
  role:"authenticated",app_metadata:{provider:"email",providers:["email"]},
  user_metadata:{},created_at:"2026-11-08T10:00:00Z"};
const task={id:TASK,user_id:USER,titulo:"Correção de descontos",codigo:"QA-199",
  status:"em_teste",tipo_teste:"BUILD",sistema:"Financeiro",versao:"12.08",
  descricao:"Validar a remoção do desconto em pagamentos.",publica:false,
  created_at:"2026-11-08T10:00:00Z",executado_em:"2026-11-08"};
const cases=[{id:"44444444-4444-4444-8444-444444444444",tarefa_id:TASK,
  user_id:USER,titulo:"Conferir desconto",passos:"Abrir pedido",esperado:"Total correto",
  observacoes:"",status:"nao_executado",obtido:"",ordem:1}];
const diagrams=[{id:"55555555-5555-4555-8555-555555555555",tarefa_id:TASK,user_id:USER,
  titulo:"Fluxo de descontos",conteudo:"flowchart LR\n A[Pedido] --> B[Conferir desconto]"}];
const documents=[{id:"66666666-6666-4666-8666-666666666666",tarefa_id:TASK,
  tipo:"post",titulo:"Post de homologação",conteudo:"# Resultado\nTeste concluído.",
  versao:1,created_at:"2026-11-08T11:00:00Z"}];
const problems=[],writes=[];
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
};
async function mock(route){
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const send=(data,status=200)=>route.fulfill({
    status,contentType:"application/json",headers:cors,body:JSON.stringify(data)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"fixture",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(await mockF4Rpc(route,[task],cases))return;
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/qa_tarefas"))return send([task]);
  if(path.endsWith("/rest/v1/qa_cenarios"))return send(cases);
  if(path.endsWith("/rest/v1/qa_diagramas")){
    if(method==="GET")return send(diagrams);
    writes.push(method+" "+path);return send({message:"Writes not permitted in this test"},500);
  }
  if(path.endsWith("/rest/v1/qa_documentos"))return send(documents);
  if(path.endsWith("/rest/v1/qa_requisitos"))return send([]);
  if(path.endsWith("/rest/v1/qa_evidencia_arquivos"))return send([]);
  problems.push(method+" "+path);return send({message:"Unexpected API"},500);
}

mkdirSync("artifacts/artifact-workspace",{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",err=>problems.push("PAGE: "+err.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
  await page.goto(ROOT);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("fixture");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  await page.goto(ROOT+"#/tarefa/"+TASK);
  await page.getByRole("heading",{name:task.titulo}).waitFor({timeout:18000});
  assert.equal(await page.getByRole("region",{name:"Fluxo rápido de QA"}).count(),0,
    "No large grid of create actions on summary");
  assert.equal(await page.getByRole("heading",{name:"Execução registrada"}).count(),0);
  await page.getByRole("heading",{name:"Sobre esta TF"}).waitFor();

  const fab=page.locator(".qa-task-fab-trigger");
  await fab.click();
  const menu=page.getByRole("group",{name:"Ações rápidas da TF"});
  await menu.waitFor();
  assert.equal(await fab.getAttribute("aria-expanded"),"true");
  assert.equal(await menu.getByRole("button",{name:"Novo cenário"}).count(),1);
  await page.keyboard.press("Escape");
  assert.equal(await fab.getAttribute("aria-expanded"),"false");
  assert.equal(await menu.count(),0);

  await fab.click();
  assert.equal(await menu.getByRole("button",{name:"Gerar relatório"}).count(),1);
  assert.equal(await menu.getByRole("button",{name:"Histórico de execuções"}).count(),1);
  await menu.getByRole("button",{name:"Posts e relatórios salvos"}).click();
  const deliverables=page.getByRole("tabpanel",{name:"Entregáveis"});
  await deliverables.waitFor();
  assert.equal(await page.getByRole("dialog").count(),0,
    "Quick view of posts and reports must not open an editor");
  assert.equal(await deliverables.locator(".qa-deliverables-group").count(),0,
    "Do not duplicate creation grids alongside saved artifact galleries");
  await fab.click();
  await menu.getByRole("button",{name:"Visualizar diagramas"}).click();
  const gallery=deliverables.locator(".qa-artifact-browser").first();
  await gallery.getByRole("heading",{name:/Diagramas/}).waitFor();
  await gallery.getByText("Fluxo de descontos").waitFor();
  assert.equal(await gallery.getByRole("textbox",{name:"Código Mermaid"}).count(),0);
  assert.equal(await page.getByRole("dialog").count(),0,
    "Read-only diagram browsing must never open the creation modal");
  await gallery.getByRole("button",{name:"Visualizar"}).click();
  const diagramFrame=gallery.locator('iframe[title="Diagrama: Fluxo de descontos"]');
  await diagramFrame.waitFor({timeout:25000});
  await page.waitForFunction(()=>Boolean(document.querySelector(
    'iframe[title="Diagrama: Fluxo de descontos"]')?.getAttribute("srcdoc")),null,
    {timeout:25000});
  assert.equal(await diagramFrame.getAttribute("sandbox"),"",
    "Saved diagrams must be sandboxed");
  const initialFrame=await diagramFrame.getAttribute("srcdoc");
  assert.match(initialFrame,/default-src 'none'/,
    "Preview must forbid external scripts and network resources");
  const preview=gallery.locator(".qa-diagram-library-preview");
  await preview.getByRole("button",{name:"Aumentar zoom"}).click();
  await preview.getByText("125%").waitFor();
  await preview.getByRole("button",{name:"Ajustar à largura"}).click();
  await preview.getByText("100%").waitFor();
  await preview.getByRole("button",{name:"Abrir visualização ampliada"}).click();
  const expanded=page.getByRole("dialog",{name:"Visualizar diagrama — Fluxo de descontos"});
  await expanded.waitFor();
  await expanded.getByRole("button",{name:"Aumentar zoom"}).click();
  await expanded.getByText("125%").waitFor();
  assert.equal(await expanded.locator('iframe[title="Diagrama: Fluxo de descontos"]')
    .getAttribute("sandbox"),"",
    "Expanded diagram must retain strict sandbox");
  await page.getByRole("button",{name:"Fechar Visualizar diagrama — Fluxo de descontos"}).click();
  assert.equal(await page.getByRole("dialog").count(),0,
    "Closing expanded viewer must not open an editor");

  const posts=deliverables.locator(".qa-artifact-browser").nth(1);
  await posts.getByText("Post de homologação").waitFor();
  await posts.getByRole("button",{name:"Visualizar"}).click();
  await posts.getByRole("heading",{name:"Post de homologação"}).waitFor();
  assert.match(await posts.locator("pre").innerText(),/Teste concluído/);
  assert.equal(await posts.getByRole("textbox",{name:"Prévia do relatório"}).count(),0,
    "Reading a saved document must not mount a report editor");

  await gallery.getByRole("button",{name:"Editar"}).click();
  const editor=page.getByRole("dialog",{name:"Editar diagrama"});
  await editor.waitFor();
  const title=editor.getByRole("textbox",{name:"Título do diagrama"});
  await title.waitFor({state:"visible",timeout:20000});
  assert.equal(await title.inputValue(),"Fluxo de descontos");
  assert.match(await editor.getByRole("textbox",{name:"Código Mermaid"}).inputValue(),
    /Conferir desconto/);
  await page.getByRole("button",{name:"Fechar Editar diagrama"}).click();
  assert.equal(await page.getByRole("dialog").count(),0);

  await gallery.getByRole("button",{name:"Novo diagrama"}).click();
  const create=page.getByRole("dialog",{name:"Criar diagrama"});
  await create.waitFor();
  assert.equal(await create.getByRole("textbox",{name:"Título do diagrama"}).count(),0,
    "New diagram starts in a dedicated generator, not in saved detail viewer");
  await page.getByRole("button",{name:"Fechar Criar diagrama"}).click();

  await posts.getByRole("button",{name:"Criar relatório"}).click();
  const report=page.getByRole("dialog",{name:"Documentos e relatório"});
  await report.getByRole("heading",{name:"Criar relatório"}).waitFor();
  assert.equal(await report.getByText("Post de homologação").count(),0,
    "Report editor must not contain saved document list");
  await page.getByRole("button",{name:"Fechar Documentos e relatório"}).click();

  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,"Artifact browsing overflow "+width);
    const axe=await page.evaluate(async()=>window.axe.run(document,{
      runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
      rules:{region:{enabled:false}}
    }));
    assert.deepEqual(axe.violations.map(v=>({
      id:v.id,targets:v.nodes.slice(0,3).map(node=>node.target.join(" "))
    })),[],"Artifact browsing WCAG "+width);
    await page.screenshot({path:"artifacts/artifact-workspace/deliverables-"+width+".png"});
  }
  assert.deepEqual(writes,[],"Browsing must never write anything");
  assert.deepEqual(problems,[],"No unexpected calls or page errors");
  console.log("TF: FAB com teclado, galerias read-only, editor separado, 320–1366, WCAG.");
}finally{await browser.close();}
