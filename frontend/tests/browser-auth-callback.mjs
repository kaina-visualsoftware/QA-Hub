import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base="http://127.0.0.1:4173/QA-Hub/";
const browser=await chromium.launch({headless:true});
const failures=[];
const user={
  id:"11111111-1111-4111-8111-111111111111",
  aud:"authenticated",role:"authenticated",email:"auth-fixture@example.invalid",
  app_metadata:{provider:"email",providers:["email"]},user_metadata:{},
  created_at:"2026-11-06T12:00:00.000Z"
};
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
};
const jwt=[
  Buffer.from(JSON.stringify({alg:"none",typ:"JWT"})).toString("base64url"),
  Buffer.from(JSON.stringify({
    sub:user.id,role:"authenticated",aud:"authenticated",
    exp:Math.floor(Date.now()/1000)+3600
  })).toString("base64url"),
  "sig"
].join(".");
try{
  const errorPage=await browser.newPage();
  errorPage.on("pageerror",error=>failures.push(error.message));
  await errorPage.goto(base+"auth.html#error=access_denied&error_code=otp_expired");
  await errorPage.getByText(/link expirou ou não pôde ser validado/).waitFor();
  assert.equal(await errorPage.getByRole("link",{name:"Voltar ao QA Hub"}).count(),1);
  await errorPage.getByRole("link",{name:"Voltar ao QA Hub"}).click();
  await errorPage.getByRole("heading",{name:"Entrar",exact:true}).waitFor();
  await errorPage.close();

  const recovery=await browser.newPage();
  recovery.on("pageerror",error=>failures.push(error.message));
  await recovery.route("**/pqadmlhcsimlcclpkyov.supabase.co/**",async route=>{
    const request=route.request(),url=new URL(request.url());
    const method=request.method();
    const send=(data,status=200)=>route.fulfill({
      status,headers:cors,contentType:"application/json",body:JSON.stringify(data)
    });
    if(method==="OPTIONS")return route.fulfill({status:204,headers:cors});
    if(url.pathname.endsWith("/auth/v1/user")) {
      if(method==="PUT")return send(user);
      return send(user);
    }
    if(url.pathname.endsWith("/auth/v1/token"))return send({
      access_token:jwt,refresh_token:"fake-refresh",token_type:"bearer",
      expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user
    });
    if(await mockF4Rpc(route,[],[]))return;
    if(url.pathname.endsWith("/rest/v1/qa_admins"))return send(null);
    if(url.pathname.endsWith("/rest/v1/qa_tarefas"))return send([]);
    failures.push("Unexpected callback API "+method+" "+url.pathname);
    return send({message:"Unexpected API"},500);
  });
  await recovery.goto(base+"auth.html#access_token="+encodeURIComponent(jwt)+
    "&expires_in=3600&refresh_token=fake-refresh&token_type=bearer&type=recovery");
  await recovery.waitForURL(/#\/recuperar$/, {timeout:20000});
  assert.equal(recovery.url().includes("access_token"),false,
    "Callback must remove credentials from browser URL");
  await recovery.getByRole("heading",{name:"Definir nova senha"}).waitFor({timeout:20000});
  await recovery.getByLabel("Nova senha").fill("synthetic-strong-password");
  await recovery.getByRole("button",{name:"Atualizar senha"}).click();
  await recovery.getByRole("heading",{name:"Suas tarefas de teste"}).waitFor({timeout:20000});
  assert.equal(recovery.url().includes("access_token"),false);
  assert.deepEqual(failures,[]);
  console.log("Auth callback isolado: link inválido, recuperação simulada, URL sem credenciais e retorno à SPA.");
}finally{await browser.close();}
