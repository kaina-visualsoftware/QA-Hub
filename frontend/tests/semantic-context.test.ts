import {describe,expect,it} from "vitest";
import {buildSemanticPlan,compileSemanticContext,validateSemanticFacts,SEMANTIC_CHUNK_SIZE} from
 "../src/features/generators/semantic-context";
import type {ChunkOutcome} from "../src/features/generators/semantic-context";
import {estimateContextTokens} from "../src/lib/token-budget";

describe("F2/F3 — análise semântica auditável do QA Hub",()=>{
 it("F3 reparte texto com caracteres multibyte sem perder emoji, linhas ou caracteres",()=>{
  const text="RF-932: "+("🧪".repeat(6000))+"\nResultado esperado: válido.";
  const plan=buildSemanticPlan(text);
  expect(plan.chunks.length).toBeGreaterThan(1);
  expect(plan.chunks.map(c=>c.text).join("")).toBe(text);
  expect(plan.chunks.every(c=>estimateContextTokens(c.text)<=6000)).toBe(true);
  expect(plan.chunks.every(c=>!c.text.endsWith("\uD83E"))).toBe(true);
 });
 it("preserva integralmente o texto de cada fonte ao dividir, inclusive SQL e linhas longas",()=>{
  const tf=[
   "TF-67866 — Desconto negativo", "## Problema",
   "SELECT valor, desconto FROM pedidos;",
   "## Análise de viabilidade",
   "Não aplicar desconto negativo duas vezes. ".repeat(650),
   "## Conclusão","O desconto final deve ser R$ 0,00."
  ].join("\n");
  const req="RF-12: Reaplicar desconto só uma vez.\n\n"+"Resultado esperado: zero\n".repeat(700);
  const plan=buildSemanticPlan(tf,req);
  expect(plan.chunks.length).toBeGreaterThan(2);
  expect(plan.chunks.every(x=>x.text.length<=SEMANTIC_CHUNK_SIZE)).toBe(true);
  expect(plan.chunks.filter(x=>x.source==="TF").map(x=>x.text).join("")).toBe(tf);
  expect(plan.chunks.filter(x=>x.source==="REQ").map(x=>x.text).join("")).toBe(req);
  expect(plan.chunks[0].id).toBe("TF-001");
 });
 it("recusa citações não presentes, preservando apenas evidência textual exata",()=>{
  const plan=buildSemanticPlan("RF-91: Não permitir cancelar uma NF com pagamento conciliado.");
  const chunk=plan.chunks[0];
  const result=validateSemanticFacts(chunk,[
   {category:"regra",quote:"Não permitir cancelar uma NF com pagamento conciliado.",
    summary:"Bloqueio de cancelamento em conciliação."},
   {category:"regra",quote:"A nota pode ser cancelada sem restrições.",
    summary:"Alucinação"},
   {category:"qualquer",quote:"RF-91: Não permitir cancelar uma NF com pagamento conciliado."}
  ]);
  expect(result.facts).toHaveLength(1);
  expect(result.unverified).toBe(2);
  expect(result.facts[0].chunkId).toBe("TF-001");
  expect(result.facts[0].line).toBe(1);
 });
 it("identifica requisitos descobertos, mas não cobertos no resumo",()=>{
  const input="RF-1: Pedido faturado. \nRF-2: Não remover desconto negativo.\nRF-3: Não alterar saldo.";
  const plan=buildSemanticPlan(input);
  const chunk=plan.chunks[0];
  const v=validateSemanticFacts(chunk,[
   {category:"regra",quote:"RF-2: Não remover desconto negativo.",summary:"Regra de desconto."}
  ]);
  const outcome=new Map<string,ChunkOutcome>([["TF-001",{
   id:"TF-001",facts:v.facts,unverified:v.unverified,model:"teste"
  }]]);
  const compiled=compileSemanticContext(plan,outcome,"teste");
  expect(compiled.coverage.requirementIds).toEqual(["RF1","RF2","RF3"]);
  expect(compiled.coverage.coveredIds).toEqual(["RF2"]);
  expect(compiled.coverage.missingIds).toEqual(["RF1","RF3"]);
  expect(compiled.task).toContain("[TF-L2; regra]");
  expect(compiled.task).not.toContain("RF-1: Pedido faturado");
 });
 it("mantém orçamento independente e contabiliza fatos fora do orçamento",()=>{
  const tf="TF-5: Regras da venda. "+("X".repeat(150)+"\n").repeat(350);
  const req="RF-5: Não alterar status. "+("Y".repeat(150)+"\n").repeat(190);
  const plan=buildSemanticPlan(tf,req);
  const outcomes=new Map<string,ChunkOutcome>();
  for(const chunk of plan.chunks){
   const quotes=[...chunk.text.matchAll(/.{10,130}/g)]
    .slice(0,25).map(match=>({category:"regra" as const,quote:match[0],summary:"Regra."}));
   const result=validateSemanticFacts(chunk,quotes);
   outcomes.set(chunk.id,{id:chunk.id,facts:result.facts,unverified:0,model:"teste"});
  }
  const compiled=compileSemanticContext(plan,outcomes,"teste");
  expect(compiled.task.length).toBeLessThanOrEqual(30000);
  expect(compiled.requirements.length).toBeLessThanOrEqual(20000);
  expect(compiled.coverage.analyzedChunks).toBe(plan.chunks.length);
  expect(compiled.coverage.selectedFacts).toBeGreaterThan(0);
 });
 it("acusa partes sem evidências, mas não as inventa",()=>{
  const plan=buildSemanticPlan("## TF\nNão executar devolução sem NF de origem.");
  const outcome=new Map<string,ChunkOutcome>([["TF-001",{
   id:"TF-001",facts:[],unverified:3,model:"teste"
  }]]);
  const compiled=compileSemanticContext(plan,outcome,"post");
  expect(compiled.coverage.failedChunks).toBe(1);
  expect(compiled.coverage.unverifiedQuotes).toBe(3);
  expect(compiled.coverage.selectedFacts).toBe(0);
 });
 it("bloqueia fonte fora do limite em vez de truncar silenciosamente",()=>{
  expect(()=>buildSemanticPlan("r".repeat(250001))).toThrow(/extensa demais/);
 });
});
