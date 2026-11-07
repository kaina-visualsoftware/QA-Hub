import assert from "node:assert/strict";
import { chromium } from "playwright";

// This test never contacts the real database. It checks the ACTUAL compiled
// publish/unpublish behavior under both build-time flag states.
const origin = "http://127.0.0.1:4173/QA-Hub/";
const enabled = process.env.QA_TEST_PUBLICATION_ENABLED;
if (enabled !== "true" && enabled !== "false") {
  throw Error("Set QA_TEST_PUBLICATION_ENABLED to true or false for this synthetic test.");
}
const id = "11111111-1111-4111-8111-111111111111";
const privateId = "22222222-2222-4222-8222-222222222222";
const publishedId = "33333333-3333-4333-8333-333333333333";
const user = {
  id, email:"publication-test@fixture.invalid", aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-07T08:00:00Z"
};
const tasks = [
  {id:privateId,user_id:id,titulo:"TF inicialmente privada",codigo:"11111",tipo_teste:"BUILD",
    status:"rascunho",sistema:"QA",versao:"1.0",descricao:"Sem informações reais",
    publica:false,executado_em:"2026-11-07",updated_at:"2026-11-07T08:00:00Z"},
  {id:publishedId,user_id:id,titulo:"TF publicada anteriormente",codigo:"22222",tipo_teste:"BUILD",
    status:"rascunho",sistema:"QA",versao:"1.0",descricao:"Somente fixture",
    publica:true,executado_em:"2026-11-07",updated_at:"2026-11-07T08:00:00Z"}
];
const changes = [],errors=[];
const browser = await chromium.launch({headless:true});

async function mockApi(route) {
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const headers = {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
    "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
  };
  const send=(data,status=200)=>route.fulfill({
    status,headers,contentType:"application/json",body:JSON.stringify(data)
  });
  if(method==="OPTIONS") return route.fulfill({status:204,headers});
  if(path.endsWith("/auth/v1/token")) return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"synthetic-refresh",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user")) return send(user);
  if(path.endsWith("/rest/v1/qa_admins")) return send(null);
  if(path.endsWith("/rest/v1/qa_tarefas")) {
    if(method==="PATCH") {
      const taskId=url.searchParams.get("id")?.replace("eq.","");
      assert.equal(url.searchParams.get("user_id"),"eq."+id,"Owner filter is mandatory");
      const change=req.postDataJSON();
      assert.deepEqual(Object.keys(change).sort(),["publica","updated_at"],
        "Publishing may not modify arbitrary task fields");
      const task=tasks.find(item=>item.id===taskId);
      assert.ok(task,"Only a fixture-owned task may be changed");
      task.publica=change.publica;
      changes.push({id:taskId,publica:task.publica});
      return send({id:taskId,publica:task.publica});
    }
    assert.equal(url.searchParams.get("user_id"),"eq."+id);
    return send(tasks);
  }
  if(path.endsWith("/rest/v1/qa_cenarios") || path.endsWith("/rest/v1/qa_diagramas")) return send([]);
  if(path.endsWith("/rest/v1/rpc/qa_public_tasks_v1")) return send(tasks.filter(t=>t.publica).map(t=>({
    id:t.id,titulo:t.titulo,codigo:t.codigo,tipo_teste:t.tipo_teste,
    sistema:t.sistema,versao:t.versao,executado_em:t.executado_em
  })));
  if(path.endsWith("/rest/v1/rpc/qa_public_task_v1")) return send(null);
  errors.push("Unexpected fixture API: "+method+" "+path);
  return send({message:"Unknown synthetic API call"},500);
}

try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mockApi);
  await page.goto(origin);
  await page.getByRole("textbox",{name:"Email"}).fill("publication-test@fixture.invalid");
  await page.getByLabel("Senha").fill("synthetic-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});

  await page.goto(origin+"#/tarefa/"+privateId);
  await page.getByRole("heading",{name:"TF inicialmente privada"}).waitFor();
  const publish=page.getByRole("button",{name:"Publicar TF"});
  assert.equal(await publish.isDisabled(),enabled==="false",
    "Publishing must match the explicit build flag");
  if(enabled==="false") {
    await page.getByText("Novas publicações desativadas até a homologação").waitFor();
    assert.deepEqual(changes,[],"Disabled build must not make publish requests");
  } else {
    page.once("dialog",dialog=>void dialog.accept());
    await publish.click();
    await page.getByText("TF publicada por sua confirmação.").waitFor();
    assert.deepEqual(changes,[{id:privateId,publica:true}]);
    page.once("dialog",dialog=>void dialog.accept());
    await page.getByRole("button",{name:"Retirar publicação"}).click();
    await page.getByText("Publicação desativada.").waitFor();
    assert.deepEqual(changes,[{id:privateId,publica:true},{id:privateId,publica:false}]);
  }

  // Even with new publications blocked, an existing public task must
  // remain reversible by its owner (never hide the unpublish control).
  await page.goto(origin+"#/tarefa/"+publishedId);
  await page.getByRole("heading",{name:"TF publicada anteriormente"}).waitFor();
  const unpublish=page.getByRole("button",{name:"Retirar publicação"});
  assert.equal(await unpublish.isDisabled(),false);
  page.once("dialog",dialog=>void dialog.accept());
  await unpublish.click();
  await page.getByText("Publicação desativada.").waitFor();
  assert.deepEqual(changes.at(-1),{id:publishedId,publica:false});
  assert.deepEqual(errors,[]);
  console.log("Publication build gate "+enabled+": owner-scoped requests, disabled publish and preserved unpublish verified.");
} finally {
  await browser.close();
}
