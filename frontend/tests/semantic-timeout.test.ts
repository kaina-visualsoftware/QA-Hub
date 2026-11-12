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
 it("quando o primeiro bloco expira, fragmenta duas vezes e verifica todas as citações",async()=>{
  const chunk=buildSemanticPlan(original).chunks[0];
  const requests:{text:string;chunkId:string}[]=[];
  const mocked=vi.fn(async(_url:string,init:RequestInit)=>{
   const data=JSON.parse(String(init.body)) as {text:string;chunkId:string};
   requests.push(data);
   if(data.text.length>1200)return new Response(JSON.stringify({
    code:"provider_timeout",message:"Tempo de resposta excedido nesta parte."
   }),{status:504,headers:{"Content-Type":"application/json"}});
   const quote=data.text.match(/Regra \d+: [^\n]{25,}/)?.[0]??"";
   return new Response(JSON.stringify({
    chunkId:data.chunkId,source:"TF",goal:"teste",provider:"NVIDIA Build",
    model:"fixture",unverified:0,
    facts:quote?[{category:"regra",quote,summary:"Regra preservada."}]:[]
   }),{status:200,headers:{"Content-Type":"application/json"}});
  });
  vi.stubGlobal("fetch",mocked);
  const result=await analyzeSemanticChunk(chunk,"teste",new AbortController().signal);
  expect(requests[0].text).toBe(chunk.text);
  expect(requests.length).toBeGreaterThan(3);
  expect(requests.filter(r=>r.text.length<=1200)
   .map(r=>r.text).join("")).toBe(chunk.text);
  expect(requests.every(r=>r.chunkId===chunk.id)).toBe(true);
  expect(result.facts.length).toBeGreaterThan(2);
  expect(result.facts.every(f=>chunk.text.includes(f.quote))).toBe(true);
  expect(result.facts.map(f=>f.line)).toEqual([...result.facts.map(f=>f.line)].sort((a,b)=>a-b));
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
