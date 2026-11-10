import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
import {mockF4Rpc} from "./f4-mock-rpc.mjs";

const ROOT="http://127.0.0.1:4173/QA-Hub/";
const USER="11111111-1111-4111-8111-111111111111";
const TASK="22222222-2222-4222-8222-222222222222";
const user={id:USER,email:"quick-tools@fixture.invalid",aud:"authenticated",
  role:"authenticated",app_metadata:{provider:"email",providers:["email"]},
  user_metadata:{},created_at:"2026-11-08T10:00:00Z"};
const task={id:TASK,user_id:USER,titulo:"Correção de descontos",codigo:"QA-199",
  status:"em_teste",tipo_teste:"BUILD",sistema:"Financeiro",versao:"12.08",
  descricao:"Validar a remoção do desconto em pagamentos.",publica:false,
  created_at:"2026-11-08T10:00:00Z",executado_em:"2026-11-08"};
const cases=[{id:"44444444-4444-4444-8444-444444444444",tarefa_id:TASK,
  user_id:USER,titulo:"Conferir desconto",passos:"Abrir pedido",esperado:"Total correto",
  observacoes:"",status:"nao_executado",obtido:"",ordem:1}];
const diagrams=[{id:"55555555-5555-4555-8555-555555555555",tarefa_id:TASK,user_id:USER,
  titulo:"Fluxo de descontos",conteudo:"flowchart LR\n A[Pedido] --> B[Conferir desconto]"}];
const documents=[{id:"66666666-6666-4666-8666-666666666666",tarefa_id:TASK,
  tipo:"post",titulo:"Post de homologação",conteudo:"# Resultado\nTeste concluído.",
  versao:1,created_at:"2026-11-08T11:00:00Z"}];
const fileId="77777777-7777-4777-8777-777777777777";
const sourceId="88888888-8888-4888-8888-888888888888";
const evidenceFile={id:fileId,tarefa_id:TASK,user_id:USER,cenario_id:null,
 nome_original:"resultado.txt",mime_type:"text/plain",tamanho_bytes:14,
 objeto_path:USER+"/"+TASK+"/"+fileId+".txt",descricao:"Resultado registrado",created_at:"2026-11-10"};
const source={id:sourceId,tarefa_id:TASK,user_id:USER,tipo_fonte:"texto",versao:1,
 texto_extraido:"Especificação sintética para consulta",created_at:"2026-11-10"};
let storageFailure=false;
const problems=[],writes=[];
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
};
async function mock(route){
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const send=(data,status=200)=>route.fulfill({
    status,contentType:"application/json",headers:cors,body:JSON.stringify(data)
  });
  if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(path.endsWith("/auth/v1/token"))return send({
    access_token:"eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token:"fixture",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user
  });
  if(path.endsWith("/auth/v1/user"))return send(user);
  if(await mockF4Rpc(route,[task],cases))return;
  if(path.endsWith("/rest/v1/qa_admins"))return send(null);
  if(path.endsWith("/rest/v1/qa_tarefas"))return send([task]);
  if(path.endsWith("/rest/v1/qa_cenarios"))return send(cases);
  if(path.endsWith("/rest/v1/qa_diagramas")){
    if(method==="GET")return send(diagrams);
    writes.push(method+" "+path);return send({message:"Writes not permitted in this test"},500);
  }
  if(path.endsWith("/rest/v1/qa_documentos"))return send(documents);
  if(path.endsWith("/rest/v1/qa_requisitos"))return send([]);
  if(path.endsWith("/rest/v1/qa_evidencia_arquivos"))return send([evidenceFile]);
  if(path.endsWith("/rest/v1/qa_requisito_fontes"))return send([source]);
  if(path.endsWith("/rest/v1/qa_evidencias")||path.endsWith("/rest/v1/qa_eventos"))return send([]);
  if(path.includes("/storage/v1/object/")){
    if(storageFailure)return send({message:"Falha simulada ao baixar anexo"},500);
    return route.fulfill({status:200,headers:cors,contentType:"text/plain",body:"Texto do anexo"});
  }
  problems.push(method+" "+path);return send({message:"Unexpected API"},500);
}

mkdirSync("artifacts/file-workspace",{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on("pageerror",error=>problems.push(error.message));
 await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
 await page.goto(ROOT);
 await page.getByRole("textbox",{name:"Email"}).fill(user.email);
 await page.getByLabel("Senha").fill("fixture");
 await page.getByRole("button",{name:"Entrar",exact:true}).click();
 await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor();
 await page.goto(ROOT+"#/tarefa/"+TASK);
 await page.getByRole("heading",{name:task.titulo}).waitFor();
 await page.getByRole("tab",{name:"Arquivos e requisitos",exact:true}).click();
 await page.getByRole("tab",{name:"Arquivos e evidências",exact:true}).click();
 const sourceAction=page.getByRole("button",{name:"Visualizar texto",exact:true});
 await sourceAction.click();
 const sourceViewer=page.getByRole("dialog",{name:"Visualizar documento — Texto importado"});
 await sourceViewer.getByText(source.texto_extraido).waitFor();
 await page.keyboard.press("Escape");
 assert.equal(await sourceAction.evaluate(el=>el===document.activeElement),true);
 const fileAction=page.getByRole("button",{name:"Visualizar",exact:true});
 await fileAction.click();
 const fileViewer=page.getByRole("dialog",{name:"Visualizar arquivo — resultado.txt"});
 await fileViewer.getByText("Texto do anexo").waitFor();
 for(const width of [320,390,768,1366]){
  await page.setViewportSize({width,height:844});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=1,"Files workspace overflow at "+width+": "+overflow);
  await page.screenshot({path:"artifacts/file-workspace/preview-"+width+".png"});
 }
 await page.keyboard.press("Escape");
 assert.equal(await fileAction.evaluate(el=>el===document.activeElement),true);
 assert.equal(await page.locator(".qa-file-preview").count(),0,"Closing leaves no inline preview");
 storageFailure=true;
 await fileAction.click();
 await page.getByRole("alert").filter({hasText:"Falha simulada ao baixar anexo"}).waitFor();
 assert.equal(await page.getByRole("dialog").count(),0,"A failed download must show its error in the read-only list");
 assert.deepEqual(problems,[]);
 assert.deepEqual(writes,[]);
 console.log("Files: source/file modal previews, async focus restoration, download error in read-only list and four breakpoints passed.");
}finally{await browser.close();}
