import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
import {mockF4Rpc} from "./f4-mock-rpc.mjs";

const ROOT="http://127.0.0.1:4173/QA-Hub/";
const USER="11111111-1111-4111-8111-111111111111";
const user={
  id:USER,email:"new-tf-text@fixture.invalid",aud:"authenticated",
  role:"authenticated",app_metadata:{provider:"email",providers:["email"]},
  user_metadata:{},created_at:"2026-11-08T10:00:00Z"
};
const tasks=[],scenarios=[],errors=[],aiPayloads=[];
let taskWrites=0,scenarioWrites=0,fallback=false;
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
};
async function backend(route){
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const send=(body,status=200)=>route.fulfill({
    status,headers:cors,contentType:"application/json",body:JSON.stringify(body)
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
    const body=req.postDataJSON();
    aiPayloads.push(body);
    assert.deepEqual(Object.keys(body),["text"]);
    if(fallback)return send({draft:{},fallback:true,provider:"NVIDIA Build"});
    return send({
      provider:"NVIDIA Build",
      draft:{
        titulo:"Validação dos descontos no pedido",codigo:"78912",
        sistema:"Financeiro",versao:"12.08",tipo_teste:"BUILD",
        descricao:"Verificar o desconto aplicado à compra.",
        causa:"O rateio antigo ignora descontos negativos.",
        cenarios:[{
          titulo:"Remover desconto da compra",passos:"Abrir o pedido e remover desconto.",
          esperado:"O total deve ser atualizado.",obtido:"",
          observacoes:"Usar dados sintéticos."
        }]
      }
    });
  }
  if(await mockF4Rpc(route,tasks,scenarios))return;
  if(path.endsWith("/rest/v1/qa_tarefas")){
    if(method==="POST"){
      taskWrites++;
      const payload=req.postDataJSON();
      assert.equal(payload.user_id,USER);
      assert.equal(payload.status,"rascunho");
      const row={...payload,
        id:"33333333-3333-4333-8333-"+String(taskWrites).padStart(12,"0"),
        executado_em:"2026-11-08",created_at:"2026-11-08T11:00:00Z"};
      tasks.push(row);
      return send(row,201);
    }
    if(method==="GET")return send(tasks);
  }
  if(path.endsWith("/rest/v1/qa_cenarios")){
    if(method==="POST"){
      const rows=req.postDataJSON(),items=Array.isArray(rows)?rows:[rows];
      for(const item of items){
        scenarioWrites++;
        assert.equal(item.status,"nao_executado");
        assert.equal(item.obtido,"");
        scenarios.push({...item,id:"44444444-4444-4444-8444-"+
          String(scenarioWrites).padStart(12,"0")});
      }
      return send(null,201);
    }
    if(method==="GET")return send(scenarios);
  }
  errors.push(method+" "+path);
  return send({message:"Unexpected synthetic endpoint"},500);
}
mkdirSync("artifacts/new-tf-source",{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",err=>errors.push("PAGE: "+err.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",backend);
  await page.goto(ROOT);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("fixture-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  await page.getByRole("button",{name:"Nova TF"}).click();
  const modal=page.getByRole("dialog",{name:"Nova TF"});
  await modal.waitFor();
  await page.waitForFunction(()=>document.activeElement?.getAttribute("name")==="descricao");
  assert.equal(await modal.getByText("IA generativa local").count(),0);
  assert.equal(await modal.getByRole("button",{name:"Analisar com IA local"}).count(),0);
  const generate=modal.getByRole("button",{name:"Gerar com IA NVIDIA"});
  assert.equal(await generate.isDisabled(),true,"No source or consent yet");

  const source=modal.getByLabel("Descrição / problema");
  const pasted="Pedido 78912 versão 12.08. Remover desconto negativo e recalcular total. O rateio ignora valores negativos.";
  await source.fill(pasted);
  assert.equal(await generate.isDisabled(),true,"Sending requires current-text consent");
  await modal.getByRole("checkbox",{name:/Autorizo enviar este texto à NVIDIA/}).check();
  assert.equal(await generate.isEnabled(),true,"Pasted text must allow AI without upload");
  await generate.click();
  await modal.getByText("Prévia da NVIDIA pronta.",{exact:false}).waitFor({timeout:20000});
  assert.equal(aiPayloads.length,1);
  assert.equal(aiPayloads[0].text,pasted);
  assert.equal(taskWrites,0,"AI preview must not create TF");
  await modal.getByRole("button",{name:"Aplicar campos revisados"}).click();
  assert.equal(await modal.getByLabel("Título da tarefa").inputValue(),
    "Validação dos descontos no pedido");
  assert.equal(await source.inputValue(),pasted,"Pasted source must be preserved");
  await modal.getByRole("checkbox",{name:/Remover desconto da compra/}).check();
  await modal.getByRole("button",{name:"Salvar e abrir TF"}).click();
  await page.getByRole("heading",{name:"Validação dos descontos no pedido"}).waitFor();
  assert.equal(taskWrites,1);
  assert.equal(scenarioWrites,1);
  assert.equal(scenarios[0].status,"nao_executado");
  assert.equal(scenarios[0].obtido,"");
  assert.equal(tasks[0].codigo,"78912");

  await page.goto(ROOT);
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor();
  await page.getByRole("button",{name:"Nova TF"}).click();
  await modal.waitFor();
  const file=modal.locator('input[type="file"]');
  await file.setInputFiles({
    name:"relato.txt",mimeType:"text/plain",
    buffer:Buffer.from("TÍTULO: Revisar pagamentos\nCÓDIGO: 99112\nO QUE FOI TESTADO: Validar baixas financeiras.")
  });
  await modal.getByText("Arquivo lido e texto inserido.",{exact:false}).waitFor();
  assert.match(await source.inputValue(),/Revisar pagamentos/);
  assert.equal(aiPayloads.length,1,"File reading must never automatically call NVIDIA");
  await modal.getByRole("button",{name:"Extrair campos sem IA"}).click();
  await modal.getByText("Campos extraídos sem IA.",{exact:false}).waitFor();
  await modal.getByRole("button",{name:"Aplicar campos revisados"}).click();
  assert.match(await modal.getByLabel("Título da tarefa").inputValue(),/Revisar pagamentos/);
  await modal.getByRole("button",{name:"Salvar e abrir TF"}).click();
  await page.getByRole("heading",{name:/Revisar pagamentos/}).waitFor();
  assert.equal(taskWrites,2);
  assert.equal(aiPayloads.length,1,"No-AI extraction must not send text to provider");

  await page.goto(ROOT);
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor();
  await page.getByRole("button",{name:"Nova TF"}).click();
  await modal.waitFor();
  await modal.getByLabel("Título da tarefa").fill("TF totalmente manual");
  await modal.getByRole("button",{name:"Salvar e abrir TF"}).click();
  await page.getByRole("heading",{name:"TF totalmente manual"}).waitFor();
  assert.equal(taskWrites,3,"Manual creation must not require source or file");

  await page.goto(ROOT);
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor();
  await page.getByRole("button",{name:"Nova TF"}).click();
  await modal.waitFor();
  await source.fill("Testar falha da IA sem preencher qualquer campo.");
  fallback=true;
  await modal.getByRole("checkbox",{name:/Autorizo enviar este texto à NVIDIA/}).check();
  await generate.click();
  await modal.getByText(/A NVIDIA não retornou campos válidos/).waitFor();
  assert.equal(await modal.getByRole("button",{name:"Aplicar campos revisados"}).count(),0,
    "NVIDIA fallback must not silently turn into local AI output");
  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,"New TF form overflow at "+width);
    const violations=await page.evaluate(async()=>window.axe.run(document,{
      runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
      rules:{region:{enabled:false}}
    }));
    assert.deepEqual(violations.violations.map(v=>v.id),[],"New TF WCAG "+width);
    await page.screenshot({path:"artifacts/new-tf-source/modal-"+width+".png"});
  }
  assert.deepEqual(errors,[]);
  console.log("Nova TF: colar sem arquivo, NVIDIA consentida, arquivo opcional, sem IA, manual e fallback protegido.");
}finally{await browser.close();}
