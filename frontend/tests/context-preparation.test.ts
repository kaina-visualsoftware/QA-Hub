import {describe,expect,it} from "vitest";
import {prepareGeneratorContext,prepareQaContext} from "../src/features/generators/context-preparation";

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
 it("rejeita contextos acima da salvaguarda sem cortar",()=>{
  expect(()=>prepareQaContext("x".repeat(2000001),{limit:30000}))
   .toThrow(/2 milhões/);
 });
});
