import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
import {mockF4Rpc} from "./f4-mock-rpc.mjs";

const ROOT="http://127.0.0.1:4173/QA-Hub/";
const OWNER="11111111-1111-4111-8111-111111111111";
const TESTER="22222222-2222-4222-8222-222222222222";
const TASK="33333333-3333-4333-8333-333333333333";
const SCENARIO="44444444-4444-4444-8444-444444444444";
const TEAM="55555555-5555-4555-8555-555555555555";
const INVITE="66666666-6666-4666-8666-666666666666";
const COMMENT="77777777-7777-4777-8777-777777777777";
const users=[
 {id:OWNER,email:"owner@fixture.invalid"},
 {id:TESTER,email:"tester@fixture.invalid"}
].map(value=>({
 ...value,aud:"authenticated",role:"authenticated",
 app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
 created_at:"2026-11-08T12:00:00Z"
}));
const task={
 id:TASK,user_id:OWNER,titulo:"Desconto por produto",codigo:"QA-7801",
 status:"em_teste",tipo_teste:"BUILD",sistema:"Vendas",versao:"12.08",
 descricao:"Verificar comportamento do desconto em itens.",publica:false,
 executado_em:"2026-11-08",created_at:"2026-11-08T10:00:00Z"
};
const scenario={
 id:SCENARIO,tarefa_id:TASK,user_id:OWNER,titulo:"Remover desconto",
 passos:"Abrir pedido e remover desconto",esperado:"Total atualizado",
 obtido:"",observacoes:"",status:"nao_executado",ordem:1
};
let team=null,invite=null,linked=null,assigned=null;
const members=[],comments=[],githubLinks=[],writes=[],errors=[];
const cors={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
 "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
};
function memberOf(id){return members.find(item=>item.usuario_id===id);}
function canSee(id){return id===OWNER||Boolean(linked&&memberOf(id));}
function mockFor(user){
 return async function respond(route){
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const payload=method!=="GET"&&method!=="OPTIONS"?req.postDataJSON():null;
  const send=(value,status=200)=>route.fulfill({
   status,headers:cors,contentType:"application/json",body:JSON.stringify(value)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
   access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
   refresh_token:"fixture-"+user.id,token_type:"bearer",expires_in:3600,
   expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(await mockF4Rpc(route,canSee(user.id)?[task]:[],
    canSee(user.id)?[scenario]:[]))return;

  if(path.endsWith("/rest/v1/qa_tarefas")&&method==="GET"){
   const userFilter=url.searchParams.get("user_id");
   return send(canSee(user.id)&&(!userFilter||userFilter==="eq."+OWNER)?[task]:[]);
  }
  if(path.endsWith("/rest/v1/qa_cenarios")){
   if(method==="GET")return send(canSee(user.id)?
    (url.searchParams.get("select")==="tarefa_id,status"?
     [{tarefa_id:TASK,status:scenario.status}]:[scenario]):[]);
   if(method==="PATCH"){
    assert.equal(user.id,TESTER);
    assert.equal(memberOf(user.id)?.papel,"qa");
    assert.equal(assigned?.responsavel_id,user.id);
    assert.deepEqual(Object.keys(payload).sort(),["obtido","status","updated_at"]);
    scenario.status=payload.status;
    scenario.obtido=payload.obtido;
    writes.push({type:"execution",status:scenario.status});
    return send({id:SCENARIO});
   }
  }
  if(path.endsWith("/rest/v1/qa_equipes")){
   if(method==="GET")return send(team&&(user.id===OWNER||memberOf(user.id))?[team]:[]);
   if(method==="POST"){
    assert.equal(user.id,OWNER);
    assert.equal(payload.owner_id,OWNER);
    team={id:TEAM,...payload,created_at:"2026-11-08T12:10:00Z"};
    members.push({equipe_id:TEAM,usuario_id:OWNER,papel:"gestor",
      aceito_em:"2026-11-08T12:10:00Z"});
    return send({id:TEAM},201);
   }
  }
  if(path.endsWith("/rest/v1/qa_equipe_membros")){
   if(method==="GET")return send(memberOf(user.id)?members:[]);
   if(method==="PATCH"){
    assert.equal(user.id,OWNER);
    const id=url.searchParams.get("usuario_id")?.replace("eq.","");
    const member=memberOf(id);
    assert.ok(member);
    member.papel=payload.papel;
    if(payload.papel==="leitor" && assigned?.responsavel_id===id) assigned=null;
    return send({usuario_id:id});
   }
   if(method==="DELETE"){
    assert.equal(user.id,OWNER);
    const id=url.searchParams.get("usuario_id")?.replace("eq.","");
    const index=members.findIndex(item=>item.usuario_id===id);
    assert.ok(index>=0);members.splice(index,1);
    return send({usuario_id:id});
   }
  }
  if(path.endsWith("/rest/v1/qa_equipe_convites")){
   if(method==="GET")return send(invite&&
    (user.id===OWNER||invite.email===user.email)?[invite]:[]);
   if(method==="POST"){
    assert.equal(user.id,OWNER);
    assert.equal(payload.papel,"qa");
    invite={...payload,id:INVITE,created_at:"2026-11-08T12:20:00Z"};
    return send(null,201);
   }
   if(method==="PATCH"){
    assert.equal(user.id,TESTER);
    assert.equal(payload.estado,"aceito");
    invite.estado="aceito";
    members.push({equipe_id:TEAM,usuario_id:TESTER,papel:"qa",
      aceito_em:"2026-11-08T13:00:00Z"});
    return send({id:INVITE});
   }
   if(method==="DELETE"){
    assert.equal(user.id,OWNER);
    assert.equal(url.searchParams.get("id"),"eq."+INVITE);
    invite=null;
    return send({id:INVITE});
   }
  }
  if(path.endsWith("/rest/v1/qa_tarefa_equipes")){
   if(method==="GET")return send(linked&&canSee(user.id)?linked:null);
   if(method==="POST"){
    assert.equal(user.id,OWNER);
    assert.equal(payload.equipe_id,TEAM);
    linked={tarefa_id:TASK,equipe_id:TEAM};
    writes.push({type:"share"});
    return send({tarefa_id:TASK},201);
   }
  }
  if(path.endsWith("/rest/v1/qa_tarefa_responsaveis")){
   if(method==="GET")return send(assigned&&canSee(user.id)?assigned:null);
   if(method==="POST"){
    assert.equal(user.id,OWNER);
    assert.equal(payload.responsavel_id,TESTER);
    assigned={tarefa_id:TASK,responsavel_id:TESTER};
    writes.push({type:"assign"});
    return send({tarefa_id:TASK},201);
   }
  }
  if(path.endsWith("/rest/v1/qa_tarefa_github_issues")){
   if(method==="GET")return send(canSee(user.id)?githubLinks:[]);
   if(method==="POST"){
    assert.equal(user.id,OWNER);
    assert.equal(payload.repositorio,"acme/financeiro");
    assert.equal(payload.numero,123);
    const row={id:"88888888-8888-4888-8888-888888888888",
     ...payload,created_at:"2026-11-08T14:15:00Z"};
    githubLinks.push(row);writes.push({type:"github-link"});return send({id:row.id},201);
   }
   if(method==="DELETE"){
    assert.equal(user.id,OWNER);
    const id=url.searchParams.get("id")?.replace("eq.","");
    const index=githubLinks.findIndex(item=>item.id===id);
    if(index<0)return send({message:"Not found"},404);
    const [removed]=githubLinks.splice(index,1);
    return send({id:removed.id});
   }
  }
  if(path.endsWith("/rest/v1/qa_tarefa_comentarios")){
   if(method==="GET")return send(canSee(user.id)?comments:[]);
   if(method==="POST"){
    assert.equal(user.id,TESTER);
    assert.equal(memberOf(user.id)?.papel,"qa");
    const created={id:COMMENT,tarefa_id:TASK,user_id:TESTER,
      texto:payload.texto,created_at:"2026-11-08T14:00:00Z"};
    comments.push(created);writes.push({type:"comment"});
    return send({id:COMMENT},201);
   }
  }
  if(path.endsWith("/rest/v1/qa_diagramas")||path.endsWith("/rest/v1/qa_documentos"))return send([]);
  errors.push(user.id+" "+method+" "+path);
  return send({message:"Unexpected F5 fixture endpoint"},500);
 };
}
async function login(browser,user,width=390){
 const context=await browser.newContext({viewport:{width,height:844}});
 const page=await context.newPage();
 page.on("pageerror",error=>errors.push(user.email+" PAGE "+error.message));
 await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mockFor(user));
 await page.goto(ROOT);
 await page.getByRole("textbox",{name:"Email"}).fill(user.email);
 await page.getByLabel("Senha").fill("fixture-password");
 await page.getByRole("button",{name:"Entrar",exact:true}).click();
 await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
 return {context,page};
}
async function checkResponsive(page,prefix,modal=false){
 await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
 for(const width of [320,390,768,1366]){
  await page.setViewportSize({width,height:844});
  const widths=await page.evaluate(()=>{
   const dlg=document.querySelector('[role="dialog"][aria-modal="true"]');
   return {document:document.documentElement.scrollWidth-innerWidth,
    modal:dlg?dlg.scrollWidth-dlg.clientWidth:0};
  });
  assert.ok(widths.document<=1&&widths.modal<=1,
   prefix+" overflow "+width+": "+JSON.stringify(widths));
  const audit=await page.evaluate(async()=>window.axe.run(document,{
   runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
   rules:{region:{enabled:false}}
  }));
  assert.deepEqual(audit.violations.map(v=>({
   id:v.id,nodes:v.nodes.slice(0,3).map(n=>n.target.join(" "))
  })),[],prefix+" WCAG "+width);
  await page.screenshot({path:"artifacts/f5-collaboration/"+prefix+"-"+width+".png"});
 }
 await page.setViewportSize({width:390,height:844});
}
mkdirSync("artifacts/f5-collaboration",{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const owner=await login(browser,users[0]);
 const ownerPage=owner.page;
 await ownerPage.goto(ROOT+"#/perfil");
 await ownerPage.getByRole("heading",{name:"Perfil e configurações"}).waitFor();
 await ownerPage.getByRole("button",{name:"Gerenciar equipes"}).click();
 await ownerPage.getByRole("textbox",{name:"Nome da equipe"}).fill("Equipe Vendas");
 await ownerPage.getByRole("button",{name:"Criar equipe"}).click();
 await ownerPage.getByText("Equipe criada.").waitFor();
 await ownerPage.getByRole("textbox",{name:"E-mail cadastrado"}).fill(users[1].email);
 await ownerPage.getByRole("button",{name:"Convidar",exact:true}).click();
 await ownerPage.getByText(/Convite registrado/).waitFor();
 assert.ok(invite?.estado==="pendente");
 await checkResponsive(ownerPage,"owner-teams");

 await ownerPage.goto(ROOT+"#/tarefa/"+TASK);
 await ownerPage.getByRole("heading",{name:task.titulo}).waitFor();
 await ownerPage.getByRole("tab",{name:"Arquivos e requisitos"}).click();
 await ownerPage.getByRole("tab",{name:"Equipe",exact:true}).click();
 const ownerListing=ownerPage.getByRole("tabpanel",{name:"Equipe",exact:true});
 await ownerListing.waitFor();
 assert.equal(await ownerListing.getByRole("combobox",{name:"Escolher sua equipe"}).count(),0,
  "Team view must contain only saved records");
 await ownerPage.getByRole("button",{name:"Gerenciar equipe",exact:true}).click();
 const ownerModal=ownerPage.getByRole("dialog",{name:"Gerenciar equipe"});
 await ownerModal.waitFor();
 await ownerModal.getByRole("combobox",{name:"Escolher sua equipe"}).selectOption(TEAM);
 await ownerModal.getByRole("button",{name:"Compartilhar com equipe"}).click();
 await ownerPage.getByText(/TF compartilhada somente/).waitFor();
 assert.equal(writes.filter(v=>v.type==="share").length,1);
 await ownerModal.getByRole("button",{name:"Fechar Gerenciar equipe"}).click();

 const tester=await login(browser,users[1]);
 const testerPage=tester.page;
 await testerPage.goto(ROOT+"#/perfil");
 await testerPage.getByRole("button",{name:"Gerenciar equipes"}).click();
 await testerPage.getByText("Convites para você").waitFor();
 await testerPage.getByRole("button",{name:"Aceitar"}).click();
 await testerPage.getByText("Convite aceito.").waitFor();
 assert.equal(memberOf(TESTER)?.papel,"qa");

 // A signed-in collaborator can read the shared task after accepting.
 await testerPage.goto(ROOT+"#/tarefa/"+TASK);
 await testerPage.getByRole("heading",{name:task.titulo}).waitFor();
 await testerPage.getByRole("tab",{name:"Cenários"}).click();
 await testerPage.getByRole("button",{name:"Funcionou"}).first().waitFor();
 assert.equal(await testerPage.getByRole("button",{name:"Funcionou"}).first().isDisabled(),true,
  "An unassigned QA must not execute the scenario");
 await testerPage.getByRole("tab",{name:"Arquivos e requisitos"}).click();
 await testerPage.getByRole("tab",{name:"Equipe",exact:true}).click();
 const testerListing=testerPage.getByRole("tabpanel",{name:"Equipe",exact:true});
 await testerListing.waitFor();
 assert.equal(await testerListing.getByRole("textbox",{name:"Novo comentário"}).count(),0);
 await testerPage.getByRole("button",{name:"Gerenciar equipe",exact:true}).click();
 const testerModal=testerPage.getByRole("dialog",{name:"Gerenciar equipe"});
 await testerModal.waitFor();
 await testerModal.getByRole("button",{name:"Conversa"}).click();
 await testerModal.getByRole("textbox",{name:"Novo comentário"}).fill("Revisar o rateio de desconto.");
 await testerModal.getByRole("button",{name:"Publicar comentário"}).click();
 await testerPage.getByText("Comentário registrado.").waitFor();
 assert.equal(comments[0].user_id,TESTER);
 await testerModal.getByRole("button",{name:"Fechar Gerenciar equipe"}).click();

 // Owner sees new member after refresh and can explicitly assign them.
 await ownerPage.reload();
 await ownerPage.getByRole("heading",{name:task.titulo}).waitFor();
 await ownerPage.getByRole("tab",{name:"Arquivos e requisitos"}).click();
 await ownerPage.getByRole("tab",{name:"Equipe",exact:true}).click();
 await ownerPage.getByRole("button",{name:"Gerenciar equipe",exact:true}).click();
 const reopened=ownerPage.getByRole("dialog",{name:"Gerenciar equipe"});
 await reopened.getByRole("combobox",{name:"Designar QA"}).selectOption(TESTER);
 await reopened.getByRole("button",{name:"Atribuir"}).click();
 await ownerPage.getByText("Responsável atualizado.").waitFor();
 assert.equal(assigned.responsavel_id,TESTER);
 await reopened.getByRole("button",{name:"Fechar Gerenciar equipe"}).click();
 await ownerPage.reload();
 await ownerPage.getByRole("heading",{name:task.titulo}).waitFor();
 await ownerPage.getByRole("tab",{name:"Arquivos e requisitos"}).click();
 await ownerPage.getByRole("tab",{name:"Equipe",exact:true}).click();
 await ownerPage.getByRole("tabpanel",{name:"Equipe",exact:true})
  .getByRole("button",{name:"Conversa"}).click();
 await ownerPage.getByText("Revisar o rateio de desconto.").waitFor();
 await ownerPage.getByRole("button",{name:"Gerenciar equipe",exact:true}).click();
 const ownerIntegration=ownerPage.getByRole("dialog",{name:"Gerenciar equipe"});
 await ownerIntegration.getByRole("button",{name:"Integrações",exact:true}).click();
 await ownerIntegration.getByRole("textbox",{name:"Repositório",exact:true})
  .fill("acme/financeiro");
 await ownerIntegration.getByRole("textbox",{name:"Número da issue"}).fill("123");
 await ownerIntegration.getByRole("button",{name:"Vincular issue"}).click();
 await ownerPage.getByText("Issue vinculada à TF.").waitFor();
 assert.equal(githubLinks.length,1);
 assert.equal(githubLinks[0].user_id,OWNER);
 await ownerIntegration.getByRole("button",{name:"Fechar Gerenciar equipe"}).click();

 await testerPage.reload();
 await testerPage.getByRole("heading",{name:task.titulo}).waitFor();
 await testerPage.getByRole("tab",{name:"Cenários"}).click();
 await testerPage.getByRole("button",{name:"Funcionou"}).first().waitFor();
 await testerPage.waitForFunction(()=>{
  const button=[...document.querySelectorAll("button")]
   .find(b=>b.textContent?.trim()==="Funcionou");
  return button&&!button.disabled;
 });
 await testerPage.getByRole("tab",{name:"Arquivos e requisitos"}).click();
 await testerPage.getByRole("tab",{name:"Equipe",exact:true}).click();
 await testerPage.getByRole("button",{name:"Gerenciar equipe",exact:true}).click();
 const integrated=testerPage.getByRole("dialog",{name:"Gerenciar equipe"});
 await integrated.getByRole("button",{name:"Integrações",exact:true}).click();
 const linkedIssue=integrated.getByRole("link",{name:"Abrir no GitHub"});
 await linkedIssue.waitFor();
 assert.equal(await linkedIssue.getAttribute("href"),
   "https://github.com/acme/financeiro/issues/123");
 assert.equal(await integrated.getByRole("button",{name:"Vincular issue"}).count(),0,
   "Only the owner can link issues");
 await testerPage.route("https://api.github.com/repos/acme/financeiro/issues/123",
   route=>route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify({title:"Corrigir descontos",state:"open",
     html_url:"https://github.com/acme/financeiro/issues/123"})}));
 await integrated.getByRole("button",{name:"Consultar estado"}).click();
 await integrated.getByText("Aberta").waitFor();
 await integrated.getByText("Corrigir descontos").waitFor();
 await integrated.getByRole("textbox",{name:"Repositório GitHub"})
  .fill("acme/financeiro");
 const github=integrated.getByRole("link",{name:"Revisar issue no GitHub"});
 assert.match(await github.getAttribute("href"),
  /^https:\/\/github\.com\/acme\/financeiro\/issues\/new\?/);
 assert.match(await github.getAttribute("href"),/title=/);
 // An external issue draft may contain private TF information: explicitly
 // decline the consent dialog to guarantee no automatic navigation occurs.
 const beforeUrl=testerPage.url();
 testerPage.once("dialog",dialog=>{
  assert.match(dialog.message(),/enviará o título e a descrição/);
  void dialog.dismiss();
 });
 await github.click();
 assert.equal(testerPage.url(),beforeUrl);

 const junit='<testsuites><testsuite name="Vendas"><testcase classname="Pedido" name="Remover desconto">'+
  '<failure message="Total não recalculado">Esperado 50, obtido 51</failure></testcase></testsuite></testsuites>';
 await integrated.getByLabel("Selecionar relatório (até 2 MB)").setInputFiles({
  name:"resultados.xml",mimeType:"application/xml",buffer:Buffer.from(junit)
 });
 await integrated.getByText("1 resultado(s) para revisão").waitFor();
 assert.equal(writes.filter(v=>v.type==="execution").length,0,
  "Parsing an automated report must not mutate scenario results");
 await integrated.getByRole("combobox",{name:"Vincular a cenário"}).selectOption(SCENARIO);
 testerPage.once("dialog",dialog=>void dialog.accept());
 await integrated.getByRole("button",{name:"Registrar neste cenário"}).click();
 await testerPage.getByText("Resultado registrado. A TF não foi aprovada automaticamente.").waitFor();
 assert.equal(scenario.status,"reprovado");
 assert.equal(task.status,"em_teste");
 assert.equal(writes.filter(v=>v.type==="execution").length,1);
 await checkResponsive(testerPage,"collaboration-modal");
 await integrated.getByRole("button",{name:"Fechar Gerenciar equipe"}).click();

 // Demoting a tester removes execution capability (role from DB, not UI metadata).
 await ownerPage.goto(ROOT+"#/perfil");
 await ownerPage.getByRole("button",{name:"Gerenciar equipes"}).click();
 await ownerPage.getByRole("combobox",{name:"Selecionar equipe"}).selectOption(TEAM);
 const roleSelect=ownerPage.locator("#member-role-"+TESTER);
 await roleSelect.selectOption("leitor");
 await ownerPage.getByText("Permissão atualizada.").waitFor();
 assert.equal(memberOf(TESTER).papel,"leitor");
 assert.equal(assigned,null,"Downgrading a member must remove their previous assignment.");

 await testerPage.reload();
 await testerPage.getByRole("heading",{name:task.titulo}).waitFor();
 await testerPage.getByRole("tab",{name:"Arquivos e requisitos"}).click();
 await testerPage.getByRole("tab",{name:"Equipe",exact:true}).click();
 const readerModal=testerPage.getByRole("tabpanel",{name:"Equipe",exact:true});
 await readerModal.getByRole("button",{name:"Conversa"}).click();
 await readerModal.getByText("Conversa da TF").waitFor();
 assert.equal(await readerModal.getByRole("button",{name:"Publicar comentário"}).count(),0);
 assert.equal(await testerPage.getByRole("button",{name:"Gerenciar equipe",exact:true}).count(),0,
   "Read-only collaborator must not have access to the management modal");

 await testerPage.getByRole("tab",{name:"Cenários"}).click();
 await testerPage.getByRole("button",{name:"Funcionou"}).first().waitFor();
 assert.equal(await testerPage.getByRole("button",{name:"Funcionou"}).first().isDisabled(),true);
 await checkResponsive(ownerPage,"owner-team-role");
 // Revocation must remove the TF from a collaborator's RLS-visible task list.
 ownerPage.once("dialog",dialog=>void dialog.accept());
 await ownerPage.getByRole("button",{name:"Remover",exact:true}).click();
 await ownerPage.getByText("Acesso revogado.").waitFor();
 assert.equal(memberOf(TESTER),undefined);
 await testerPage.reload();
 await testerPage.getByRole("heading",{name:"TF não encontrada ou sem acesso"}).waitFor();

 // Old accepted invitation can be explicitly cleared to allow inviting again.
 await ownerPage.getByText("Convites anteriores").click();
 ownerPage.once("dialog",dialog=>void dialog.accept());
 await ownerPage.getByRole("button",{name:"Liberar novo convite"}).click();
 await ownerPage.getByText(/Registro removido/).waitFor();
 await ownerPage.getByRole("textbox",{name:"E-mail cadastrado"}).fill(users[1].email);
 await ownerPage.getByRole("button",{name:"Convidar",exact:true}).click();
 await ownerPage.getByText(/Convite registrado/).waitFor();
 assert.equal(invite?.estado,"pendente");
 assert.deepEqual(errors,[]);
 console.log("F5: team, invite, accept, share, QA assignment, comments, persisted GitHub issue link/status, GitHub draft, JUnit preview, explicit import, viewer downgrade and responsive WCAG.");
 await tester.context.close();await owner.context.close();
}finally{await browser.close();}
