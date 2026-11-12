import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {mkdirSync} from "node:fs";
import JSZip from "jszip";

// Small synthetic PDF built locally; no production document is used.
function makePdf(text) {
  const escaped=text.replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)");
  const stream="BT\n/F1 12 Tf\n72 720 Td\n("+escaped+") Tj\nET\n";
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length "+Buffer.byteLength(stream,"ascii")+" >>\nstream\n"+stream+"endstream"
  ];
  let pdf="%PDF-1.4\n";
  const offsets=[0];
  for(let i=0;i<objects.length;i++){
    offsets.push(Buffer.byteLength(pdf,"ascii"));
    pdf+=(i+1)+" 0 obj\n"+objects[i]+"\nendobj\n";
  }
  const xref=Buffer.byteLength(pdf,"ascii");
  pdf+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+(objects.length+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  return Buffer.from(pdf,"ascii");
}
async function makeDocx(text){
  const zip=new JSZip();
  zip.file("[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file("word/document.xml",
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
    '<w:body><w:p><w:r><w:t>'+text+'</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"});
}


// Synthetic fixture. This test intercepts every Supabase request.
const userId="11111111-1111-4111-8111-111111111111";
const taskId="22222222-2222-4222-8222-222222222222";
const user={id:userId,aud:"authenticated",role:"authenticated",email:"qa-fixture@example.invalid",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-11-06T10:00:00.000Z"};
const tasks=[{id:taskId,user_id:userId,titulo:"Validação de descontos",codigo:"78912",
  tipo_teste:"BUILD",status:"rascunho",descricao:"Descontos negativos devem ser removidos.",
  sistema:"Financeiro",versao:"12.00",causa:"Filtro omitia valores negativos",
  correcao:"Critério corrigido",conclusao:"",observacoes:"",publica:false,
  created_at:"2026-11-06T10:00:00.000Z",executado_em:"2026-11-06"}];
const scenarios=[],documents=[],failures=[],requirements=[],requirementLinks=[],evidenceRows=[],evidenceFiles=[],releases=[],releaseLinks=[],referenceRows=[],comparisonRows=[];
const samplePng=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOa2nx0AAAAASUVORK5CYII=","base64");
let uploadedBytes=0,fileSaves=0;
let requirementImports=0,coverageSaves=0,evidenceSaves=0,releaseSaves=0,referenceSaves=0,comparisonSaves=0;
let aiCalls=0,attachCalls=0,postSaves=0,failNextGenerator=false;
const aiPayloads=[];
const cors={"Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"};
const browser=await chromium.launch({headless:true});

async function mock(route){
  const req=route.request(),url=new URL(req.url()),p=url.pathname,m=req.method();
  const send=(body,status=200)=>route.fulfill({status,headers:cors,
    contentType:"application/json",body:JSON.stringify(body)});
  if(m==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(p.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"fake-refresh-token",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(p.endsWith("/auth/v1/user"))return send(user);
  if(await mockF4Rpc(route,tasks,scenarios))return;
  if(p.endsWith("/rest/v1/qa_admins"))return send(null);
  if(p.endsWith("/rest/v1/qa_tarefas"))return send(tasks);
  if(p.endsWith("/rest/v1/qa_cenarios"))return send(scenarios);
  if(p.endsWith("/rest/v1/qa_requisitos"))return send(requirements);
  if(p.endsWith("/rest/v1/qa_requisito_cenarios"))return send(requirementLinks);
  if(p.endsWith("/rest/v1/qa_requisito_fontes"))return send([]);
  if(p.endsWith("/rest/v1/qa_requisito_revisoes"))return send([]);
  if(p.endsWith("/rest/v1/qa_geracao_contextos"))return send([]);
  if(p.endsWith("/rest/v1/qa_releases"))return send(releases);
  if(p.endsWith("/rest/v1/qa_release_tarefas"))return send(releaseLinks);
  if(p.endsWith("/rest/v1/qa_artefatos")){
    if(m==="POST"){
      comparisonSaves++;
      const payload=req.postDataJSON();
      assert.deepEqual(Object.keys(payload).sort(),
        ["adicionados","alterados","removidos","tarefa_id","tipo","user_id"].sort());
      assert.equal(payload.tarefa_id,taskId);
      assert.equal(payload.user_id,userId);
      comparisonRows.unshift({...payload,id:"bbbbbbbb-bbbb-4bbb-8bbb-"+
        String(comparisonSaves).padStart(12,"0"),
        created_at:"2026-11-06T13:00:00.000Z"});
      return send({id:comparisonRows[0].id},201);
    }
    return send(comparisonRows);
  }
  if(p.endsWith("/rest/v1/qa_referencias")){
    if(m==="POST"){
      referenceSaves++;
      const payload=req.postDataJSON();
      referenceRows.push({...payload,id:"99999999-9999-4999-8999-999999999999",
        created_at:"2026-11-06T12:45:00.000Z"});
      return send({id:"99999999-9999-4999-8999-999999999999"},201);
    }
    return send(referenceRows);
  }
  if(p.endsWith("/rest/v1/rpc/qa_link_release")){
    releaseSaves++;
    const args=req.postDataJSON();
    assert.equal(args.p_tarefa_id,taskId);
    const releaseId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    releases.push({id:releaseId,versao:args.p_versao,
      created_at:"2026-11-06T12:40:00.000Z"});
    releaseLinks.push({release_id:releaseId,tarefa_id:taskId});
    return send(releaseId);
  }
  if(p.startsWith("/storage/v1/object/")){
    if(m==="POST"){
      assert.match(p,/qa-evidence-private\/11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222/);
      uploadedBytes++;
      return send({Key:p});
    }
    if(m==="GET"&&p.includes("/qa-evidence-private/")){
      return route.fulfill({status:200,headers:cors,
        contentType:"image/png",body:samplePng});
    }
    if(m==="DELETE")return send([]);
  }
  if(p.endsWith("/rest/v1/qa_evidencia_arquivos")){
    if(m==="POST"){
      fileSaves++;
      const payload=req.postDataJSON();
      assert.equal(payload.tarefa_id,taskId);
      assert.equal(payload.user_id,userId);
      assert.match(payload.objeto_path,/^11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\//);
      const record={...payload,created_at:"2026-11-08T12:30:00Z"};
      evidenceFiles.push(record);
      return send(record,201);
    }
    return send(evidenceFiles);
  }
  if(p.endsWith("/rest/v1/qa_documentos"))return send(documents);
  if(p.endsWith("/rest/v1/qa_diagramas"))return send([]);
  if(p.endsWith("/rest/v1/qa_evidencias")){
    if(m==="POST"){
      evidenceSaves++;
      const item=req.postDataJSON();
      evidenceRows.push({...item,id:"88888888-8888-4888-8888-888888888888",
        created_at:"2026-11-06T12:30:00.000Z"});
      return send({id:"88888888-8888-4888-8888-888888888888"},201);
    }
    return send(evidenceRows);
  }
  if(p.endsWith("/rest/v1/qa_eventos"))return send([]);
  if(p.endsWith("/rest/v1/qa_generator_tests"))return send([],201);
  if(p.endsWith("/rest/v1/qa_generator_posts"))return send([],201);
  if(p.endsWith("/rest/v1/rpc/qa_import_requisitos")){
    requirementImports++;
    const payload=req.postDataJSON();
    assert.equal(payload.p_tarefa_id,taskId);
    assert.match(payload.p_texto,/RF001/);
    for(const [index,item] of payload.p_itens.entries()){
      requirements.push({...item,id:"66666666-6666-4666-8666-"+
        String(index+1).padStart(12,"0"),tarefa_id:taskId,user_id:userId,
        fonte_id:null,versao:1,created_at:"2026-11-06T12:00:00.000Z",
        updated_at:"2026-11-06T12:00:00.000Z"});
    }
    return send({tarefa_id:taskId,inserted:payload.p_itens.length,skipped:0});
  }
  if(p.endsWith("/rest/v1/rpc/qa_set_requirement_scenarios")){
    coverageSaves++;
    const payload=req.postDataJSON();
    assert.equal(payload.p_tarefa_id,taskId);
    requirementLinks.splice(0,requirementLinks.length,
      ...payload.p_cenario_ids.map((id,index)=>({
        id:"77777777-7777-4777-8777-"+String(index+1).padStart(12,"0"),
        tarefa_id:taskId,requisito_id:payload.p_requisito_id,cenario_id:id
      })));
    return send({tarefa_id:taskId,requisito_id:payload.p_requisito_id,
      linked:payload.p_cenario_ids.length,inserted:payload.p_cenario_ids.length,removed:0});
  }
  if(p.endsWith("/rest/v1/rpc/qa_attach_generated_cases")){
    attachCalls++;
    const payload=req.postDataJSON();
    payload.p_itens.forEach((item,i)=>scenarios.push({
      ...item,id:"44444444-4444-4444-8444-"+String(i+1).padStart(12,"0"),
      tarefa_id:taskId,user_id:userId,ordem:i+1,status:"nao_executado",obtido:""
    }));
    return send({inserted:payload.p_itens.length,skipped:0,tarefa_id:taskId});
  }
  if(p.endsWith("/rest/v1/rpc/qa_save_document")){
    postSaves++;
    const input=req.postDataJSON();
    const record={id:"55555555-5555-4555-8555-555555555555",tarefa_id:taskId,
      titulo:input.p_titulo,conteudo:input.p_conteudo,tipo:input.p_tipo,
      versao:postSaves,created_at:"2026-11-06T11:00:00.000Z"};
    documents.unshift(record);
    return send(record);
  }
  if(p.endsWith("/functions/v1/qa-generators")){
    const payload=req.postDataJSON();
    // One user action now consists of multiple sequential requests. Count
    // generation starts, not transport chunks, for retry assertions.
    if(!payload.batch||payload.batch.index===0)aiCalls++;
    aiPayloads.push(payload);
    assert.equal(payload.tarefa.includes("Validação de descontos"),true);
    if(failNextGenerator){
      failNextGenerator=false;
      return send({message:"IA indisponível na simulação"},503);
    }
    const stage=payload.batch?.stage;
    const text=payload.mode==="teste"
      ?stage==="setup"
        ?"# ROTEIRO DE TESTES\n## Objetivo\nValidar desconto.\n## Pré-requisitos\n- Pedido criado."
        :stage==="positive"
          // Two intentionally identical cases prove that deduplication still
          // works inside the positive stage, without replaying them in all 5 stages.
          ?"## Cenário 01 — Remover desconto\n### Passos\n1. Acessar pagamentos\n2. Remover desconto\n### Resultado esperado\n- Desconto removido\n## Cenário 02 — Remover desconto\n### Passos\n1. Acessar pagamentos\n2. Remover desconto\n### Resultado esperado\n- Desconto removido\n"
          :stage==="negative"?"[Sem cenários negativos adicionais documentados]"
          :stage==="regression"?"[Sem cenários de regressão adicionais documentados]"
          :"## Resultado dos testes\n- A confirmar."
      :stage==="overview"
        ?"# DESCONTO EM PAGAMENTOS\n\nFoi implementada correção do desconto.\n\nAnteriormente, descontos negativos eram ignorados. Agora, são processados.\n\n**Caminho de acesso:**\nFinanceiro >> Pagamentos >> Remover desconto\n\n[Imagem: captura-do-desconto.png]"
        :stage==="details"
          ?"**Comportamento detalhado**\n1. **Desconto**\n   A operação remove o desconto corretamente."
          :"**TAREFA:** 78912\n**JUSTIFICATIVA:** Corrigir divergência relatada.";
    return route.fulfill({status:200,
      headers:{...cors,"Content-Type":"text/event-stream; charset=utf-8"},
      body:"event: chunk\ndata: "+JSON.stringify({text})+"\n\n"+
        "event: done\ndata: {\"truncated\":false}\n\n"});
  }
  failures.push(m+" "+p);
  return send({message:"Fixture não configurada: "+p},500);
}
try{
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  page.on("pageerror",e=>failures.push(e.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
  await page.goto("http://127.0.0.1:4173/QA-Hub/");
  await page.getByRole("textbox",{name:"Email"}).fill("qa-fixture@example.invalid");
  await page.getByLabel("Senha").fill("synthetic-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  await page.getByText("Validação de descontos",{exact:true}).click();
  await page.getByRole("heading",{name:"Validação de descontos"}).waitFor({timeout:20000});
  await page.getByRole("tab",{name:"Cenários"}).click();
  await page.getByRole("button",{name:"Gerar casos"}).click();
  await page.getByRole("heading",{name:"Gerar casos de teste"}).waitFor();
  assert.equal(await page.getByRole("navigation",{name:"Ferramentas da central de IA"}).count(),0,
    "Test-generation dialog must not duplicate other AI tools");
  await page.getByRole("combobox",{name:"Modelo de geração"}).selectOption("regressao");
  const generate=page.getByRole("dialog",{name:"Gerar casos com IA"})
    .getByRole("button",{name:"Gerar casos",exact:true});
  assert.equal(await generate.isDisabled(),true);
  assert.equal(aiCalls,0);
  await page.getByRole("checkbox",{name:/Autorizo enviar os textos/}).check();
  await generate.click();
  const attach=page.getByRole("button",{name:/Anexar \d+ casos?|Selecione casos/});
  await attach.waitFor({timeout:20000});
  assert.equal(await page.locator(".qa-ai-case-review").count(),1,
    "Repeated AI cases must be removed from the review, not shown disabled");
  assert.equal(await page.locator(".qa-ai-case-review")
    .filter({hasText:/duplicado/i}).count(),0);
  await page.getByRole("button",{name:"Limpar seleção"}).click();
  assert.equal(await attach.isDisabled(),true,
    "Nothing should be attached without explicit selection");
  await page.getByRole("button",{name:"Selecionar todos"}).click();
  assert.equal(await attach.isDisabled(),false);
  assert.match(aiPayloads[0].requisito,/casos de regressão/i);
  assert.equal(attachCalls,0,"IA não pode persistir execução automaticamente");
  const caseReview=page.locator(".qa-ai-case-review").first();
  await caseReview.getByText("Editar cenário").click();
  const caseTitle=caseReview.getByRole("textbox",{name:"Título"});
  await caseTitle.fill("Versão revisada manualmente");
  assert.equal(await caseTitle.inputValue(),"Versão revisada manualmente",
    "Edited scenarios must remain intact until the user saves or discards them.");
  await page.getByRole("button",{name:"Alterar modelo ou gerar novamente"}).click();
  page.once("dialog",dialog=>void dialog.dismiss());
  await page.getByRole("button",{name:"Gerar novamente",exact:true}).click();
  assert.equal(aiCalls,1,"Cancelar regeneração não envia outro pedido.");
  await page.getByRole("button",{name:"Voltar ao resultado anterior"}).click();
  await caseReview.getByText("Editar cenário").click();
  assert.equal(await caseTitle.inputValue(),"Versão revisada manualmente");
  await page.getByRole("button",{name:"Alterar modelo ou gerar novamente"}).click();
  failNextGenerator=true;
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"Gerar novamente",exact:true}).click();
  await page.getByText(/IA indisponível na simulação/).waitFor();
  await page.getByRole("button",{name:"Voltar ao resultado anterior"}).click();
  await caseReview.getByText("Editar cenário").click();
  assert.equal(await caseTitle.inputValue(),"Versão revisada manualmente",
    "Falha da IA deve manter o rascunho editado.");
  await page.getByRole("button",{name:"Alterar modelo ou gerar novamente"}).click();
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"Gerar novamente",exact:true}).click();
  await page.getByRole("button",{name:/Anexar 1 caso/}).waitFor();
  assert.equal(aiCalls,3);
  assert.equal(attachCalls,0);
  await attach.click();
  await page.getByText(/1 cenário\(s\) anexado/).waitFor();
  assert.equal(scenarios.length,1);
  assert.equal(scenarios[0].status,"nao_executado");
  assert.equal(tasks[0].status,"rascunho");
  await page.getByText("Nenhum caso novo para adicionar").waitFor({timeout:20000});
  assert.equal(await page.locator(".qa-ai-case-review").count(),0,
    "Newly saved cases must disappear from the review");
  // One focused tool at a time: close the generator before opening posts.
  await page.getByRole("button",{name:"Fechar Gerar casos com IA"}).click();
  await page.getByRole("tab",{name:"Relatórios e posts"}).click();
  await page.getByRole("group",{name:"Criar relatórios e publicações"})
    .getByRole("button",{name:"Gerar post"}).click();
  await page.getByRole("heading",{name:"Gerar post técnico"}).waitFor();
  await page.getByRole("combobox",{name:"Modelo de geração"}).selectOption("objetivo");
  await page.getByRole("checkbox",{name:/Autorizo enviar os textos/}).check();
  await page.getByRole("dialog",{name:"Gerar post com IA"})
    .getByRole("button",{name:"Gerar post",exact:true}).click();
  const save=page.getByRole("button",{name:"Salvar post na TF"});
  await save.waitFor({timeout:20000});
  // React renders a disabled Save button while AI is still generating.
  // Wait for the validated, editable post instead of racing the stream.
  await page.waitForFunction(()=>{
    const button=[...document.querySelectorAll("button")].find(
      node=>node.textContent?.includes("Salvar post na TF"));
    return button && !button.disabled;
  },null,{timeout:25000});
  assert.match(aiPayloads.at(-1).requisito,/Seja conciso/i);
  const postEditor=page.getByRole("textbox",{name:/Post em (Markdown|BBCode)/});
  const originalPost=await postEditor.inputValue();
  assert.match(originalPost,/^# /,"Default format must be Markdown");
  await page.getByRole("button",{name:"Alterar modelo ou gerar novamente"}).click();
  await page.getByRole("radio",{name:/BBCode/}).check();
  await page.getByRole("button",{name:"Voltar ao resultado anterior"}).click();
  const bbcodePost=await postEditor.inputValue();
  assert.match(bbcodePost,/^\[size=18\]\[b\]/,"Switching the format must re-render the draft");
  assert.doesNotMatch(bbcodePost,/^#\s+|\*\*[^\n]+\*\*/m,
    "BBCode mode must not retain Markdown headings or bold text");
  await postEditor.fill("Rascunho revisto pelo usuário");
  assert.equal(await postEditor.inputValue(),"Rascunho revisto pelo usuário");
  await postEditor.fill(bbcodePost);
  await save.click();
  await page.getByText(/Post salvo em Documentos/).waitFor();
  assert.equal(postSaves,1);
  assert.equal(aiCalls,4);
  await page.getByRole("button",{name:"Fechar Gerar post com IA"}).click();
  await page.getByRole("tab",{name:"Arquivos e requisitos"}).click();
  await page.getByRole("heading",{name:"Requisitos e cobertura"}).waitFor();
  assert.equal(await page.getByLabel("Cole a especificação, critérios de aceite ou regras de negócio").count(),0,
    "The resource listing must not show inline import forms");
  await page.getByRole("button",{name:"Gerenciar requisitos",exact:true}).click();
  const requirementModal=page.getByRole("dialog",{name:"Importar requisitos"});
  await requirementModal.waitFor();
  const sourceField = requirementModal.getByLabel("Cole a especificação, critérios de aceite ou regras de negócio");
  // Lazy panel loading can make isVisible() return false before the
  // controlled native details has mounted. Wait for its summary first.
  const importSummary=page.getByText("Importar requisitos de texto (prévia e revisão)");
  await importSummary.waitFor();
  if (!(await sourceField.isVisible())) await importSummary.click();
  await sourceField.waitFor({state:"visible"});
  await page.getByLabel("Cole a especificação, critérios de aceite ou regras de negócio")
    .fill("RF001: A remoção de desconto deve atualizar o total do pedido.");
  await page.getByRole("button",{name:"Organizar",exact:true}).click();
  await page.getByRole("button",{name:/Aprovar selecionados na prévia/}).click();
  await page.getByRole("button",{name:/Salvar 1 revisado/}).click();
  await page.getByText(/1 requisito\(s\) importado/).waitFor();
  assert.equal(requirementImports,1);
  assert.equal(requirements.length,1);
  assert.equal(requirements[0].estado,"aprovado");
  await page.getByRole("tab",{name:"Cobertura"}).click();
  await page.getByRole("button",{name:"Vincular cenários"}).click();
  await page.getByRole("checkbox",{name:/Remover desconto/}).check();
  await page.getByRole("button",{name:"Salvar vínculos"}).click();
  await page.getByText(/1 cenário\(s\) associado/).waitFor();
  assert.equal(coverageSaves,1);
  assert.equal(requirementLinks.length,1);
  assert.equal(requirementLinks[0].cenario_id,scenarios[0].id);
  assert.equal(scenarios[0].status,"nao_executado");
  assert.equal(tasks[0].status,"rascunho");
  await requirementModal.getByRole("button",{name:"Fechar Importar requisitos"}).click();
  await page.getByRole("tablist",{name:"Documentos e informações de apoio"})
    .getByRole("tab",{name:"Requisitos",exact:true}).click();
  await page.getByText(/RF-?001/).first().waitFor();
  await page.getByRole("tab",{name:"Arquivos e evidências"}).click();
  await page.getByRole("heading",{name:"Evidências de execução"}).waitFor();
  mkdirSync("artifacts/f3-evidence",{recursive:true});
  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const widths=await page.evaluate(()=>{
      const panel=document.getElementById("qa-task-resource-panel-files");
      return {document:document.documentElement.scrollWidth-innerWidth,
        modal:panel?panel.scrollWidth-panel.clientWidth:999};
    });
    assert.ok(widths.document<=1&&widths.modal<=1,
      "F3 evidence overflow at "+width+": "+JSON.stringify(widths));
    const audit=await page.evaluate(async()=>window.axe.run(document,{
      runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
      rules:{region:{enabled:false}}
    }));
    assert.deepEqual(audit.violations.map(v=>({
      id:v.id,targets:v.nodes.slice(0,3).map(n=>n.target.join(" "))
    })),[],"F3 evidence WCAG at "+width);
    await page.screenshot({path:"artifacts/f3-evidence/evidence-"+width+".png"});
  }
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.getByRole("textbox",{name:"Descrição (opcional)"}).count(),0,
    "Evidence upload must not appear in the file listings");
  await page.getByRole("button",{name:"Adicionar arquivo",exact:true}).click();
  const fileModal=page.getByRole("dialog",{name:"Importar arquivos e evidências"});
  await fileModal.getByRole("button",{name:"Evidência do teste"}).click();
  await fileModal.getByRole("textbox",{name:"Descrição (opcional)"}).fill("Captura sintética do pedido");
  await fileModal.locator('.qa-resource-import-body > div:not([hidden]) input[type="file"]').setInputFiles({
    name:"captura.png",mimeType:"image/png",buffer:samplePng
  });
  await page.getByRole("button",{name:"Anexar arquivo"}).click();
  await page.getByText(/Anexo registrado/).waitFor();
  assert.equal(uploadedBytes,1);
  assert.equal(fileSaves,1);
  assert.equal(evidenceFiles[0].mime_type,"image/png");
  assert.equal(evidenceFiles[0].tamanho_bytes,samplePng.length);
  assert.equal(evidenceFiles[0].descricao,"Captura sintética do pedido");
  assert.equal(tasks[0].status,"rascunho","Anexar arquivo não aprova a TF.");
  await fileModal.getByRole("button",{name:"Fechar Importar arquivos e evidências"}).click();
  await page.getByLabel("Arquivos da TF").getByRole("button",{name:"Visualizar"}).click();
  await page.getByRole("dialog",{name:/Visualizar arquivo/}).waitFor({timeout:8000});
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Adicionar arquivo",exact:true}).click();
  await fileModal.getByRole("button",{name:"Evidência do teste"}).click();
  await page.getByText("Adicionar observação ou link").click();
  await page.getByLabel(/Resumo do que foi observado/).fill("Desconto removido com o comportamento esperado.");
  await page.getByRole("button",{name:"Salvar evidência"}).click();
  await page.getByText(/Evidência registrada/).waitFor();
  assert.equal(evidenceSaves,1);
  assert.equal(evidenceRows.length,1);
  assert.equal(evidenceRows[0].tarefa_id,taskId);
  assert.equal(evidenceRows[0].tipo,"observacao");
  await fileModal.getByRole("button",{name:"Fechar Importar arquivos e evidências"}).click();
  await page.getByRole("tab",{name:"Auditoria"}).click();
  await page.getByText("Nenhum evento encontrado.").waitFor();
  await page.getByRole("tab",{name:"Releases e referências"}).click();
  const linkPanel=page.locator("section[aria-labelledby='links-heading']");
  await linkPanel.getByRole("heading",{name:"Releases e referências"}).waitFor();
  assert.equal(await linkPanel.getByLabel(/Versão \(ex/).count(),0);
  await page.getByRole("button",{name:"Adicionar vínculo",exact:true}).click();
  const linksModal=page.getByRole("dialog",{name:"Adicionar release ou referência"});
  const editLinks=linksModal.locator("section[aria-labelledby='links-heading']");
  await editLinks.getByLabel(/Versão \(ex/).fill("12.10.06.0000");
  await editLinks.getByRole("button",{name:"Vincular release"}).click();
  await page.getByText("Release vinculada à TF sem alterar seus testes.").waitFor();
  assert.equal(releaseSaves,1);
  assert.equal(releases[0].versao,"12.10.06.0000");
  await editLinks.getByRole("tab",{name:"Referências"}).click();
  await editLinks.getByLabel("Título").fill("Checklist de desconto");
  await editLinks.getByLabel("Conteúdo").fill("Verificar a atualização do total.");
  await editLinks.getByRole("button",{name:"Salvar referência"}).click();
  await page.getByText("Referência privada salva.").waitFor();
  assert.equal(referenceSaves,1);
  assert.equal(referenceRows.length,1);
  await editLinks.getByRole("tab",{name:"Comparações"}).click();
  await editLinks.getByLabel("Texto A (original)").fill("Linha um\nValor antigo");
  await editLinks.getByLabel("Texto B (novo)").fill("Linha um\nValor novo");
  await editLinks.getByRole("button",{name:"Comparar textos"}).click();
  const recordCounts=editLinks.getByRole("button",{name:"Salvar somente contagens na TF"});
  await recordCounts.waitFor();
  assert.equal(comparisonSaves,0,"Diff local não grava conteúdo nem metadados automaticamente");
  page.once("dialog",(dialog)=>void dialog.accept());
  await recordCounts.click();
  await page.getByText("Somente os indicadores foram registrados na TF. Os textos permanecem no navegador.").waitFor();
  assert.equal(comparisonSaves,1);
  assert.equal(comparisonRows[0].tipo,"diff_texto");
  assert.equal(comparisonRows[0].adicionados,1);
  assert.equal(comparisonRows[0].removidos,1);
  await editLinks.getByRole("button",{name:"XML por estrutura"}).click();
  await editLinks.getByLabel("XML A (original)").fill("<root><valor id='1'>antigo</valor></root>");
  await editLinks.getByLabel("XML B (novo)").fill("<root><valor id='1'>novo</valor></root>");
  await editLinks.getByRole("button",{name:"Comparar XML"}).click();
  await page.getByText(/VALOR.*antigo.*novo/).waitFor();
  assert.equal(comparisonSaves,1,"Análise XML não deve ser salva automaticamente");
  await linkPanel.getByLabel("XML A (original)").fill(
    "<!DOCTYPE root [<!ENTITY sample 'x'>]><root>&sample;</root>");
  await linkPanel.getByRole("button",{name:"Comparar XML"}).click();
  await page.getByText(/XML com DTD, entidades/).waitFor();
  assert.equal(comparisonSaves,1);
  assert.equal(scenarios[0].status,"nao_executado");
  assert.equal(tasks[0].status,"rascunho");
  await linksModal.getByRole("button",{name:"Fechar Adicionar release ou referência"}).click();
  await page.getByRole("tab",{name:"Arquivos e evidências"}).click();
  await page.getByRole("button",{name:"Adicionar arquivo",exact:true}).click();
  const reqPanel=fileModal.locator("section[aria-labelledby='qa-task-source-files-heading']");
  const fileInput=reqPanel.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name:"requisitos.pdf",mimeType:"application/pdf",
    buffer:makePdf("RF001: O sistema deve atualizar o pedido.")
  });
  await reqPanel.getByRole("button",{name:"Verificar arquivo"}).click();
  await page.getByText(/Arquivo verificado/).waitFor({timeout:25000});
  const preview=reqPanel.getByLabel("Texto que será associado ao arquivo (prévia de leitura)");
  assert.match(await preview.inputValue(),/RF001: O sistema deve atualizar o pedido/);
  await fileInput.setInputFiles({
    name:"requisitos.docx",
    mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer:await makeDocx("RF002: O campo desconto deve aceitar revisao.")
  });
  await reqPanel.getByRole("button",{name:"Verificar arquivo"}).click();
  await page.getByText(/Arquivo verificado/).waitFor({timeout:25000});
  assert.match(await preview.inputValue(),/RF002: O campo desconto deve aceitar revisao/);
  assert.equal(await reqPanel.getByRole("button",{name:"Anexar documento"}).isDisabled(),false);
  // Selecting and extracting locally must never write any file into Storage.
  assert.deepEqual(failures,[]);
  console.log("E2E sintético React: QA, IA, R1-R4, evidências, release, diff e extração local PDF/DOCX.");
}finally{await browser.close()}
