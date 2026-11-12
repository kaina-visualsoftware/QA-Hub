import {describe,expect,it,vi,afterEach} from "vitest";
import {buildSemanticPlan} from "../src/features/generators/semantic-context";
import {analyzeSemanticChunk} from "../src/features/generators/semantic-service";
import {AiRequestError} from "../src/lib/ai-retry";

vi.mock("../src/lib/supabase",()=>({
 supabase:{auth:{getSession:async()=>({data:{
  session:{access_token:"synthetic-token"}},error:null})}},
 supabaseUrl:"https://example.invalid",publishableKey:"public-fixture"
}));
afterEach(()=>vi.unstubAllGlobals());

const original=Array.from({length:69},(_,i)=>
 "Regra "+String(i+1).padStart(3,"0")+
 ": conferir o vale-compra como entrada quitada, nunca como desconto de NF.").join("\n");
const chunk=buildSemanticPlan(original).chunks[0];
const timeout=()=>new Response(JSON.stringify({
 error:"semantic_timeout",code:"provider_timeout",retry_after_seconds:15,
 message:"A NVIDIA não concluiu esta parte no prazo."
}),{status:504,headers:{"Content-Type":"application/json","Retry-After":"15"}});
const answer=(text:string)=>new Response(JSON.stringify({
 chunkId:chunk.id,source:chunk.source,goal:"teste",provider:"NVIDIA Build",
 model:"fixture",unverified:0,facts:[{
  category:"regra",quote:text,summary:"Regra original extraída pela NVIDIA."
 }]
}),{status:200,headers:{"Content-Type":"application/json"}});

describe("Recuperação NVIDIA-only de timeout em documentos extensos",()=>{
 it("após 504 espera, tenta apenas mais uma vez pela IA e preserva integralmente o trecho",async()=>{
  const requests:Record<string,unknown>[]=[];
  vi.stubGlobal("fetch",vi.fn(async(_url:string,init:RequestInit)=>{
   requests.push(JSON.parse(String(init.body)));
   return requests.length===1?timeout():
    answer("Regra 001: conferir o vale-compra como entrada quitada, nunca como desconto de NF.");
  }));
  const waits:number[]=[];
  const stages:string[]=[];
  const states:unknown[]=[];
  const result=await analyzeSemanticChunk(chunk,"teste",new AbortController().signal,
   stage=>stages.push(stage),state=>states.push(state),
   {wait:async duration=>{waits.push(duration);}});
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({text:chunk.text,source:"TF",chunkId:chunk.id,goal:"teste"});
  expect(requests[1]).toMatchObject({text:chunk.text,source:"TF",chunkId:chunk.id,goal:"teste",profile:"compact"});
  expect(waits).toEqual([15000]);
  expect(stages).toContain("cooldown");
  expect(states).toContainEqual(expect.objectContaining({reason:"timeout",source:"provider"}));
  expect(result.facts).toHaveLength(1);
  expect(result.facts[0].quote).toBe("Regra 001: conferir o vale-compra como entrada quitada, nunca como desconto de NF.");
  expect(result.model).toBe("fixture");
 });
 it("dois 504 preservam o estado pendente sem terceira chamada ou extração local",async()=>{
  const requests:Record<string,unknown>[]=[];
  vi.stubGlobal("fetch",vi.fn(async(_url:string,init:RequestInit)=>{
   requests.push(JSON.parse(String(init.body)));return timeout();
  }));
  const done=analyzeSemanticChunk(chunk,"teste",new AbortController().signal,
   ()=>{},()=>{},{wait:async()=>{}});
  await expect(done).rejects.toBeInstanceOf(AiRequestError);
  expect(requests).toHaveLength(2);
  expect(requests[1].profile).toBe("compact");
  expect(requests[1].text).toBe(chunk.text);
 });
 it("retomada de bloco que já expirou usa perfil compacto direto",async()=>{
  const requests:Record<string,unknown>[]=[];
  vi.stubGlobal("fetch",vi.fn(async(_url:string,init:RequestInit)=>{
   requests.push(JSON.parse(String(init.body)));
   return answer("Regra 002: conferir o vale-compra como entrada quitada, nunca como desconto de NF.");
  }));
  const result=await analyzeSemanticChunk(chunk,"teste",new AbortController().signal,
   ()=>{},()=>{},{preferCompact:true,wait:async()=>{throw Error("Não deveria esperar");}});
  expect(requests).toHaveLength(1);
  expect(requests[0].profile).toBe("compact");
  expect(result.facts).toHaveLength(1);
 });
 it("cancelamento da espera não permite segunda requisição",async()=>{
  const controller=new AbortController();
  const requests:Record<string,unknown>[]=[];
  vi.stubGlobal("fetch",vi.fn(async(_url:string,init:RequestInit)=>{
   requests.push(JSON.parse(String(init.body)));return timeout();
  }));
  await expect(analyzeSemanticChunk(chunk,"teste",controller.signal,
   ()=>{},()=>{},{
    wait:async()=>{controller.abort();throw new DOMException("Cancelado","AbortError");}
   })).rejects.toThrow();
  expect(requests).toHaveLength(1);
 });
 it("401 não é transformado em repetição nem em dados extraídos localmente",async()=>{
  const mocked=vi.fn(async()=>new Response(JSON.stringify({
   code:"unauthorized",message:"Sessão expirada."
  }),{status:401,headers:{"Content-Type":"application/json"}}));
  vi.stubGlobal("fetch",mocked);
  await expect(analyzeSemanticChunk(chunk,"teste",new AbortController().signal))
   .rejects.toThrow("Sessão expirada.");
  expect(mocked).toHaveBeenCalledTimes(1);
 });
});
