import assert from "node:assert/strict";
import { chromium } from "playwright";

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
const scenarios=[],documents=[],failures=[];
let aiCalls=0,attachCalls=0,postSaves=0;
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
  if(p.endsWith("/rest/v1/qa_admins"))return send(null);
  if(p.endsWith("/rest/v1/qa_tarefas"))return send(tasks);
  if(p.endsWith("/rest/v1/qa_cenarios"))return send(scenarios);
  if(p.endsWith("/rest/v1/qa_requisitos"))return send([]);
  if(p.endsWith("/rest/v1/qa_documentos"))return send(documents);
  if(p.endsWith("/rest/v1/qa_evidencias"))return send([]);
  if(p.endsWith("/rest/v1/qa_eventos"))return send([]);
  if(p.endsWith("/rest/v1/qa_generator_tests"))return send([],201);
  if(p.endsWith("/rest/v1/qa_generator_posts"))return send([],201);
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
    aiCalls++;
    const payload=req.postDataJSON();
    assert.equal(payload.tarefa.includes("Validação de descontos"),true);
    const text=payload.mode==="teste"
      ? "# ROTEIRO\n## Cenário 01 — Remover desconto\n### Passos\n1. Acessar pagamentos\n2. Remover desconto\n### Resultado esperado\n- Desconto removido\n"
      : "# DESCONTO EM PAGAMENTOS\n\nFoi implementada correção do desconto.\n\nAnteriormente, descontos negativos eram ignorados. Agora, são processados.\n\n**Caminho de acesso:**\nFinanceiro >> Pagamentos >> Remover desconto\n\n[Imagem: captura-do-desconto.png]\n\n**Comportamento detalhado**\n1. **Desconto**\n   A operação remove o desconto corretamente.\n\n**TAREFA:** 78912\n**JUSTIFICATIVA:** Corrigir divergência relatada.";
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
  await page.getByRole("button",{name:/Gerar casos com IA/}).click();
  await page.getByRole("heading",{name:"Gerar casos de teste"}).waitFor();
  const generate=page.getByRole("button",{name:"Gerar roteiro",exact:true});
  assert.equal(await generate.isDisabled(),true);
  assert.equal(aiCalls,0);
  await page.getByRole("checkbox",{name:/Autorizo enviar os textos/}).check();
  await generate.click();
  const attach=page.getByRole("button",{name:/Anexar 1 caso/});
  await attach.waitFor({timeout:20000});
  assert.equal(attachCalls,0,"IA não pode persistir execução automaticamente");
  await attach.click();
  await page.getByText(/1 cenário\(s\) anexado/).waitFor();
  assert.equal(scenarios.length,1);
  assert.equal(scenarios[0].status,"nao_executado");
  assert.equal(tasks[0].status,"rascunho");
  await page.getByRole("button",{name:/Gerar post com IA/}).click();
  await page.getByRole("heading",{name:"Gerar post técnico"}).waitFor();
  await page.getByRole("checkbox",{name:/Autorizo enviar os textos/}).check();
  await page.getByRole("button",{name:"Gerar post",exact:true}).click();
  const save=page.getByRole("button",{name:"Salvar post na TF"});
  await save.waitFor({timeout:20000});
  await save.click();
  await page.getByText(/Post salvo em Documentos/).waitFor();
  assert.equal(postSaves,1);
  assert.equal(aiCalls,2);
  assert.deepEqual(failures,[]);
  console.log("E2E sintético React: login, contexto/consentimento, roteiro, casos não executados e post.");
}finally{await browser.close()}
