import {describe,expect,it,vi,afterEach} from "vitest";
import {buildSemanticPlan} from "../src/features/generators/semantic-context";
import {analyzeSemanticChunk,splitSemanticChunk} from
 "../src/features/generators/semantic-service";

vi.mock("../src/lib/supabase",()=>({
 supabase:{auth:{getSession:async()=>({data:{
  session:{access_token:"synthetic-token"}},error:null})}},
 supabaseUrl:"https://example.invalid",publishableKey:"public-fixture"
}));
afterEach(()=>vi.unstubAllGlobals());

const original=Array.from({length:69},(_,i)=>
 "Regra "+String(i+1).padStart(3,"0")+
 ": conferir o vale-compra como entrada quitada, nunca como desconto de NF.").join("\n");

describe("Retomada semântica em documentos extensos",()=>{
 it("reparte sem perder um caractere, linha ou caractere Unicode",()=>{
  const source="🧪 Análise inicial\n"+original+"\n"+("📄".repeat(700));
  const chunk=buildSemanticPlan(source).chunks[0];
  const [a,b]=splitSemanticChunk(chunk);
  expect(a.text+b.text).toBe(chunk.text);
  expect(a.start).toBe(chunk.start);
  expect(b.start).toBe(a.end);
  expect(b.end).toBe(chunk.end);
  expect(b.startLine).toBe(chunk.startLine+(a.text.match(/\n/g)?.length??0));
  expect(a.text.endsWith("\uD83E")).toBe(false);
  expect(b.text.startsWith("\uDDEA")).toBe(false);
 });
 it("não extrai informações ou cria novas chamadas após um 504",async()=>{
  const chunk=buildSemanticPlan(original).chunks[0];
  const requests:{text:string;chunkId:string}[]=[];
  const mocked=vi.fn(async(_url:string,init:RequestInit)=>{
   const data=JSON.parse(String(init.body)) as {text:string;chunkId:string};
   requests.push(data);
   return new Response(JSON.stringify({
    code:"provider_timeout",message:"A NVIDIA ultrapassou o tempo de resposta."
   }),{status:504,headers:{"Content-Type":"application/json"}});
  });
  vi.stubGlobal("fetch",mocked);
  await expect(analyzeSemanticChunk(chunk,"teste",new AbortController().signal))
   .rejects.toThrow("A NVIDIA ultrapassou o tempo de resposta.");
  expect(requests).toHaveLength(1);
  expect(requests[0]).toEqual({text:chunk.text,chunkId:chunk.id});
 });
 it("não fragmenta nem tenta novamente um bloco quando a sessão é inválida",async()=>{
  const chunk=buildSemanticPlan(original).chunks[0];
  const mocked=vi.fn(async()=>new Response(JSON.stringify({
   code:"unauthorized",message:"Sessão expirada."
  }),{status:401,headers:{"Content-Type":"application/json"}}));
  vi.stubGlobal("fetch",mocked);
  await expect(analyzeSemanticChunk(chunk,"teste",new AbortController().signal))
   .rejects.toThrow("Sessão expirada.");
  expect(mocked).toHaveBeenCalledTimes(1);
 });
});
