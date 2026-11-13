import assert from "node:assert/strict";
import {chromium} from "playwright";

const BASE="http://127.0.0.1:4173/QA-Hub/";
const uid="11111111-1111-4111-8111-111111111111";
const listId="66666666-6666-4666-8666-666666666666";
const itemId="77777777-7777-4777-8777-777777777777";
const user={id:uid,email:"qa-release@example.invalid",aud:"authenticated",
  role:"authenticated",app_metadata:{provider:"email",providers:["email"]},
  user_metadata:{},created_at:"2026-11-12T10:00:00Z"};
const lists=[],items=[],requests=[],errors=[];
const cors={"Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type,prefer,accept",
 "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"};

async function mock(route){
 const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
 const send=(data,status=200)=>route.fulfill({
  status,headers:cors,contentType:"application/json",body:JSON.stringify(data)
 });
 if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
 if(path.endsWith("/auth/v1/token"))return send({
  access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
  refresh_token:"refresh",token_type:"bearer",expires_in:3600,
  expires_at:Math.floor(Date.now()/1000)+3600,user
 });
 if(path.endsWith("/auth/v1/user"))return send(user);
 if(path.endsWith("/rest/v1/qa_admins"))return send(null);
 if(path.endsWith("/rest/v1/qa_filtros_salvos"))return send([]);
 if(path.endsWith("/rest/v1/qa_equipes"))return send([]);
 if(path.endsWith("/rest/v1/qa_tarefas"))return send([]);
 if(path.endsWith("/rest/v1/qa_cenarios"))return send([]);
 if(path.endsWith("/rest/v1/qa_release_listas")){
  requests.push(method+" "+path);
  if(method==="GET")return send(lists);
  if(method==="POST"){
   const data=req.postDataJSON();
   assert.equal(data.escopo,"pessoal");
   assert.equal(data.owner_id,uid);
   const created={...data,id:listId,created_at:"2026-11-13T10:00:00Z",
    updated_at:"2026-11-13T10:00:00Z"};
   lists.push(created);
   return send({id:listId},201);
  }
  if(method==="PATCH"){
   const data=req.postDataJSON();
   assert.equal(url.searchParams.get("id"),"eq."+listId);
   lists[0].nome=data.nome;
   return send({id:listId});
  }
  if(method==="DELETE"){lists.length=0;return send({id:listId});}
 }
 if(path.endsWith("/rest/v1/qa_release_lista_itens")){
  requests.push(method+" "+path);
  if(method==="GET")return send(items);
  if(method==="POST"){
   const data=req.postDataJSON();
   assert.equal(data.lista_id,listId);
   items.push({...data,id:itemId,ativo:true,created_at:"2026-11-13T10:00:00Z"});
   return send({id:itemId},201);
  }
  if(method==="PATCH"){
   assert.equal(url.searchParams.get("id"),"eq."+itemId);
   Object.assign(items[0],req.postDataJSON());
   return send({id:itemId});
  }
  if(method==="DELETE"){items.length=0;return send({id:itemId});}
 }
 errors.push(method+" "+path);
 return send({message:"Unexpected fixture request "+path},500);
}

const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
 await page.goto(BASE);
 await page.getByRole("textbox",{name:"Email"}).fill(user.email);
 await page.getByLabel("Senha").fill("synthetic-password");
 await page.getByRole("button",{name:"Entrar",exact:true}).click();
 await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
 await page.goto(BASE+"#/ferramentas");
 await page.getByRole("heading",{name:"Organizar uma release"}).waitFor();
 const select=page.getByRole("combobox",{name:"Equipe / sprints"});
 await select.waitFor();
 assert.equal(await select.locator("option").count(),1);
 await page.getByRole("button",{name:"Gerenciar listas"}).click();
 const modal=page.getByRole("dialog",{name:"Gerenciar listas de equipe e sprints"});
 await modal.waitFor();
 assert.equal(await modal.getByRole("option",{name:"Todos os usuários"}).count(),0,
  "A conta comum não pode oferecer listas globais");
 await modal.getByRole("textbox",{name:"Nome da lista"}).fill("Releases Financeiro");
 await modal.getByRole("button",{name:"Criar lista"}).click();
 await page.getByText("Lista criada.").waitFor();
 assert.equal(lists[0].owner_id,uid);
 await modal.getByRole("textbox",{name:"Adicionar um nome"}).fill("Sprint Fiscal");
 await modal.getByRole("button",{name:"Adicionar",exact:true}).click();
 await page.getByText("Nome adicionado.").waitFor();
 assert.equal(items.length,1);
 await modal.getByRole("button",{name:"Arquivar Sprint Fiscal"}).click();
 await page.getByText("Nome arquivado.").waitFor();
 assert.equal(items[0].ativo,false);
 await modal.getByRole("button",{name:"Reativar Sprint Fiscal"}).click();
 await page.getByText("Nome reativado.").waitFor();
 assert.equal(items[0].ativo,true);
 await modal.getByRole("button",{name:"Fechar Gerenciar listas de equipe e sprints"}).click();
 await select.selectOption(listId);
 await page.locator("#release-free-names").waitFor({state:"attached"});
 await page.waitForFunction(()=>document.querySelector("#release-free-names")?.value==="Sprint Fiscal");
 assert.equal(await page.locator("#release-free-names").inputValue(),"Sprint Fiscal");
 await page.getByRole("checkbox",{name:"Sprint Fiscal"}).uncheck();
 await page.waitForFunction(()=>document.querySelector("#release-free-names")?.value==="");
 await page.getByRole("checkbox",{name:"Sprint Fiscal"}).check();
 await page.waitForFunction(()=>document.querySelector("#release-free-names")?.value==="Sprint Fiscal");
 for(const width of [390,768,1366]){
  await page.setViewportSize({width,height:844});
  const overflow=await page.evaluate(()=>
   document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,"Release form horizontal overflow at "+width+": "+overflow);
 }
 await page.getByRole("textbox",{name:"Lista autorizada de tarefas"})
  .fill("Status 12\n#67866 — BUG — Sprint Fiscal");
 await page.getByRole("textbox",{name:"Versão da release"}).fill("12.10.06.0000");
 await page.getByRole("button",{name:"Organizar lista"}).click();
 await page.getByRole("region",{name:"Lista organizada"}).waitFor();
 assert.match(await page.getByRole("textbox",{name:"Lista organizada (somente leitura)"}).inputValue(),
  /Sprint Fiscal/);
 assert.deepEqual(errors,[],"Não houve exceções nem chamadas Supabase desconhecidas.");
 console.log("Release lists: cadastro pessoal, seleção, checkbox, extração local e layout em 390/768/1366.");
}finally{await browser.close();}
