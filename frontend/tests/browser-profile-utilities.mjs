import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";

const ROOT="http://127.0.0.1:4173/QA-Hub/";
const owner="11111111-1111-4111-8111-111111111111";
let user={id:owner,email:"qa-user@fixture.invalid",aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-08T12:00:00Z"};
const task={id:"22222222-2222-4222-8222-222222222222",user_id:owner,
  titulo:"Revisão de descontos",tipo_teste:"BUILD",codigo:"67866",status:"em_teste",
  sistema:"Financeiro",versao:"12.08",publica:false,
  created_at:"2026-11-08T12:00:00Z"};
const scenario={id:"33333333-3333-4333-8333-333333333333",
  tarefa_id:task.id,user_id:owner,ordem:1,titulo:"Recalcular desconto",
  passos:"Abrir pedido",esperado:"Valor atualizado",obtido:"",observacoes:"",
  status:"nao_executado"};
const errors=[];
let writes=0,aiCalls=0,profileSaves=0;
const referenceRows=[];
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,PUT,OPTIONS"
};
async function mock(route){
  const request=route.request(),url=new URL(request.url());
  const path=url.pathname,method=request.method();
  const send=(data,status=200)=>route.fulfill({
    contentType:"application/json",headers:cors,status,body:JSON.stringify(data)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"fixture-refresh",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user")){
    if(method==="PUT"){
      profileSaves++;
      const data=request.postDataJSON()?.data;
      assert.deepEqual(Object.keys(data),["qa_navigation_v1"]);
      user={...user,user_metadata:{...user.user_metadata,...data}};
      return send({user});
    }
    return send(user);
  }
  if(await mockF4Rpc(route,[task],[scenario]))return;
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/qa_tarefas")&&method==="GET")return send([task]);
  if(path.endsWith("/rest/v1/qa_cenarios")&&method==="GET"){
    if(url.searchParams.get("select")==="tarefa_id,status")
      return send([{tarefa_id:task.id,status:scenario.status}]);
    return send([scenario]);
  }
  if(path.endsWith("/rest/v1/qa_referencias")){
    if(method==="GET")return send(referenceRows);
    if(method==="POST"){
      const payload=request.postDataJSON();
      assert.equal(payload.user_id,owner);
      assert.equal(payload.categoria,"nota");
      const row={...payload,id:"44444444-4444-4444-8444-444444444444",
        created_at:"2026-11-08T12:00:00Z"};
      referenceRows.push(row);
      return send({id:row.id},201);
    }
    if(method==="DELETE"){
      referenceRows.splice(0,referenceRows.length);
      return send({id:"44444444-4444-4444-8444-444444444444"});
    }
  }
  if(path.endsWith("/functions/v1/qa-ai")){
    aiCalls++;
    assert.equal(method,"POST");
    assert.ok(request.postDataJSON()?.text.includes("Revisar"));
    return send({draft:{
      titulo:"Revisar desconto da venda",codigo:"67866",descricao:"Revisar descontos",
      tipo_teste:"BUILD",cenarios:[{titulo:"Validar total",passos:"Abrir pedido",
        esperado:"Total correto",observacoes:""}]
    },provider:"NVIDIA Build"});
  }
  writes++;
  errors.push(method+" "+path);
  return send({message:"Unexpected synthetic request "+path},500);
}

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",error=>errors.push("page: "+error.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
  async function audit(screen,width){
    await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
    const result=await page.evaluate(async()=>window.axe.run(document,{
      runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
      rules:{region:{enabled:false}}
    }));
    assert.deepEqual(result.violations.map(item=>({
      id:item.id,targets:item.nodes.slice(0,3).map(node=>node.target.join(" "))
    })),[],"WCAG "+screen+" at "+width);
  }
  await page.goto(ROOT);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("synthetic-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  const widths=[320,390,768,1366];
  mkdirSync("artifacts/profile-utilities",{recursive:true});
  for(const width of widths){
    await page.setViewportSize({width,height:844});
    await page.goto(ROOT+"#/perfil");
    await page.getByRole("heading",{name:"Perfil e configurações"}).waitFor({timeout:20000});
    assert.equal(await page.getByText("Tarefas",{exact:true}).count()>0,true);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,"Profile overflow at "+width+": "+overflow);
    await audit("profile",width);
    await page.screenshot({path:"artifacts/profile-utilities/profile-"+width+".png"});
    await page.goto(ROOT+"#/ferramentas");
    await page.getByRole("heading",{name:"Ferramentas",exact:true}).waitFor({timeout:15000});
    const toolTabs=page.getByRole("tablist",{name:"Ferramentas disponíveis"});
    assert.equal(await toolTabs.getByRole("tab").count(),3,
      "Tools should have three distinct workspaces, not duplicate text and XML entries");
    assert.equal(await page.getByRole("tabpanel",{name:/Releases/}).isVisible(),true);
    assert.equal(await page.getByRole("tabpanel",{name:/Comparações/}).isVisible(),false);
    const toolsOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(toolsOverflow<=1,"Tools overflow at "+width+": "+toolsOverflow);
    await audit("tools",width);
    await page.screenshot({path:"artifacts/profile-utilities/tools-"+width+".png"});
    for(const [id,label] of [["comparison","Comparações"],["notes","Informações"]]){
      await toolTabs.getByRole("tab",{name:new RegExp(label)}).click();
      await page.getByRole("tabpanel",{name:new RegExp(label)}).waitFor();
      const over=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      assert.ok(over<=1,"Tools "+id+" overflow at "+width+": "+over);
      await audit("tools-"+id,width);
      await page.screenshot({path:"artifacts/profile-utilities/tools-"+id+"-"+width+".png"});
    }
    await page.goto(ROOT+"#/painel");
    await page.getByRole("heading",{name:"Visão geral",exact:true}).waitFor({timeout:15000});
    await page.getByText("Revisão de descontos").waitFor({timeout:12000});
    const dashboardOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(dashboardOverflow<=1,"Dashboard overflow at "+width+": "+dashboardOverflow);
    await audit("dashboard",width);
    await page.screenshot({path:"artifacts/profile-utilities/dashboard-"+width+".png"});
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(ROOT+"#/perfil");
  await page.getByLabel("Personalizar menu lateral").getByRole("checkbox",{name:/Ferramentas/}).uncheck();
  await page.getByLabel("Personalizar menu lateral").getByRole("checkbox",{name:/Públicas/}).uncheck();
  await page.getByRole("button",{name:"Salvar preferências"}).click();
  await page.getByText("Preferências salvas na sua conta.").waitFor();
  assert.equal(profileSaves,1);
  await page.reload();
  await page.getByRole("heading",{name:"Perfil e configurações"}).waitFor();
  assert.equal(await page.getByRole("navigation",{name:"Navegação"})
    .getByRole("link",{name:"Ferramentas"}).count(),0);
  assert.equal(await page.getByRole("navigation",{name:"Navegação"})
    .getByRole("link",{name:"TFs públicas"}).count(),0);
  assert.equal(await page.getByRole("navigation",{name:"Navegação"})
    .getByRole("link",{name:"Tarefas de teste"}).count(),1);
  await page.getByRole("button",{name:"Restaurar seleção"}).click();
  await page.getByRole("button",{name:"Salvar preferências"}).click();
  await page.getByText("Preferências salvas na sua conta.").waitFor();
  assert.equal(profileSaves,2);

  await page.goto(ROOT+"#/ferramentas");
  const toolbox=page.getByRole("tablist",{name:"Ferramentas disponíveis"});
  await toolbox.getByRole("tab",{name:/Comparações/}).click();
  await toolbox.getByRole("tab",{name:/Comparações/}).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await toolbox.getByRole("tab",{name:/Informações/}).getAttribute("aria-selected"),"true");
  await page.keyboard.press("Home");
  assert.equal(await toolbox.getByRole("tab",{name:/Releases/}).getAttribute("aria-selected"),"true");
  await toolbox.getByRole("tab",{name:/Comparações/}).click();
  await page.getByRole("textbox",{name:"Texto A (original)"}).fill("Primeiro\nSegundo");
  await page.getByRole("textbox",{name:"Texto B (novo)"}).fill("Primeiro\nTerceiro");
  await page.getByRole("button",{name:"Comparar textos",exact:true}).last().click();
  await page.getByRole("region",{name:"Diferenças encontradas"}).waitFor();
  await page.getByRole("group",{name:"Formato da comparação"})
    .getByRole("button",{name:"XML por estrutura"}).click();
  await page.getByRole("textbox",{name:"XML A (original)"}).fill("<r><n>1</n></r>");
  await page.getByRole("textbox",{name:"XML B (novo)"}).fill("<r><n>2</n></r>");
  await page.getByRole("button",{name:"Comparar XML",exact:true}).last().click();
  await page.getByRole("region",{name:"Diferenças encontradas"}).waitFor();
  await toolbox.getByRole("tab",{name:/Releases/}).click();
  await toolbox.getByRole("tab",{name:/Comparações/}).click();
  assert.equal(await page.getByRole("textbox",{name:"XML A (original)"}).inputValue(),
    "<r><n>1</n></r>","Switching tools must preserve the XML draft");
  await page.getByRole("group",{name:"Formato da comparação"})
    .getByRole("button",{name:"Texto linha a linha"}).click();
  assert.equal(await page.getByRole("textbox",{name:"Texto A (original)"}).inputValue(),
    "Primeiro\nSegundo","Text draft survives switching modes");
  await toolbox.getByRole("tab",{name:/Informações/}).click();
  await page.getByRole("heading",{name:"Informações importantes"}).waitFor();
  assert.equal(await page.getByRole("textbox",{name:"Título"}).count(),0,
    "The reference editor must not be shown inline in the browsing workspace");
  await page.getByRole("button",{name:"Nova informação"}).click();
  const noteModal=page.getByRole("dialog",{name:"Nova informação"});
  await noteModal.waitFor();
  await noteModal.getByRole("textbox",{name:"Título"}).fill("Regra de descontos");
  await noteModal.getByRole("textbox",{name:"Conteúdo"}).fill("Verificar cálculo após remoção de desconto");
  await noteModal.getByRole("button",{name:"Salvar referência"}).click();
  await noteModal.waitFor({state:"detached"});
  await page.getByText("Informação privada salva na biblioteca.").waitFor();
  await page.getByRole("searchbox",{name:"Pesquisar registros"}).fill("Regra de descontos");
  await page.getByText("Verificar cálculo após remoção de desconto").waitFor();
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"Excluir"}).click();
  await page.getByText("Referência excluída.").waitFor();
  assert.equal(referenceRows.length,0);
  await toolbox.getByRole("tab",{name:/Releases/}).click();
  await page.getByRole("textbox",{name:"Versão da release"}).fill("12.10.06.0000");
  await page.getByRole("textbox",{name:"Lista autorizada de tarefas"}).fill("Status 12\n#67866 — BUG — Desconto");
  await page.getByRole("button",{name:"Organizar lista"}).click();
  await page.getByRole("region",{name:"Lista organizada"}).waitFor();

  await page.goto(ROOT);
  await page.getByRole("button",{name:"Nova TF"}).click();
  const form=page.getByRole("dialog",{name:/Nova TF — etapa/});
  await form.waitFor();
  await form.getByLabel("Adicionar arquivos da tarefa").setInputFiles({
    name:"relatorio.txt",mimeType:"text/plain",
    buffer:Buffer.from("TÍTULO: Revisar desconto\nRevisar descontos ao fechar o pedido.")
  });
  await form.getByText("relatorio.txt").waitFor();
  assert.equal(aiCalls,0,"Reading files locally must not contact the AI service");
  assert.equal(await form.getByRole("button",{name:"Gerar tarefa com IA"}).isDisabled(),true);
  await form.getByRole("checkbox",{name:/Autorizo enviar o texto colado/}).check();
  await form.getByRole("button",{name:"Gerar tarefa com IA"}).click();
  await form.getByRole("heading",{name:"Nova TF — etapa 2 de 3"}).waitFor();
  assert.equal(await form.getByRole("textbox",{name:"Título da tarefa"}).inputValue(),
    "Revisar desconto da venda");
  assert.equal(aiCalls,1);
  assert.equal(writes,0,"The AI may fill a preview but must not save before finalization");
  assert.deepEqual(errors,[]);
  console.log("Profile and legacy tools: navigation persisted, task grouping, local utilities, file import and online AI with consent.");
}finally{await browser.close();}
