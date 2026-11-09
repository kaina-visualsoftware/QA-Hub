import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {readFile} from "node:fs/promises";

// Synthetic E2E only: all Supabase calls are intercepted. This fixture does
// not contain real accounts, task content or private documents.
const root="http://127.0.0.1:4173/QA-Hub/";
const userId="11111111-1111-4111-8111-111111111111";
const taskId="22222222-2222-4222-8222-222222222222";
const user={
  id:userId,email:"report-qa@fixture.invalid",aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-07T10:00:00Z"
};
const task={
  id:taskId,user_id:userId,titulo:"Descontos em homologação",codigo:"78912",
  descricao:"Dados sintéticos",tipo_teste:"BUILD",status:"em_teste",
  sistema:"Financeiro",versao:"12.00",executado_em:"2026-11-07",publica:false
};
const scenarios=[
  {id:"33333333-3333-4333-8333-333333333333",titulo:"Venda aprovada",
    ordem:1,status:"aprovado",obtido:""},
  {id:"44444444-4444-4444-8444-444444444444",titulo:"Falha do desconto",
    ordem:2,status:"reprovado",obtido:"O valor ficou divergente."},
  {id:"55555555-5555-4555-8555-555555555555",titulo:"Caso pendente",
    ordem:3,status:"nao_executado",obtido:""}
].map(item=>({
  ...item,tarefa_id:taskId,user_id:userId,passos:"Abrir pedido de teste",
  esperado:"Conferir o desconto",observacoes:""
}));
const documents=[],errors=[];
let reportSaves=0,scenarioSaves=0,taskWrites=0;
const browser=await chromium.launch({headless:true});
async function mock(route){
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const cors={
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
    "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
  };
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
  if(await mockF4Rpc(route,[task],scenarios))return;
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/qa_tarefas")){
    if(method!=="GET")taskWrites++;
    return send([task]);
  }
  if(path.endsWith("/rest/v1/qa_cenarios")){
    if(method==="GET"){
      const filter=url.searchParams.get("tarefa_id");
      if(filter==="in.("+taskId+")"){
        // Home progress can fetch in parallel while opening the detail.
        // Accept only the scoped projection, never another TF's results.
        assert.equal(url.searchParams.get("select"),"tarefa_id,status");
        return send(scenarios.map(item=>({tarefa_id:item.tarefa_id,status:item.status})));
      }
      assert.equal(filter,"eq."+taskId);
      return send(scenarios);
    }
    if(method==="PATCH"){
      const id=url.searchParams.get("id")?.replace("eq.","");
      assert.equal(url.searchParams.get("tarefa_id"),"eq."+taskId);
      const item=scenarios.find(s=>s.id===id);
      assert.ok(item,"Scenario must belong to focused TF");
      const payload=req.postDataJSON();
      scenarioSaves++;
      item.status=payload.status;
      item.obtido=payload.obtido;
      return send({id});
    }
  }
  if(path.endsWith("/rest/v1/qa_evidencia_arquivos"))return send([]);
  if(path.endsWith("/rest/v1/qa_documentos")){
    assert.equal(method,"GET","Reports list is read-only");
    return send(documents);
  }
  if(path.endsWith("/rest/v1/rpc/qa_save_document")){
    assert.equal(method,"POST");
    const request=req.postDataJSON();
    assert.equal(request.p_tarefa_id,taskId);
    assert.equal(request.p_tipo,"relatorio");
    assert.equal(request.p_origem,"execucao");
    assert.match(request.p_conteudo,/## O que foi testado/);
    assert.match(request.p_conteudo,/Caso pendente/);
    reportSaves++;
    const saved={
      id:"66666666-6666-4666-8666-666666666666",
      tarefa_id:taskId,titulo:request.p_titulo,conteudo:request.p_conteudo,
      tipo:"relatorio",versao:reportSaves,
      created_at:"2026-11-07T12:00:00Z"
    };
    documents.unshift(saved);
    return send(saved);
  }
  errors.push(method+" "+path);
  return send({message:"API sintética inesperada"},500);
}
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",e=>errors.push("Page: "+e.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
  await page.goto(root);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("synthetic-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  await page.goto(root+"#/tarefa/"+taskId);
  await page.getByRole("heading",{name:"Descontos em homologação"}).waitFor();

  await page.getByRole("tab",{name:"Entregáveis"}).click();
  await page.getByRole("tabpanel",{name:"Entregáveis"})
    .getByRole("button",{name:"Relatório e documentos",exact:true}).click();
  const heading=page.getByRole("dialog",{name:"Documentos e relatório"}).getByRole("heading",{name:"Criar relatório"});
  await heading.waitFor({timeout:20000});
  await page.waitForFunction(()=>document.activeElement?.id==="documents-heading");

  await page.getByText("Consultar o que foi testado").click();
  const summary=page.getByRole("textbox",{name:"O que foi testado (somente resultados salvos)"});
  const original=await summary.inputValue();
  assert.match(original,/Venda aprovada/);
  assert.match(original,/Falha do desconto/);
  assert.match(original,/O valor ficou divergente/);
  assert.match(original,/sem descrição do observado/i);
  assert.doesNotMatch(original,/Caso pendente/,"Pending cases must not be represented as tested");

  const full=page.getByRole("textbox",{name:"Prévia do relatório (editável antes de salvar)"});
  assert.match(await full.inputValue(),/## O que foi testado/);
  assert.match(await full.inputValue(),/Não executados: 1/);
  assert.equal(reportSaves,0,"Opening a report may not save or approve anything");
  await full.fill("Texto manual em revisão — não sobrescrever");
  assert.equal(await full.inputValue(),"Texto manual em revisão — não sobrescrever");

  // The document stays mounted while its modal is closed: a manually edited
  // report survives continuing tests, and its derived summary refreshes.
  await page.getByRole("button",{name:"Fechar Documentos e relatório"}).click();
  await page.getByRole("tab",{name:/Testes/}).click();
  await page.getByRole("group",{name:"Resultado de Caso pendente"})
    .getByRole("button",{name:"Funcionou",exact:true}).click();
  await page.getByRole("tab",{name:"Entregáveis"}).click();
  await page.getByRole("tabpanel",{name:"Entregáveis"})
    .getByRole("button",{name:"Relatório e documentos",exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('textarea[readonly]')]
    .some(el=>el.value?.includes("Caso pendente")));
  const newSummary=await summary.inputValue();
  assert.match(newSummary,/Caso pendente/,"Only newly saved execution may enter tested summary");
  assert.equal(await full.inputValue(),"Texto manual em revisão — não sobrescrever",
    "An edited report cannot be overwritten by background scenario refresh");
  assert.equal(scenarioSaves,1);

  page.once("dialog",dialog=>void dialog.dismiss());
  await page.getByRole("button",{name:"Atualizar prévia"}).click();
  assert.equal(await full.inputValue(),"Texto manual em revisão — não sobrescrever",
    "Canceling report reset must preserve the QA review");
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"Atualizar prévia"}).click();
  assert.match(await full.inputValue(),/## O que foi testado/);
  assert.match(await full.inputValue(),/Caso pendente/);
  assert.match(await full.inputValue(),/Não executados: 0/);
  assert.equal(task.status,"em_teste","A generated report must not close or approve the TF");

  // File export happens entirely in the browser and never saves/approves a TF.
  const [pdfDownload]=await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button",{name:"Exportar PDF",exact:true}).click()
  ]);
  assert.match(pdfDownload.suggestedFilename(),/\.pdf$/);
  const bytes=await readFile(await pdfDownload.path());
  assert.equal(bytes.subarray(0,5).toString(),"%PDF-");
  assert.ok(bytes.length>1500);
  assert.equal(taskWrites,0);
  assert.equal(reportSaves,0,"Export is not a document-version save");

  await page.getByRole("button",{name:"Salvar versão"}).click();
  await page.getByText("Relatório salvo como versão 1.").waitFor();
  assert.equal(reportSaves,1,"Only explicit save creates a report version");
  assert.equal(taskWrites,0,"Report preview and save cannot modify task status");
  assert.deepEqual(errors,[]);
  const overflow=await page.evaluate(() =>
    document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,"Report UI must fit mobile width 390px");
  console.log("Relatório de QA: somente executados, edição manual preservada, atualização confirmada e versão explícita.");
}finally{
  await browser.close();
}
