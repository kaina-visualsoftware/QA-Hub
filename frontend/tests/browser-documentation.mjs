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
let files=[],uploads=0,failNextUpload=false;
const samples=new Map();
const docId="44444444-4444-4444-8444-444444444444";
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
  if(path.endsWith("/rest/v1/rpc/qa_public_tasks_v1"))return send([]);
  if(path.endsWith("/rest/v1/rpc/qa_public_documentacoes_v1")){
    const id=request.postDataJSON()?.p_id;
    return send(referenceRows.filter(row=>row.publica&&(!id||row.id===id)).map(({user_id,...row})=>row));
  }
  if(path.endsWith("/rest/v1/qa_referencias")){
    const id=url.searchParams.get("id")?.replace("eq.","");
    if(method==="GET")return send(id?referenceRows.find(row=>row.id===id)??null:referenceRows);
    if(method==="POST"){
      const payload=request.postDataJSON();assert.equal(payload.user_id,owner);
      const row={...payload,id:docId,created_at:"2026-11-10"};referenceRows.push(row);return send(row,201);
    }
    if(method==="PATCH"){
      assert.equal(url.searchParams.get("user_id"),"eq."+owner);
      const row=referenceRows.find(row=>row.id===id);Object.assign(row,request.postDataJSON());return send(row);
    }
    if(method==="DELETE"){referenceRows.splice(0,referenceRows.length);return send({id});}
  }
  if(path.endsWith("/rest/v1/qa_documentacao_arquivos")){
    if(method==="POST"){files.push({...request.postDataJSON(),created_at:"2026-11-10"});return send(null,201);}
    if(method==="DELETE"){const id=url.searchParams.get("id").replace("eq.","");files=files.filter(file=>file.id!==id);return send({id});}
    return send(files);
  }
  if(path.includes("/storage/v1/object/")){
    if(method==="POST"){
      if(failNextUpload){failNextUpload=false;return send({message:"Falha simulada no envio"},500);}
      uploads++;return send({Key:path});
    }
    if(method==="DELETE")return send([]);
    const file=files.find(file=>path.endsWith(file.path));
    return route.fulfill({status:200,headers:cors,contentType:file?.mime??"text/plain",body:samples.get(file?.nome)||"Passos detalhados do arquivo"});
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

mkdirSync("artifacts/documentation",{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on("pageerror",error=>errors.push(error.message));
 await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
 async function audit(label){
  await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
  const violations=await page.evaluate(async()=>{const result=await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},rules:{region:{enabled:false}}});return result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});
  assert.deepEqual(violations,[],label);
 }
 await page.goto(ROOT);
 await page.getByRole("textbox",{name:"Email"}).fill(user.email);
 await page.getByLabel("Senha").fill("fixture");await page.getByRole("button",{name:"Entrar",exact:true}).click();
 await page.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor();
 await page.getByRole("link",{name:"Documentações",exact:true}).click();
 await page.getByRole("button",{name:"Nova documentação",exact:true}).click();
 const editor=page.getByRole("dialog",{name:"Nova documentação",exact:true});
 assert.equal(await editor.getByLabel("Quem pode consultar?").inputValue(),"private");
 await editor.getByLabel("Título",{exact:true}).fill("Resolver falha de emissão");
 await editor.getByRole("combobox",{name:/^Tipo/}).selectOption("solucao");
 await editor.getByLabel("TF vinculada (opcional)").selectOption(task.id);
 await editor.getByLabel("Texto da documentação").fill("# Contexto\n\nFalha recorrente.\n\n## Solução\n\n1. Revisar configuração.\n2. Repetir emissão.");
 const videoBytes=await page.evaluate(()=>new Promise(resolve=>{
  const canvas=document.createElement("canvas");canvas.width=160;canvas.height=90;canvas.getContext("2d").fillRect(0,0,160,90);
  const stream=canvas.captureStream(5),chunks=[],recorder=new MediaRecorder(stream,{mimeType:"video/webm"});
  recorder.ondataavailable=e=>chunks.push(e.data);
  recorder.onstop=async()=>{resolve([...new Uint8Array(await new Blob(chunks,{type:"video/webm"}).arrayBuffer())]);stream.getTracks().forEach(track=>track.stop());};
  recorder.start();setTimeout(()=>recorder.stop(),350);
 }));
 const video=Buffer.from(videoBytes);samples.set("tutorial.webm",video);
 const image=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOa2nx0AAAAASUVORK5CYII=","base64");samples.set("captura.png",image);
 const sql=Buffer.from("CREATE TABLE exemplo (token text, password text);","utf8");
 samples.set("modelo.sql",sql);
 const zip=Buffer.from("PK synthetic archive fixture");
 samples.set("exemplo.zip",zip);
 await editor.locator("input[type=file]").setInputFiles([
  {name:"passos.txt",mimeType:"text/plain",buffer:Buffer.from("Passos detalhados do arquivo")},
  {name:"tutorial.webm",mimeType:"video/webm",buffer:video},
  {name:"captura.png",mimeType:"image/png",buffer:image},
  {name:"modelo.sql",mimeType:"application/sql",buffer:sql},
  {name:"exemplo.zip",mimeType:"application/zip",buffer:zip}
 ]);
 for(const width of [320,390,768,1366]){
  await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1);
  await audit("editor "+width);await page.screenshot({path:"artifacts/documentation/editor-"+width+".png"});
 }
 failNextUpload=true;await editor.getByRole("button",{name:"Salvar documentação"}).click();

 await editor.getByText(/O texto foi salvo/).waitFor();assert.equal(referenceRows.length,1);
 await editor.getByRole("button",{name:"Salvar documentação"}).click();await editor.waitFor({state:"detached"});
 assert.equal(referenceRows.length,1,"Attachment retry cannot duplicate the documentation");assert.equal(uploads,5);assert.equal(files.length,5);
 const record=referenceRows[0];assert.equal(record.tarefa_id,task.id);assert.equal(record.publica,false);
 const viewer=page.getByRole("dialog",{name:record.titulo,exact:true});await viewer.waitFor();
 await viewer.getByRole("heading",{name:"Contexto",exact:true}).waitFor();
 await viewer.locator(".qa-doc-embed-code").filter({hasText:"CREATE TABLE exemplo"}).waitFor();
 await viewer.getByText("exemplo.zip").first().waitFor();
 await viewer.getByRole("article").filter({hasText:"passos.txt"}).getByRole("button",{name:"Visualizar",exact:true}).click();
 const preview=page.getByRole("dialog",{name:"Visualizar anexo — passos.txt"});await preview.getByText("Passos detalhados do arquivo").waitFor();
 await page.keyboard.press("Escape");await preview.waitFor({state:"detached"});
 await page.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"]')].some(el=>el.querySelector("h2")?.textContent==="Resolver falha de emissão"&&el.contains(document.activeElement)));
 assert.equal(await viewer.evaluate(el=>el.contains(document.activeElement)),true);
 await viewer.getByRole("article").filter({hasText:"tutorial.webm"}).getByRole("button",{name:"Visualizar",exact:true}).click();
 const videoPreview=page.getByRole("dialog",{name:"Visualizar anexo — tutorial.webm"});await videoPreview.waitFor();
 await page.waitForFunction(()=>document.querySelector("video")?.readyState>=1);
 assert.equal(await videoPreview.locator("video").evaluate(video=>video.videoWidth),160);
 await page.keyboard.press("Escape");
 await viewer.getByRole("article").filter({hasText:"captura.png"}).getByRole("button",{name:"Visualizar",exact:true}).click();
 const imageModal=page.getByRole("dialog",{name:"Visualizar anexo — captura.png"});
 await imageModal.getByRole("img").waitFor();
 await imageModal.getByRole("button",{name:"Aumentar zoom"}).click();
 await imageModal.getByText("125%").waitFor();
 await imageModal.getByRole("button",{name:"Redefinir zoom"}).click();
 await imageModal.getByText("100%").waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll(".qa-resource-preview-image")].some(image=>image.naturalWidth>0));
 await page.keyboard.press("Escape");
 await viewer.getByRole("button",{name:"Editar documentação",exact:true}).click();
 const edit=page.getByRole("dialog",{name:"Editar documentação",exact:true});
 await edit.getByLabel("Quem pode consultar?").selectOption("public");
 await edit.getByRole("button",{name:"Salvar documentação"}).click();await edit.waitFor({state:"detached"});assert.equal(record.publica,true);
 await page.keyboard.press("Escape");await page.getByRole("button",{name:"Documentações públicas",exact:true}).click();
 await page.getByText(record.titulo,{exact:true}).waitFor();
 for(const width of [320,390,768,1366]){
  await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1);await audit("catalog "+width);
  await page.screenshot({path:"artifacts/documentation/catalog-"+width+".png"});
 }
 const context=await browser.newContext(),guest=await context.newPage();await guest.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",mock);
 await guest.goto(ROOT+"#/publicas");
 await guest.getByRole("heading",{name:"Documentações públicas"}).waitFor();
 await guest.getByRole("link",{name:/Resolver falha de emissão/}).waitFor();
 await guest.goto(ROOT+"#/documentacoes?doc="+record.id);
 await guest.getByRole("dialog",{name:record.titulo,exact:true}).waitFor();
 assert.equal(await guest.getByRole("button",{name:"Editar documentação",exact:true}).count(),0);
 await guest.getByText("passos.txt",{exact:true}).waitFor();
 record.publica=false;await guest.reload();await guest.getByText("Esta documentação é privada, foi excluída ou não existe.").waitFor();await context.close();
 await page.getByRole("button",{name:"Minhas documentações",exact:true}).click();await page.getByRole("link",{name:"Visualizar "+record.titulo,exact:true}).click();await viewer.waitFor();
 page.once("dialog",d=>void d.accept());await viewer.getByRole("button",{name:"Excluir documentação"}).click();await viewer.waitFor({state:"detached"});
 assert.equal(referenceRows.length,0);assert.equal(files.length,0);assert.deepEqual(errors,[]);
 console.log("Documentações: CRUD, TF link, private default, upload retry without duplicates, nested preview, publication, anonymous read/revocation, deletion and four viewport WCAG passed.");
}finally{await browser.close();}
