import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";

const root="http://127.0.0.1:4173/QA-Hub/";
const userId="11111111-1111-4111-8111-111111111111";
const taskId="22222222-2222-4222-8222-222222222222";
const user={
  id:userId,email:"f1-guided@fixture.invalid",aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-08T12:00:00Z"
};
const task={
  id:taskId,user_id:userId,titulo:"Execução guiada de descontos",
  codigo:"QA-101",descricao:"Dados exclusivamente sintéticos",
  tipo_teste:"BUILD",status:"em_teste",sistema:"Financeiro",versao:"1.0",publica:false
};
const otherTaskId="77777777-7777-4777-8777-777777777777";
const otherTask={...task,id:otherTaskId,titulo:"Outra TF independente",codigo:"QA-102"};
const scenarios=[
  {id:"33333333-3333-4333-8333-333333333333",titulo:"Venda sem desconto",ordem:1,
    status:"nao_executado",obtido:""},
  {id:"44444444-4444-4444-8444-444444444444",titulo:"Retirar desconto",ordem:2,
    status:"nao_executado",obtido:""},
  {id:"55555555-5555-4555-8555-555555555555",titulo:"Kit desdobrado",ordem:3,
    status:"nao_executado",obtido:""},
  {id:"66666666-6666-4666-8666-666666666666",titulo:"Falha anterior",ordem:4,
    status:"reprovado",obtido:"Desconto persistiu no pedido."}
].map(item=>({...item,tarefa_id:taskId,user_id:userId,
  passos:"Abrir pedido e executar alteração",esperado:"Total atualizado",observacoes:""}));
const otherScenario={...scenarios[0],id:"88888888-8888-4888-8888-888888888888",
  titulo:"Cenário de outra TF",tarefa_id:otherTaskId,status:"nao_executado",obtido:""};
const mutations=[],unexpected=[];
let failOnce=true;
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,PUT,OPTIONS"
};
async function mock(route){
  const request=route.request(),url=new URL(request.url());
  const path=url.pathname,method=request.method();
  const send=(value,status=200)=>route.fulfill({status,headers:cors,
    contentType:"application/json",body:JSON.stringify(value)});
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"fixture-refresh",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(await mockF4Rpc(route,[task,otherTask],[...scenarios,otherScenario]))return;
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/qa_tarefas") && method==="GET")
    return send([task,otherTask]);
  if(path.endsWith("/rest/v1/qa_cenarios")){
    if(method==="GET"){
      if(url.searchParams.get("tarefa_id")==="eq."+otherTaskId)return send([otherScenario]);
      return send(scenarios);
    }
    if(method==="PATCH"){
      assert.equal(url.searchParams.get("tarefa_id"),"eq."+taskId);
      const id=url.searchParams.get("id")?.slice(3);
      const found=scenarios.find(x=>x.id===id);
      assert.ok(found);
      const data=request.postDataJSON();
      assert.deepEqual(Object.keys(data).sort(),["obtido","status","updated_at"]);
      if(failOnce){
        failOnce=false;
        return send({message:"Rede de teste temporariamente indisponível"},503);
      }
      mutations.push({id,status:data.status,obtido:data.obtido});
      Object.assign(found,{status:data.status,obtido:data.obtido});
      return send({id},200);
    }
  }
  if(path.endsWith("/rest/v1/qa_evidencias") && method==="GET")return send([]);
  if(path.endsWith("/rest/v1/qa_evidencia_arquivos") && method==="GET")return send([]);
  unexpected.push(method+" "+path);
  return send({message:"Unexpected synthetic request"},500);
}
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",e=>unexpected.push("PAGE "+e.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
  await page.goto(root);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("fixture-only");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  await page.goto(root+"#/tarefa/"+taskId);
  await page.getByRole("heading",{name:task.titulo}).waitFor({timeout:15000});
  await page.getByRole("button",{name:"Abrir ações rápidas da TF"}).click();
  await page.getByRole("group",{name:"Ações rápidas da TF"})
    .getByRole("button",{name:"Executar testes"}).click();

  const guided=page.getByRole("region",{name:"Execução guiada dos testes"});
  await guided.waitFor();
  assert.equal(await page.getByRole("button",{name:"Guiado",exact:true}).getAttribute("aria-pressed"),"true");
  const first=guided.getByRole("group",{name:"Registrar resultado de Venda sem desconto"});
  await first.waitFor();
  assert.equal(mutations.length,0,"Opening guided view cannot save any result");

  mkdirSync("artifacts/f1-guided",{recursive:true});
  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  for (const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    if(overflow>1) {
      console.log("OVERFLOW",width,await page.evaluate(()=>[...document.querySelectorAll("body *")]
        .filter(el=>el.getClientRects().length && el.getBoundingClientRect().right>innerWidth+1)
        .map(el=>({tag:el.tagName,cls:el.className?.baseVal??el.className,
          text:el.textContent?.slice(0,45),left:el.getBoundingClientRect().left,
          right:el.getBoundingClientRect().right})).slice(0,20)));
      await page.screenshot({path:"artifacts/f1-guided/overflow-"+width+".png"});
    }
    assert.ok(overflow<=1,"Guided overflow "+width+" = "+overflow);
    const axe=await page.evaluate(async()=>window.axe.run(document,{
      runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
      rules:{region:{enabled:false}}
    }));
    assert.deepEqual(axe.violations.map(v=>({
      rule:v.id,targets:v.nodes.slice(0,3).map(node=>node.target.join(" "))
    })),[],"WCAG guided "+width);
    await page.screenshot({path:"artifacts/f1-guided/guided-"+width+".png"});
  }
  await page.setViewportSize({width:390,height:844});
  await first.getByRole("button",{name:"Funcionou",exact:true}).click();
  await page.getByRole("alert").getByText("Rede de teste temporariamente indisponível").waitFor();
  assert.equal(mutations.length,0,"Failed backend save cannot advance to next case");
  assert.equal(scenarios[0].status,"nao_executado");
  assert.equal(await first.count(),1);

  await first.getByRole("button",{name:"Funcionou",exact:true}).click();
  await guided.getByRole("group",{name:"Registrar resultado de Retirar desconto"}).waitFor();
  assert.deepEqual(mutations[0],{
    id:scenarios[0].id,status:"aprovado",obtido:""
  });
  assert.equal(task.status,"em_teste");

  const second=guided.getByRole("group",{name:"Registrar resultado de Retirar desconto"});
  await second.getByRole("button",{name:"Não funcionou"}).click();
  const observation=guided.getByRole("textbox",{name:/Comportamento observado/});
  await observation.fill("a");
  assert.equal(await guided.getByRole("button",{name:"Salvar resultado"}).isDisabled(),true);
  await observation.fill("Desconto permaneceu aplicado.");
  assert.equal(mutations.length,1,"Typing the observation cannot save results");
  await guided.getByRole("button",{name:"Salvar resultado"}).click();
  await guided.getByRole("group",{name:"Registrar resultado de Kit desdobrado"}).waitFor();
  assert.equal(scenarios[1].status,"reprovado");
  assert.equal(scenarios[1].obtido,"Desconto permaneceu aplicado.");

  const third=guided.getByRole("group",{name:"Registrar resultado de Kit desdobrado"});
  await third.getByRole("button",{name:"Bloqueado"}).click();
  await guided.getByRole("textbox",{name:/Comportamento observado/})
    .fill("Não foi possível abrir o pedido no ambiente.");
  await guided.getByRole("button",{name:"Salvar resultado"}).click();
  await guided.getByRole("heading",{name:"Sem cenários pendentes"}).waitFor();
  assert.equal(mutations.length,3);
  assert.equal(scenarios[2].status,"bloqueado");
  assert.equal(task.status,"em_teste","Finishing cases must not change task status");

  await guided.getByRole("button",{name:/Revisar todos os resultados/}).click();
  await guided.getByRole("group",{name:"Registrar resultado de Venda sem desconto"}).waitFor();
  for(let i=0;i<3;i++)await guided.getByRole("button",{name:"Próximo"}).click();
  const historic=guided.getByRole("group",{name:"Registrar resultado de Falha anterior"});
  await historic.waitFor();
  page.once("dialog",dialog=>void dialog.dismiss());
  await historic.getByRole("button",{name:"Funcionou",exact:true}).click();
  assert.equal(scenarios[3].status,"reprovado");
  assert.equal(mutations.length,3,"Canceled update may not erase failure notes");
  page.once("dialog",dialog=>void dialog.accept());
  await historic.getByRole("button",{name:"Funcionou",exact:true}).click();
  await page.waitForFunction(()=>window.document.querySelector(".qa-guided-card .status-chip")?.textContent?.includes("Aprovado"));
  assert.equal(scenarios[3].status,"aprovado");
  assert.equal(scenarios[3].obtido,"","Older failure note must be removed from an approval");
  assert.equal(mutations.length,4);

  await guided.getByRole("button",{name:"Adicionar evidência"}).click();
  const evidence=page.getByRole("dialog",{name:"Evidências e auditoria"});
  await evidence.waitFor({timeout:18000});
  await evidence.getByLabel("Cenário relacionado (opcional)").waitFor();
  assert.equal(await evidence.getByLabel("Cenário relacionado (opcional)").inputValue(),scenarios[3].id);
  await page.getByRole("button",{name:"Fechar Evidências e auditoria"}).click();

  await page.getByRole("button",{name:"Lista",exact:true}).click();
  assert.equal(await page.getByRole("button",{name:"Lista",exact:true}).getAttribute("aria-pressed"),"true");
  await page.getByRole("group",{name:"Resultado de Falha anterior"}).waitFor();
  assert.equal(mutations.length,4);

  // Route-to-route reuse must not keep a draft or scenario from a different TF.
  await page.getByRole("button",{name:"Guiado",exact:true}).click();
  await guided.getByRole("button",{name:"Não funcionou"}).click();
  await guided.getByRole("textbox",{name:/Comportamento observado/})
    .fill("Rascunho privado não salvo de outra tarefa");
  await page.evaluate(id=>{location.hash="#/tarefa/"+id;},otherTaskId);
  await page.getByRole("heading",{name:"Outra TF independente"}).waitFor();
  await page.getByRole("tab",{name:/Testes/}).click();
  await page.getByRole("button",{name:"Guiado",exact:true}).click();
  await guided.getByRole("group",{name:"Registrar resultado de Cenário de outra TF"}).waitFor();
  assert.equal(await guided.getByText("Rascunho privado não salvo de outra tarefa").count(),0);
  assert.equal(mutations.length,4,"Switching TFs must never save an unsaved draft");
  assert.deepEqual(unexpected,[]);
  console.log("F1 guided: 4 breakpoints WCAG, failure retry, inline notes, next after save, completion, review, evidence prefill and task isolation.");
}finally{await browser.close();}
