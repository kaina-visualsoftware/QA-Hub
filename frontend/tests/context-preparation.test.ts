import {describe,expect,it} from "vitest";
import {prepareGeneratorContext,prepareQaContext} from "../src/features/generators/context-preparation";
import {estimateContextTokens} from "../src/lib/token-budget";

describe("compactador de contexto: pré-processamento seguro e auditável",()=>{
 it("mantém o texto curto exatamente como chegou, inclusive SQL e resultados negativos",()=>{
  const source="REQUISITO RF-108:\nSELECT * FROM clientes;\nNão permitir baixar pedidos cancelados.";
  const result=prepareQaContext(source,{limit:30000});
  expect(result.mode).toBe("integral");
  expect(result.text).toBe(source);
  expect(result.omittedLines).toBe(0);
  expect(result.needsReview).toBe(false);
 });
 it("remove apenas espaçamentos excessivos antes de selecionar trechos",()=>{
  const source="Critérios e condições de aceite detalhados\n\n\n\n"+
   "A alteração da API não deve afetar o Brasil. ".repeat(22);
  const result=prepareQaContext(source,{limit:1034});
  expect(result.mode).toBe("normalizado");
  expect(result.omittedLines).toBe(0);
  expect(result.needsReview).toBe(false);
 });
 it("mantém regras, negações, identificadores e títulos de cenários em contexto extenso",()=>{
  const source=[
   "TF 67866 - Pedido com desconto negativo",
   "## Problema identificado",
   "Não remover desconto negativo no pedido R$ 5.346,67.",
   ...Array.from({length:700},(_,i)=>"Log informativo "+i+" - "+("ocorrência repetitiva sem efeito de negócio. ").repeat(4)),
   "## Análise de viabilidade",
   "A rotina antiga ignorava percentuais menores que zero.",
   "## Correção",
   "A remoção passou a considerar descontos negativos dos kits.",
   "CENÁRIO 1 — Remover desconto negativo",
   "Resultado esperado: campo desconto igual a R$ 0,00.",
   "REQUISITO RF-334: não alterar descontos em outras condições."
  ].join("\n");
  const result=prepareQaContext(source,{limit:7000});
  expect(result.mode).toBe("extrativo");
  expect(result.needsReview).toBe(true);
  expect(result.text).toContain("RF-334");
  expect(result.text).toContain("CENÁRIO 1");
  expect(result.text).toContain("Não remover desconto negativo");
  expect(result.text).toMatch(/Correção|remoção passou/);
  expect(result.sentChars).toBeLessThanOrEqual(7000);
  expect(result.omittedLines).toBeGreaterThan(0);
  expect(result.originalChars).toBe(source.length);
  expect(result.text).toMatch(/\[L\d+\]/);
  expect(result.text).toContain("Trechos não selecionados NÃO foram analisados");
 });
 it("expõe omissões potencialmente relevantes em vez de alegar cobertura completa",()=>{
  const source=Array.from({length:700},(_,i)=>
    "REQUISITO RF-"+i+": O desconto do item "+i+
    " não deve ser removido quando a condição "+i+" estiver bloqueada.").join("\n");
  const result=prepareQaContext(source,{limit:2000});
  expect(result.criticalOmissions).toBeGreaterThan(0);
  expect(result.needsReview).toBe(true);
  expect(result.text).toContain("omissões potencialmente relevantes");
 });
 it("não remove silenciosamente linhas curtas repetidas em cenários diferentes",()=>{
  const source="Resultado esperado:\nPedido aprovado.\nResultado esperado:\nPedido cancelado.";
  const result=prepareQaContext(source,{limit:30000});
  expect(result.text).toBe(source);
  expect(result.duplicatedLines).toBe(0);
 });
 it("mantém orçamentos independentes para TF e requisitos",()=>{
  const report="## Problema\n"+("Falha no desconto do pedido. ").repeat(2500);
  const requirements="## RF\n"+("Não deve alterar o saldo em devolução. ").repeat(2000);
  const result=prepareGeneratorContext(report,requirements);
  expect(result.task.sentChars).toBeLessThanOrEqual(30000);
  expect(result.requirements?.sentChars).toBeLessThanOrEqual(20000);
  expect(result.task.needsReview).toBe(true);
  expect(result.requirements?.needsReview).toBe(true);
 });
 it("prioriza blocos funcionais e expõe cobertura por seção mesmo com milhares de logs",()=>{
  const source=[
   "## Problema identificado","O saldo da venda não é atualizado.",
   "## Logs de depuração",
   ...Array.from({length:1200},(_,i)=>"INFO 2026-11-11 "+i+" Consulta técnica sem alteração. "+("ruído repetitivo ").repeat(6)),
   "## Análise de viabilidade","A rotina antiga ignorava saldo negativo.",
   "## Correção","O cálculo passou a considerar valores negativos.",
   "## Cenários de teste","Cenário 1: Conferir baixa bancária.",
   "Passos: Abrir venda, gerar baixa e consultar conta corrente.",
   "Resultado esperado: O saldo deve ser atualizado.",
   "## Requisitos","RF-902: A conciliação não pode duplicar a baixa."
  ].join("\n");
  const result=prepareQaContext(source,{limit:5500});
  expect(result.text).toContain("RF-902");
  expect(result.text).toContain("Cenário 1");
  expect(result.text).toContain("A rotina antiga ignorava saldo negativo");
  expect(result.text).toContain("O cálculo passou a considerar valores negativos");
  expect(result.topics?.some(topic=>topic.label==="Correção e implementação"&&topic.selected>0)).toBe(true);
  expect(result.findings?.some(f=>f.label==="Correção e implementação"&&f.excerpt.includes("cálculo passou"))).toBe(true);
  expect(result.findings?.every(f=>f.line>0)).toBe(true);
  expect(result.topics?.some(topic=>topic.label==="Outras informações"&&topic.total>topic.selected)).toBe(true);
  expect(result.text.length).toBeLessThanOrEqual(5500);
 });
 it("F3: sinaliza excesso de orçamento estimado mesmo quando cabe em caracteres",()=>{
  const text="RF-424: " + "🧪".repeat(3000) + " Não alterar descontos sem permissão.";
  const result=prepareQaContext(text,{limit:30000,tokenLimit:900});
  expect(result.originalChars).toBeLessThan(30000);
  expect(estimateContextTokens(text)).toBeGreaterThan(900);
  expect(result.needsReview).toBe(true);
  expect(result.mode).toBe("extrativo");
  expect(result.sentEstimatedTokens).toBeLessThanOrEqual(900);
  expect(result.originalEstimatedTokens).toBeGreaterThan(result.sentEstimatedTokens);
 });
 it("F3: mantém dados críticos sem confundir orçamento estimado com tokens oficiais",()=>{
  const text=["## Requisitos","RF-301: Não faturar quando bloqueado.",
   ...Array.from({length:100},(_,i)=>"Log "+i+" detalhes operacionais sem relevância."),
   "## Resultado esperado","Não duplicar a baixa bancária."]
   .join("\n");
  const result=prepareQaContext(text,{limit:2500,tokenLimit:700});
  expect(result.needsReview).toBe(true);
  expect(result.text).toContain("RF-301");
  expect(result.sentEstimatedTokens).toBeLessThanOrEqual(result.tokenBudget);
 });
 it("rejeita contextos acima da salvaguarda sem cortar",()=>{
  expect(()=>prepareQaContext("x".repeat(2000001),{limit:30000}))
   .toThrow(/2 milhões/);
 });
});
