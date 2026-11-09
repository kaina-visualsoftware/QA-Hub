import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Synthetic browser smoke only: no real QA records, account or Supabase calls.
const origin="http://127.0.0.1:4173/QA-Hub/";
const ownerId="11111111-1111-4111-8111-111111111111";
const user={
  id:ownerId,email:"draft-smoke@fixture.invalid",aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-07T12:00:00Z"
};
const errors=[],mutations=[];
const browser=await chromium.launch({headless:true});
async function respond(route){
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const headers={
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
    "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
  };
  const send=(data,status=200)=>route.fulfill({
    status,headers,contentType:"application/json",body:JSON.stringify(data)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"synthetic-refresh",token_type:"bearer",
    expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(await mockF4Rpc(route,[],[]))return;
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/qa_tarefas")&&method==="GET"){
    assert.equal(url.searchParams.get("user_id"),"eq."+ownerId);
    return send([]);
  }
  mutations.push(method+" "+path);
  return send({message:"Unexpected API in draft-only smoke"},500);
}
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",respond);
  await page.goto(origin);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("synthetic-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});

  await page.getByRole("button",{name:"Nova TF"}).click();
  await page.getByLabel("Título da tarefa").fill("Rascunho que deve sobreviver ao refresh");
  await page.getByLabel("Descrição / problema").fill("Linha 1\nLinha 2: dados de fixture");
  await page.getByText("Mais opções").click();
  const optIn=page.getByRole("checkbox",{name:/Guardar rascunho nesta aba/});
  assert.equal(await optIn.isChecked(),false,"Draft retention must be opt-in");
  const noData=await page.evaluate(()=>Object.keys(sessionStorage)
    .filter(key=>key.startsWith("qa-react-new-task-draft")));
  assert.deepEqual(noData,[],"No sensitive draft storage before consent");

  await optIn.check();
  await page.reload();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor();
  const recovery=page.getByRole("region",{name:"Rascunho recuperável nesta aba"});
  await recovery.waitFor({timeout:10000});
  assert.equal(await page.getByLabel("Título da tarefa").count(),0,
    "Saved draft must NOT silently overwrite a new form");
  await recovery.getByRole("button",{name:"Recuperar rascunho"}).click();
  assert.equal(await page.getByLabel("Título da tarefa").inputValue(),
    "Rascunho que deve sobreviver ao refresh");
  assert.equal(await page.getByLabel("Descrição / problema").inputValue(),
    "Linha 1\nLinha 2: dados de fixture");
  assert.equal(await page.getByRole("checkbox",{
    name:/Guardar rascunho nesta aba/
  }).isChecked(),true);

  await page.getByLabel("Título da tarefa").fill("Rascunho atualizado");
  await page.reload();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor();
  await recovery.waitFor({timeout:10000});
  await recovery.getByRole("button",{name:"Recuperar rascunho"}).click();
  assert.equal(await page.getByLabel("Título da tarefa").inputValue(),
    "Rascunho atualizado","Pagehide must flush pending form changes");

  // Explicit opt-out immediately removes the copy and subsequent reloads
  // must not propose or reuse the user's previous text.
  await page.getByText("Mais opções").click();
  await page.getByRole("checkbox",{name:/Guardar rascunho nesta aba/}).uncheck();
  await page.reload();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor();
  assert.equal(await recovery.count(),0,"Opt-out must remove locally stored copy");
  await page.getByRole("button",{name:"Nova TF"}).click();
  assert.equal(await page.getByLabel("Título da tarefa").inputValue(),"");
  assert.deepEqual(mutations,[],"Draft operations must never write to Supabase");
  assert.deepEqual(errors,[]);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=1,"Draft recovery should fit 390px viewport");
  console.log("Opt-in tab-scoped QA draft: consent, refresh, explicit restore, flush and discard verified.");
} finally {await browser.close();}
