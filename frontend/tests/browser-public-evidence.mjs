import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";

const BASE="http://127.0.0.1:4173/QA-Hub/";
const taskId="22222222-2222-4222-8222-222222222222";
const scenarioId="33333333-3333-4333-8333-333333333333";
const imageId="44444444-4444-4444-8444-444444444444";
const task={
  id:taskId,titulo:"Validação pública de descontos",codigo:"67866",tipo_teste:"BUILD",
  sistema:"Financeiro",versao:"12.10.16.0003",executado_em:"2026-11-10",
  status:"em_teste",descricao:"Teste de exclusão do desconto",explicacao:"",
  causa:"",correcao:"",conclusao:"",observacoes:"Observações gerais da TF"
};
const scenario={
 id:scenarioId,titulo:"Remover desconto negativo",ordem:1,
 passos:"1. Abrir pedido",esperado:"Saldo atualizado",
 obtido:"Valor permaneceu divergente",observacoes:"Falha confirmada no teste",
 status:"reprovado"
};
const img=Buffer.from(
 "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64");
const errors=[],requests=[];
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on("pageerror",error=>errors.push(error.message));
 await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",async route=>{
   const request=route.request(),url=new URL(request.url());
   requests.push(url.pathname);
   if(url.pathname.endsWith("/rest/v1/rpc/qa_public_task_v1")){
     return route.fulfill({status:200,contentType:"application/json",
       headers:{"Access-Control-Allow-Origin":"*"},body:JSON.stringify({
         task,scenarios:[scenario],diagrams:[],
         evidencias:[{id:imageId,cenario_id:scenarioId,nome_original:"captura.png",
           descricao:"Erro observado após retirar o desconto",mime_type:"image/png"}]
       })});
   }
   if(url.pathname.endsWith("/functions/v1/qa-public-evidence")){
     assert.equal(url.searchParams.get("file"),imageId,
       "Public page must only request the explicitly projected ID");
     return route.fulfill({status:200,contentType:"image/png",
       headers:{"Access-Control-Allow-Origin":"*"},body:img});
   }
   if(url.pathname.endsWith("/auth/v1/user"))return route.fulfill({
      status:401,contentType:"application/json",body:'{"message":"not authenticated"}'});
   return route.fulfill({status:404,contentType:"application/json",body:'{}'});
 });
 await page.goto(BASE+"#/publicas?tf="+taskId);
 await page.getByRole("heading",{name:"Validação pública de descontos"}).waitFor({timeout:7000}).catch(async error=>{
   console.error("PUBLIC PAGE", (await page.locator("body").innerText()).slice(0,2200));
   console.error("REQUESTS",requests);
   throw error;
 });
 await page.getByRole("heading",{name:"Cenários de teste"}).waitFor();
 await page.getByText("Falha confirmada no teste").waitFor();
 await page.getByText("Valor permaneceu divergente").waitFor();
 assert.equal(await page.getByText("Reprovado",{exact:true}).count(),1);
 assert.equal(await page.locator(".qa-public-test-count.reprovado strong").innerText(),"1");
 const evidence=page.getByRole("img",{name:"Erro observado após retirar o desconto"});
 await evidence.waitFor();
 await page.waitForFunction(()=>{
   const img=document.querySelector(".qa-public-case-images img");
   return img?.complete&&img.naturalWidth>0;
 });
 assert.ok(requests.some(path=>path.endsWith("/functions/v1/qa-public-evidence")));
 assert.ok(!requests.some(path=>path.includes("storage/v1/object")),
   "Public images must never read the private bucket directly");
 mkdirSync("artifacts/public-evidence",{recursive:true});
 for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=1,"Public QA result overflow at "+width+": "+overflow);
   await page.screenshot({path:"artifacts/public-evidence/scenario-"+width+".png"});
 }
 assert.deepEqual(errors,[]);
 console.log("Página pública: status reprovado, observações, imagem autorizada, proxy privado e 4 breakpoints.");
}finally{await browser.close();}
