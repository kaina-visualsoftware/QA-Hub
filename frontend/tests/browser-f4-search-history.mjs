import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
import {mockF4Rpc} from "./f4-mock-rpc.mjs";

const ROOT="http://127.0.0.1:4173/QA-Hub/";
const USER="11111111-1111-4111-8111-111111111111";
const taskId="33333333-3333-4333-8333-000000000001";
const scenarioId="44444444-4444-4444-8444-444444444444";
const user={
  id:USER,email:"f4@fixture.invalid",aud:"authenticated",role:"authenticated",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-08T12:00:00Z"
};
const tasks=Array.from({length:108},(_,i)=>({
  id:"33333333-3333-4333-8333-"+String(i+1).padStart(12,"0"),
  user_id:USER,titulo:i===0?"Descontos no financeiro":"Tarefa sintética "+(i+1),
  codigo:i===0?"QA-9999":"QA-"+(i+1),descricao:"Cenários de homologação",
  sistema:i===0?"Financeiro":"Vendas",
  versao:i===0?"12.08.01":"1.0",
  tipo_teste:i===0?"RELEASE":"BUILD",
  status:i===0?"reprovado":i%3===0?"aprovado":"em_teste",
  executado_em:"2026-11-08",created_at:"2026-11-08T08:00:00Z"
}));
const scenario={id:scenarioId,tarefa_id:taskId,user_id:USER,
  titulo:"Aplicar desconto",passos:"Abrir pedido",esperado:"Total correto",
  obtido:"Desconto continua antigo.",status:"reprovado",ordem:1,observacoes:""};
const events=[
  {
    id:"55555555-5555-4555-8555-000000000003",
    cenario_id:scenarioId,tarefa_id:taskId,user_id:USER,actor_id:USER,
    origem:"alteracao",status_anterior:"aprovado",status_novo:"reprovado",
    obtido_anterior:"Total atualizado.",obtido_novo:"Desconto continua antigo.",
    created_at:"2026-11-08T19:00:00Z"
  },
  {
    id:"55555555-5555-4555-8555-000000000002",
    cenario_id:scenarioId,tarefa_id:taskId,user_id:USER,actor_id:USER,
    origem:"alteracao",status_anterior:"nao_executado",status_novo:"aprovado",
    obtido_anterior:"",obtido_novo:"Total atualizado.",
    created_at:"2026-11-08T18:00:00Z"
  },
  {
    id:"55555555-5555-4555-8555-000000000001",
    cenario_id:scenarioId,tarefa_id:taskId,user_id:USER,actor_id:null,
    origem:"base",status_anterior:null,status_novo:"nao_executado",
    obtido_anterior:"",obtido_novo:"",
    created_at:"2026-11-08T17:00:00Z"
  }
];
const taskChanges=[{
  id:"66666666-6666-4666-8666-666666666666",
  tarefa_id:taskId,user_id:USER,
  anterior:{titulo:"Descontos no financeiro",versao:"12.08.00"},
  atual:{titulo:"Descontos no financeiro",versao:"12.08.01"},
  created_at:"2026-11-08T19:01:00Z"
}];
const requests=[],errors=[];
const cors={"Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"};
async function mock(route){
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const send=(value,status=200)=>route.fulfill({
    status,headers:cors,contentType:"application/json",body:JSON.stringify(value)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"synthetic-refresh",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/rpc/qa_search_tasks"))requests.push(req.postDataJSON());
  if(await mockF4Rpc(route,tasks,[scenario]))return;
  if(path.endsWith("/rest/v1/qa_tarefas")){
    const id=url.searchParams.get("id");
    assert.ok(id?.startsWith("eq."),"F4 detail must query by ID");
    assert.equal(url.searchParams.get("user_id"),"eq."+USER);
    return send(tasks.filter(t=>id==="eq."+t.id));
  }
  if(path.endsWith("/rest/v1/qa_cenarios"))return send([scenario]);
  if(path.endsWith("/rest/v1/qa_execucao_historico")){
    assert.equal(url.searchParams.get("tarefa_id"),"eq."+taskId);
    return send(events);
  }
  if(path.endsWith("/rest/v1/qa_tarefa_mudancas"))return send(taskChanges);
  if(path.endsWith("/rest/v1/qa_diagramas")||path.endsWith("/rest/v1/qa_documentos"))return send([]);
  errors.push(method+" "+path);
  return send({message:"Fixture unsupported"},500);
}
mkdirSync("artifacts/f4-search",{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",error=>errors.push("PAGE "+error.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
  await page.goto(ROOT);
  await page.getByRole("textbox",{name:"Email"}).fill(user.email);
  await page.getByLabel("Senha").fill("fixture-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  await page.locator(".task-list-entry").first().waitFor({timeout:20000});
  assert.equal(await page.locator(".task-list-entry").count(),30);
  assert.equal(requests[0].p_page_size,30);
  await page.getByRole("button",{name:/Mostrar mais TFs/}).click();
  await page.locator(".task-list-entry").nth(59).waitFor();
  assert.equal(await page.locator(".task-list-entry").count(),60);
  assert.equal(requests.at(-1).p_page,1);
  await page.getByRole("button",{name:/Mostrar mais TFs/}).click();
  await page.locator(".task-list-entry").nth(89).waitFor();
  await page.getByRole("button",{name:/Mostrar mais TFs/}).click();
  await page.locator(".task-list-entry").nth(107).waitFor();
  assert.equal(await page.locator(".task-list-entry").count(),108,
    "Pagination must support more than 80 visible TFs without progress-query failure.");
  assert.equal(requests.at(-1).p_page,3);
  const search=page.getByRole("searchbox",{name:"Pesquisar por título, código, módulo ou versão"});
  async function enterSearch(text){
    const received=page.waitForResponse(response=>
      response.url().includes("/rest/v1/rpc/qa_search_tasks")&&
      response.request().postDataJSON()?.p_search===text);
    await search.fill(text);
    await received;
  }
  await enterSearch("Financeiro");
  await page.getByText("1 resultado(s)").waitFor();
  assert.equal(await page.locator(".task-list-entry").count(),1);
  await enterSearch("12.08.01");
  await page.getByText("1 resultado(s)").waitFor();
  assert.equal(requests.at(-1).p_search,"12.08.01");
  await enterSearch("QA-9999");
  await page.getByText("1 resultado(s)").waitFor();
  assert.equal(await page.locator(".task-list-entry").count(),1);
  assert.equal(requests.at(-1).p_search,"QA-9999");

  await page.getByText("Filtros salvos",{exact:true}).click();
  await page.getByRole("textbox",{name:"Nome do filtro"}).fill("Descontos especiais");
  await page.getByRole("button",{name:"Salvar filtro atual"}).click();
  await page.getByText("Filtro salvo para esta conta.").waitFor();
  await search.fill("");
  await page.getByText("108 resultado(s)").waitFor();
  await page.getByRole("button",{name:"Descontos especiais"}).click();
  assert.equal(await search.inputValue(),"QA-9999");
  await page.getByText("1 resultado(s)").waitFor();

  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const overflow=await page.evaluate(()=>
      document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,"Search overflow "+width);
    const audit=await page.evaluate(async()=>window.axe.run(document,{
      runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},
      rules:{region:{enabled:false}}
    }));
    assert.deepEqual(audit.violations.map(v=>v.id),[],"WCAG search "+width);
    await page.screenshot({path:"artifacts/f4-search/search-"+width+".png"});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator(".task-list-entry").getByRole("link",{name:/Descontos no financeiro/}).click();
  await page.getByRole("heading",{name:"Descontos no financeiro"}).waitFor();
  await page.getByRole("tab",{name:"Relatórios e posts"}).click();
  await page.getByRole("button",{name:"Histórico de execuções"}).click();
  const dialog=page.getByRole("dialog",{name:"Histórico e comparações"});
  await dialog.waitFor();
  await dialog.getByText("Registros de execução").waitFor();
  await dialog.getByText("Estado inicial:",{exact:false}).waitFor();
  await dialog.getByRole("region",{name:"Diferenças entre os resultados observados"}).waitFor();
  await dialog.getByRole("button",{name:"Alterações da TF"}).click();
  await dialog.getByText("12.08.00").waitFor();
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    const widths=await page.evaluate(()=>{
      const dialog=document.querySelector('[role="dialog"][aria-modal="true"]');
      return {
        root:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        dialog:dialog?dialog.scrollWidth-dialog.clientWidth:0
      };
    });
    assert.ok(widths.root<=1&&widths.dialog<=1,
      "History overflow "+width+": "+JSON.stringify(widths));
    await page.screenshot({path:"artifacts/f4-search/history-"+width+".png"});
  }
  assert.deepEqual(errors,[]);
  console.log("F4: 108 tarefas sintéticas, paginação RPC, busca, filtros salvos, histórico, diff e 4 breakpoints.");
} finally {await browser.close();}
