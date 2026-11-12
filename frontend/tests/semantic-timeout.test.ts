import {describe,expect,it,vi,afterEach} from "vitest";
import {buildSemanticPlan,compileSemanticContext} from "../src/features/generators/semantic-context";
import {extractLocalSemanticChunk} from "../src/features/generators/semantic-local";
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
 it("um único 504 não dispara novas requisições nem divide em subrequisições",async()=>{
  const chunk=buildSemanticPlan(original).chunks[0];
  const mocked=vi.fn(async()=>new Response(JSON.stringify({
   code:"provider_timeout",message:"Tempo de resposta excedido nesta parte."
  }),{status:504,headers:{"Content-Type":"application/json"}}));
  vi.stubGlobal("fetch",mocked);
  await expect(analyzeSemanticChunk(chunk,"teste",new AbortController().signal))
   .rejects.toThrow("Tempo de resposta excedido");
  expect(mocked).toHaveBeenCalledTimes(1);
  const outcome=extractLocalSemanticChunk(chunk,"teste");
  expect(outcome.method).toBe("local");
  expect(outcome.facts.length).toBeGreaterThan(0);
  expect(outcome.facts.every(f=>chunk.text.includes(f.quote))).toBe(true);
 });
 it("prepara as 20 partes de um relatório extenso com citações locais rastreáveis",()=>{
  const source=[
   "TF 196756 — Vale-compra e faturamento",
   ...Array.from({length:950},(_,i)=>
    "CENÁRIO "+i+" — Testar regra do pedido e lançamento do vale no faturamento do carregamento."),
   "Revisão final: Parecer fiscal proíbe tratar vale como desconto na NF.",
   "Decisão final: REQ-2026-799 substitui os requisitos anteriores.",
   "Regra correta: pedido mínimo = TotalVale / (percentual/100)."
  ].join("\n");
  expect(source.length).toBeGreaterThan(65000);
  const plan=buildSemanticPlan(source);
  expect(plan.chunks.length).toBeGreaterThanOrEqual(20);
  expect(plan.chunks.map(c=>c.text).join("")).toBe(source);
  const outcomes=new Map(plan.chunks.map((chunk,index)=>{
   const outcome=extractLocalSemanticChunk(chunk,"teste");
   return [chunk.id,index<6?{...outcome,method:"nvidia" as const,model:"teste"}:outcome] as const;
  }));
  const compiled=compileSemanticContext(plan,outcomes,"teste");
  expect(compiled.coverage.analyzedChunks).toBe(plan.chunks.length);
  expect(compiled.coverage.localChunks).toBe(plan.chunks.length-6);
  expect(compiled.coverage.failedChunks).toBe(0);
  expect(compiled.task).toContain("REQ-2026-799");
  expect(compiled.task).toContain("TotalVale / (percentual/100)");
  expect(compiled.task).toContain("sem interpretação da IA");
 });
 it("não inclui credenciais encontradas nos trechos locais",()=>{
  const text="Senha: exemplo-super-secreto\nToken: chave-interna\n"+
   "Regra: o vale-compra deve ser tratado como pagamento e não como desconto na NF.";
  const chunk=buildSemanticPlan(text).chunks[0];
  const outcome=extractLocalSemanticChunk(chunk,"teste");
  expect(outcome.facts.some(x=>x.quote.includes("exemplo-super-secreto"))).toBe(false);
  expect(outcome.facts.some(x=>x.quote.includes("chave-interna"))).toBe(false);
  expect(outcome.facts.map(x=>x.quote).join("\n")).toContain("vale-compra");
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
