import assert from "node:assert/strict";
import { chromium } from "playwright";

// All network requests go to an in-memory synthetic backend. It contains
// no real users, task bodies or credentials and cannot reach production data.
const root = "http://127.0.0.1:4173/QA-Hub/";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const tasks = Array.from({length:33}, (_, i) => ({
  id:`33333333-3333-4333-8333-${String(i+1).padStart(12,"0")}`,
  user_id:i<=1?owner:other,
  titulo:["Validar desconto","TF sem casos","TF de outro QA","TF com muitos cenários"][i] ||
    `TF auxiliar ${i+1}`,
  codigo:`QA-${i+1}`,descricao:"Fixture QA",tipo_teste:"BUILD",
  status:i===0?"rascunho":"em_teste",sistema:"Financeiro",
  versao:"1.0",publica:false,executado_em:"2026-11-07"
}));
const scenarios = [
  {tarefa_id:tasks[0].id,status:"aprovado",titulo:"Caso executado"},
  {tarefa_id:tasks[0].id,status:"nao_executado",titulo:"Caso pendente"},
  {tarefa_id:tasks[2].id,status:"nao_executado",titulo:"Caso de outro QA"},
  ...Array.from({length:501},(_,i)=>({
    tarefa_id:tasks[3].id,status:i===500?"nao_executado":"aprovado",
    titulo:`Grande cenário ${i+1}`
  }))
].map((item,i)=>({
  ...item,id:`44444444-4444-4444-8444-${String(i+1).padStart(12,"0")}`,
  user_id:tasks.find(t=>t.id===item.tarefa_id)?.user_id,
  passos:"Abrir pedido",esperado:"Valor correto",
  obtido:"",observacoes:"",ordem:i+1
}));
const user={
  id:owner,email:"progress@fixture.invalid",aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-07T12:00:00Z"
};
const browser=await chromium.launch({headless:true});
const unexpected=[],writes=[],progressRequests=[];
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
};
async function fakeBackend(route){
  const request=route.request(),url=new URL(request.url());
  const path=url.pathname,method=request.method();
  const send=(payload,status=200)=>route.fulfill({
    status,contentType:"application/json",headers:cors,body:JSON.stringify(payload)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"fixture-refresh",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(path.endsWith("/rest/v1/qa_admins"))return send({user_id:owner});
  if(path.endsWith("/rest/v1/qa_tarefas")&&method==="GET"){
    assert.equal(url.searchParams.has("user_id"),false,
      "Admin should be allowed to list tasks but not edit other users' cases");
    return send(tasks);
  }
  if(path.endsWith("/rest/v1/qa_cenarios")&&method==="GET"){
    const filter=url.searchParams.get("tarefa_id");
    const select=url.searchParams.get("select");
    if(select==="tarefa_id,status"){
      assert.match(filter||"",/^in\.\(/,"Progress lookup must be restricted to listed task IDs");
      const ids=(filter||"").slice(4,-1).split(",");
      assert.ok(ids.length<=20,"Requests must be batched to avoid long URLs");
      assert.ok(ids.every(id=>tasks.some(t=>t.id===id)),
        "Progress cannot enumerate unlisted task IDs");
      const rows=scenarios.filter(item=>ids.includes(item.tarefa_id))
        .sort((a,b)=>a.id.localeCompare(b.id));
      const offset=Number(url.searchParams.get("offset")||"0");
      const limit=Number(url.searchParams.get("limit")||"500");
      progressRequests.push({ids,offset,limit});
      assert.ok(limit<=500,"Paging must prevent truncated execution totals");
      return send(rows.slice(offset,offset+limit).map(item=>({
        tarefa_id:item.tarefa_id,status:item.status
      })));
    }
    const id=filter?.replace("eq.","");
    assert.ok(tasks.some(t=>t.id===id),"Task detail must constrain scenario list");
    return send(scenarios.filter(item=>item.tarefa_id===id));
  }
  if(method!=="GET") writes.push(method+" "+path);
  unexpected.push(method+" "+path);
  return send({message:"Unsupported synthetic endpoint"},500);
}
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",e=>unexpected.push("PAGE "+e.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",fakeBackend);
  await page.goto(root);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("fixture-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});

  const ownerRow=page.locator(".task-list-entry").filter({hasText:"Validar desconto"});
  await ownerRow.getByText("1/2 executados · 1 pendente(s)").waitFor({timeout:25000});
  assert.equal(await ownerRow.getByRole("link",{name:"Continuar testes"}).count(),1);

  const zeroRow=page.locator(".task-list-entry").filter({hasText:"TF sem casos"});
  await zeroRow.getByText("0/0 executados · 0 pendente(s)").waitFor();
  assert.equal(await zeroRow.getByRole("link",{name:"Adicionar primeiro caso"}).count(),1);

  const anotherRow=page.locator(".task-list-entry").filter({hasText:"TF de outro QA"});
  await anotherRow.getByText("0/1 executados · 1 pendente(s)").waitFor();
  assert.equal(await anotherRow.getByRole("link",{name:"Continuar testes"}).count(),0,
    "Admin can inspect but must not be given a quick execution link to someone else's TF");

  const largeRow=page.locator(".task-list-entry").filter({hasText:"TF com muitos cenários"});
  await largeRow.getByText("500/501 executados · 1 pendente(s)").waitFor();
  assert.ok(progressRequests.some(request=>request.offset===500),
    "Progress must paginate past the first 500 scenarios");
  assert.equal(await page.locator(".task-list-entry").count(),30);
  const more=page.getByRole("button",{name:/Mostrar mais TFs/});
  await more.click();
  await page.getByText("TF auxiliar 33",{exact:true}).waitFor();
  assert.equal(await page.locator(".task-list-entry").count(),33);

  await ownerRow.getByRole("link",{name:"Continuar testes"}).click();
  await page.getByRole("heading",{name:"Validar desconto"}).waitFor();
  await page.getByRole("button",{name:"Pendentes",exact:true})
    .waitFor({timeout:20000});
  await page.waitForFunction(()=>
    document.activeElement?.getAttribute("data-qa-next-pending")==="true");
  assert.equal(await page.getByRole("button",{name:"Pendentes",exact:true})
    .getAttribute("aria-pressed"),"true");
  assert.equal(await page.getByRole("group",{name:"Resultado de Caso executado"}).count(),0);
  assert.equal(await page.getByRole("group",{name:"Resultado de Caso pendente"}).count(),1);
  await page.waitForFunction(()=>!location.hash.includes("resume"));
  assert.equal(writes.length,0,"Opening pending cases must never save or execute a case");

  await page.reload();
  await page.getByRole("heading",{name:"Validar desconto"}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Todos",exact:true})
    .getAttribute("aria-pressed"),"true",
    "The one-shot resume intent must not auto-run again on refresh");

  await page.getByRole("link",{name:"Todas as TFs"}).click();
  const newZero=page.locator(".task-list-entry").filter({hasText:"TF sem casos"});
  await newZero.getByRole("link",{name:"Adicionar primeiro caso"}).click();
  await page.getByRole("dialog",{name:"Cadastrar cenário"}).waitFor();
  assert.equal(writes.length,0);
  await page.waitForFunction(()=>!location.hash.includes("newScenario"));

  const overflow=await page.evaluate(()=>
    document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,"Home and quick actions must remain mobile responsive");
  assert.deepEqual(unexpected,[]);
  console.log("TF home: accurate batched/paged progress, owner-only actions, direct resume, empty-case creation and no writes.");
}finally{await browser.close();}
