import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mockF4Rpc } from "./f4-mock-rpc.mjs";

const ROOT="http://127.0.0.1:4173/QA-Hub/";
const USER="11111111-1111-4111-8111-111111111111";
const user={
  id:USER,email:"wizard@fixture.invalid",aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-09T10:00:00Z"
};
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
};
const tasks=[],cases=[],files=[],sources=[],errors=[],aiRequests=[],caseRequests=[];
let taskWrites=0,caseWrites=0,rateLimited=false;
let holdTaskRequest=true,holdCasesRequest=true,releaseTaskRequest=()=>{},releaseCasesRequest=()=>{};
let notifyTaskStarted=()=>{},notifyCasesStarted=()=>{};
const taskStarted=new Promise(resolve=>{notifyTaskStarted=resolve;});
const casesStarted=new Promise(resolve=>{notifyCasesStarted=resolve;});
const markdown=[
  "# ROTEIRO DE TESTES — DESCONTOS",
  "## Cenário 01 — Remover desconto",
  "### Cenário",
  "Validar remoção de desconto.",
  "### Passos",
  "1. Abrir pedido",
  "2. Remover desconto",
  "### Resultado esperado",
  "- Total atualizado",
  "---",
  "## Cenário 02 — Conferir baixa financeira",
  "### Cenário",
  "Validar baixa após estorno.",
  "### Passos",
  "1. Abrir contas a receber",
  "2. Consultar baixa",
  "### Resultado esperado",
  "- Baixa financeira correta",
  "---",
  "## Cenário 03 — Conferir baixa financeira",
  "### Cenário",
  "Duplicado com outra redação.",
  "### Passos",
  "1. Consultar baixa",
  "### Resultado esperado",
  "- A baixa permanece correta",
  "---",
  "## Cenário 04 — Valor limite",
  "### Cenário",
  "Conferir um valor limite indicado no requisito.",
  "### Passos",
  "1. Acessar pedido",
  "2. Validar valor",
  "### Resultado esperado",
  "- O total respeita a regra"
].join("\n");

const browser=await chromium.launch({headless:true});
async function backend(route){
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const send=(data,status=200)=>route.fulfill({
    status,headers:cors,contentType:"application/json",body:JSON.stringify(data)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"fixture-token",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/functions/v1/qa-ai")){
    const payload=req.postDataJSON();
    aiRequests.push(payload);
    notifyTaskStarted();
    if(holdTaskRequest){
      await new Promise(resolve=>{releaseTaskRequest=resolve;});
      holdTaskRequest=false;
    }
    if(rateLimited)return send({error:"rate_limited",message:"Limite por minuto; tente novamente."},429);
    return send({provider:"NVIDIA Build",draft:{
      titulo:"Validar descontos de pedidos",codigo:"88771",sistema:"Financeiro",
      versao:aiRequests.length===1?"12.09":"12.10",tipo_teste:"BUILD",
      descricao:"O desconto não era removido corretamente em certos pedidos.",
      ambiente:"Homologação",base_teste:"10861-3",
      empresa:"Empresa de teste",testador:"Analista QA",
      explicacao:"Os descontos são rateados entre os itens do pedido.",
      causa:"A rotina ignorava valores negativos.",
      correcao:aiRequests.length===1?
        "A rotina passou a considerar os valores negativos.":
        "A rotina também passou a validar os kits desdobrados.",
      conclusao:"A correção está pronta para validação.",
      observacoes:"Conferir desconto e baixa financeira.",
      cenarios:[{
        titulo:"Remover desconto",passos:"1. Abrir pedido\n2. Remover desconto",
        esperado:"Total atualizado",objetivo:"Validar que o desconto é removido."
      }]
    }});
  }
  if(path.endsWith("/functions/v1/qa-generators")){
    const data=req.postDataJSON();
    assert.equal(data.mode,"teste");
    caseRequests.push(data);
    notifyCasesStarted();
    if(holdCasesRequest){
      await new Promise(resolve=>{releaseCasesRequest=resolve;});
      holdCasesRequest=false;
    }
    const sse="event: chunk\ndata: "+JSON.stringify({text:markdown})+"\n\n"+
      "event: done\ndata: "+JSON.stringify({truncated:false})+"\n\n";
    return route.fulfill({status:200,headers:cors,contentType:"text/event-stream",body:sse});
  }
  if(await mockF4Rpc(route,tasks,cases))return;
  if(path.endsWith("/rest/v1/qa_tarefas")){
    if(method==="POST"){
      const draft=req.postDataJSON();
      assert.equal(draft.user_id,USER);
      taskWrites++;
      const row={...draft,id:"33333333-3333-4333-8333-"+String(taskWrites).padStart(12,"0"),
        executado_em:"2026-11-09",created_at:"2026-11-09T12:00:00Z"};
      tasks.push(row);
      return send(row,201);
    }
    if(method==="GET")return send(tasks);
    if(method==="PATCH"){
      const id=url.searchParams.get("id")?.replace("eq.","");
      const item=tasks.find(item=>item.id===id);
      if(item)Object.assign(item,req.postDataJSON());
      return send(item??null);
    }
  }
  if(path.endsWith("/rest/v1/qa_cenarios")){
    if(method==="GET"){
      const id=url.searchParams.get("tarefa_id")?.replace("eq.","");
      return send(cases.filter(item=>item.tarefa_id===id));
    }
    if(method==="POST"){
      for(const item of req.postDataJSON()){
        assert.equal(item.status,"nao_executado");
        assert.equal(item.obtido,"");
        caseWrites++;
        cases.push({...item,id:"44444444-4444-4444-8444-"+String(caseWrites).padStart(12,"0")});
      }
      return send(null,201);
    }
  }
  if(path.endsWith("/rest/v1/qa_requisito_fontes")){
    if(method==="GET")return send(sources);
    if(method==="POST"){
      const item=req.postDataJSON();
      sources.push(item);
      return send(null,201);
    }
  }
  if(path.includes("/storage/v1/object/")&&method==="POST"){
    files.push(path);
    return send({Key:path},200);
  }
  if(path.endsWith("/rest/v1/rpc/qa_register_requirement_file")){
    const body=req.postDataJSON();
    files.push(body.p_nome);
    sources.push({...body,tarefa_id:body.p_tarefa_id,storage_path:body.p_path,
      id:"55555555-5555-4555-8555-"+String(files.length).padStart(12,"0")});
    return send({tarefa_id:body.p_tarefa_id,id:sources.at(-1).id,versao:1});
  }
  errors.push(method+" "+path);
  return send({message:"Unexpected fixture endpoint"},500);
}
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",error=>errors.push("PAGE: "+error.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",backend);
  await page.goto(ROOT);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("fixture-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});

  await page.getByRole("button",{name:"Nova TF"}).click();
  const wizard=page.getByRole("dialog",{name:/Nova TF — etapa/});
  await wizard.waitFor();
  await page.getByText("Informações da tarefa").waitFor();
  assert.equal(await wizard.getByLabel("Título da tarefa").count(),0,
    "The first step must contain only source collection, not a full form");
  const source=wizard.getByLabel("Informações da tarefa");
  await source.fill("Pedido 88771. Descontos negativos não são removidos.");
  await wizard.getByLabel("Adicionar arquivos da tarefa").setInputFiles({
    name:"analise.txt",mimeType:"text/plain",
    buffer:Buffer.from("Análise: o rateio ignora descontos negativos.")
  });
  await wizard.getByText("analise.txt").waitFor();
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    const fileWidth=await wizard.locator(".qa-wizard-file strong").first()
      .evaluate(element=>element.getBoundingClientRect().width);
    assert.ok(fileWidth>50,
      "Attachment filename must not collapse in a "+width+"px modal (got "+fileWidth+"px)");
  }
  assert.equal(taskWrites,0,"No TF must be saved when preparing files");
  assert.equal(await wizard.getByRole("button",{name:"Gerar tarefa com IA"}).isDisabled(),true);
  await wizard.getByRole("checkbox",{name:/Autorizo enviar o texto colado/}).check();
  await wizard.getByRole("button",{name:"Gerar tarefa com IA"}).click();
  const statusPanel=wizard.locator(".qa-wizard-work");
  await statusPanel.getByText("Interpretando a tarefa").waitFor();
  await statusPanel.getByText(/Aguardando a NVIDIA analisar/).waitFor();
  assert.equal(await statusPanel.locator(".qa-wizard-work-steps li.is-active").count(),1,
    "Only the actual in-flight stage should be marked active");
  assert.equal(await wizard.getByRole("button",{name:"Continuar manualmente"}).isDisabled(),true,
    "Navigation must be blocked during in-flight NVIDIA analysis");
  await taskStarted;
  releaseTaskRequest();
  await wizard.getByRole("heading",{name:"Nova TF — etapa 2 de 3"}).waitFor();
  await statusPanel.waitFor({state:"detached"});
  assert.equal(await wizard.getByText(/A TF será salva somente após a finalização/).count(),1);
  assert.match(aiRequests[0].text,/Análise: o rateio ignora descontos negativos/);
  assert.equal(await wizard.getByLabel("Título da tarefa").inputValue(),
    "Validar descontos de pedidos");
  assert.equal(await wizard.getByLabel("Versão").inputValue(),"12.09.00.0000");
  assert.equal(await wizard.getByLabel("Resumo do problema / descrição").inputValue(),
    "O desconto não era removido corretamente em certos pedidos.");
  const details=wizard.locator("details.qa-wizard-more");
  assert.equal(await details.getAttribute("open"),"",
    "A análise técnica gerada deve estar visível para revisão na primeira geração");
  for(const [label,value] of [
    ["Como funciona","Os descontos são rateados entre os itens do pedido."],
    ["Causa identificada","A rotina ignorava valores negativos."],
    ["Correção realizada","A rotina passou a considerar os valores negativos."],
    ["Conclusão","A correção está pronta para validação."],
    ["Ambiente","Homologação"],["Base de teste","10861-3"],
    ["Empresa","Empresa de teste"],["Testador","Analista QA"],
    ["Observações","Conferir desconto e baixa financeira."]
  ]){
    const input=details.locator("label.field").filter({hasText:label})
      .locator("textarea,input").first();
    assert.equal(await input.inputValue(),value,
      "The initial AI generation must fill "+label+" like the regeneration flow");
  }
  assert.equal(taskWrites,0,"Stage 2 must not persist the task");
  await wizard.getByLabel("Título da tarefa").fill("TF revisada pelo QA");
  await details.locator("label.field").filter({hasText:"Causa identificada"})
    .locator("textarea").fill("Causa revisada manualmente.");
  await wizard.getByRole("button",{name:"Analisar novamente"}).click();
  await wizard.getByLabel("Versão").waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll("input")]
    .some(item=>item.value==="12.10.00.0000"));
  assert.equal(await wizard.getByLabel("Título da tarefa").inputValue(),"TF revisada pelo QA",
    "Reanalysis must not overwrite user-entered titles");
  assert.equal(await details.locator("label.field").filter({hasText:"Causa identificada"})
    .locator("textarea").inputValue(),"Causa revisada manualmente.",
    "Reanalysis must preserve a manually corrected cause");
  assert.equal(await details.locator("label.field").filter({hasText:"Correção realizada"})
    .locator("textarea").inputValue(),
    "A rotina também passou a validar os kits desdobrados.",
    "A newer AI result may refresh an unchanged earlier AI field");
  assert.equal(aiRequests.length,2,"Reanalysis must reuse the same NVIDIA extraction service");
  await wizard.getByRole("button",{name:"Avançar"}).click();
  await wizard.getByRole("heading",{name:"Nova TF — etapa 3 de 3"}).waitFor();
  assert.equal(taskWrites,0);
  assert.match(await wizard.locator(".qa-ai-step-flow li.is-current").innerText(),/Revisar/);
  await wizard.getByRole("button",{name:"Voltar à geração"}).click();
  assert.match(await wizard.locator(".qa-ai-step-flow li.is-current").innerText(),/Configurar/);
  await wizard.getByLabel(/Requisitos e critérios de aceite/).fill(
    "RN01: Valores negativos devem ser removidos e refletidos na baixa."
  );
  await wizard.getByLabel("Anexar arquivos de requisito").setInputFiles({
    name:"requisito.txt",mimeType:"text/plain",
    buffer:Buffer.from("CA01: A baixa financeira deve refletir o valor corrigido.")
  });
  await wizard.getByText("requisito.txt").waitFor();
  await wizard.getByRole("checkbox",{name:/Autorizo enviar o contexto/}).check();
  await wizard.getByRole("button",{name:"Ampliar cobertura com IA"}).click();
  await statusPanel.getByText("Gerando cobertura de testes").waitFor();
  await statusPanel.getByText(/Aguardando a NVIDIA elaborar/).waitFor();
  assert.equal(await statusPanel.getByRole("button",{name:"Cancelar"}).count(),1,
    "Streaming case generation must offer an explicit cancel action");
  await casesStarted;
  releaseCasesRequest();
  await page.getByText("2 caso(s) novo(s) identificados.",{exact:false}).waitFor();
  await statusPanel.waitFor({state:"detached"});
  assert.match(caseRequests[0].tarefa,/o rateio ignora descontos negativos/i);
  assert.match(caseRequests[0].requisito,/CA01: A baixa financeira/);
  assert.equal(await wizard.locator(".qa-wizard-case").count(),3,
    "The original case and exactly two unique cases must be shown");
  assert.match(await wizard.locator(".qa-ai-step-flow li.is-current").innerText(),/Revisar/);
  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const sizes=await page.evaluate(()=>{
      const modal=document.querySelector('[role="dialog"][aria-modal="true"]');
      return {page:document.documentElement.scrollWidth-innerWidth,
        modal:modal?modal.scrollWidth-modal.clientWidth:999};
    });
    assert.ok(sizes.page<=1&&sizes.modal<=1,"New TF cases review overflows "+width);
    const audit=await page.evaluate(async()=>window.axe.run(document,{
      runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
      rules:{region:{enabled:false}}
    }));
    assert.deepEqual(audit.violations.map(v=>v.id),[],"New TF cases accessibility "+width);
  }
  await page.setViewportSize({width:390,height:844});
  assert.equal(taskWrites,0,"Generation must not create a TF");
  await wizard.getByRole("button",{name:/Finalizar com 3 caso/}).click();
  await page.getByRole("heading",{name:"TF revisada pelo QA"}).waitFor();
  assert.equal(taskWrites,1);
  assert.equal(caseWrites,3);
  assert.equal(tasks[0].codigo,"88771");
  assert.equal(tasks[0].versao,"12.10.00.0000");
  assert.equal(tasks[0].descricao,"O desconto não era removido corretamente em certos pedidos.");
  assert.equal(tasks[0].causa,"Causa revisada manualmente.");
  assert.equal(tasks[0].correcao,"A rotina também passou a validar os kits desdobrados.");
  assert.equal(tasks[0].explicacao,"Os descontos são rateados entre os itens do pedido.");
  assert.ok(files.some(x=>x.includes("analise.txt"))&&files.some(x=>x.includes("requisito.txt")),
    "Both source and requirement files must be privately registered");
  assert.equal(sources.some(x=>x.nome_arquivo==="Requisito da criação"),true);
  assert.ok(cases.every(x=>x.status==="nao_executado"));

  await page.getByRole("link",{name:"Todas as TFs"}).click();
  await page.getByRole("button",{name:"Nova TF"}).click();
  await wizard.getByRole("button",{name:"Continuar manualmente"}).click();
  await wizard.getByLabel("Título da tarefa").fill("TF sem casos");
  await wizard.getByRole("button",{name:"Avançar"}).click();
  assert.equal(await wizard.getByRole("button",{name:/Finalizar com/}).count(),0);
  await wizard.getByRole("button",{name:"Finalizar sem casos"}).click();
  await page.getByRole("heading",{name:"TF sem casos"}).waitFor();
  assert.equal(taskWrites,2);
  assert.equal(caseWrites,3,"Skip must save no test scenarios");

  await page.getByRole("link",{name:"Todas as TFs"}).click();
  await page.getByRole("button",{name:"Nova TF"}).click();
  await wizard.getByLabel("Informações da tarefa").fill("Texto de uma TF com falha de quota");
  rateLimited=true;
  await wizard.getByRole("checkbox",{name:/Autorizo enviar o texto colado/}).check();
  await wizard.getByRole("button",{name:"Gerar tarefa com IA"}).click();
  await page.getByText("Limite por minuto; tente novamente.",{exact:false}).waitFor();
  assert.equal(taskWrites,2,"429 must not save a partial TF");
  assert.equal(await wizard.getByLabel("Informações da tarefa").inputValue(),
    "Texto de uma TF com falha de quota");
  rateLimited=false;

  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const over=await page.evaluate(()=>
      document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(over<=1,"Wizard must not overflow on width "+width);
  }
  // The old UI/API/source-storage gates all rejected this report.
  const longSource="Pedido 88771. Condição de desconto e regra fiscal. ".repeat(2200)+" MARCADOR FINAL DO RELATÓRIO";
  await wizard.getByLabel("Informações da tarefa").fill(longSource);
  assert.equal(await wizard.getByLabel("Informações da tarefa").inputValue(),longSource);
  await wizard.getByRole("checkbox",{name:/Autorizo enviar o texto colado/}).check();
  await wizard.getByRole("button",{name:"Gerar tarefa com IA"}).click();
  await wizard.getByRole("heading",{name:"Nova TF — etapa 2 de 3"}).waitFor();
  assert.ok(aiRequests.at(-1).text.length>80000,"A context beyond both old caps must reach the Edge Function");
  assert.ok(aiRequests.at(-1).text.endsWith("MARCADOR FINAL DO RELATÓRIO"),"No tail truncation");
  await wizard.getByRole("button",{name:"Avançar"}).click();
  await wizard.getByRole("button",{name:/Finalizar com/}).click();
  await page.getByRole("heading",{name:"Validar descontos de pedidos",exact:true}).waitFor();
  assert.ok(sources.some(item=>item.nome_arquivo==="Fonte original da TF"&&item.texto_extraido===longSource),
    "The full pasted report must be archived without truncation");
  assert.deepEqual(errors,[]);
  console.log("Nova TF em 3 etapas: fontes, IA, revisão, requisitos, deduplicação, persistência, pulo e 429.");
}finally{await browser.close();}
