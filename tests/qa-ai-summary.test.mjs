import assert from "node:assert/strict";
import {test} from "node:test";
import {
  diagramSummaryMessages,extractDiagramSummary
} from "../supabase/functions/qa-ai/summary.mjs";
import {diagramMessages} from "../supabase/functions/qa-ai/diagram.mjs";

test("instrução do resumo distingue evidência confirmada de comportamento esperado",()=>{
 const messages=diagramSummaryMessages(
   "S1 reprovado: desconto não removido. S2 aprovado: cálculo revisado.");
 assert.equal(messages[0].role,"system");
 assert.match(messages[0].content,/REPROVADO/);
 assert.match(messages[0].content,/BLOQUEADO/);
 assert.match(messages[0].content,/PENDENTE/);
 assert.match(messages[1].content,/S1 reprovado/);
});
test("rejeita resposta incompleta e extrai resumo estruturado",()=>{
 assert.equal(extractDiagramSummary({choices:[{
  finish_reason:"length",message:{content:"Resumo incompleto que não deve ser usado"}
 }]}),null);
 assert.equal(extractDiagramSummary({choices:[{
  finish_reason:"stop",message:{content:"texto curto"}
 }]}),null);
 const full="FUNCIONALIDADES: regras de desconto. FALHAS: desconto não recalculado.";
 assert.equal(extractDiagramSummary({choices:[{
  finish_reason:"stop",message:{content:full}
 }]}),full);
});
test("prompt de diagrama representa os diferentes resultados",()=>{
 const messages=diagramMessages("30 cenários, alguns reprovados e pendentes");
 assert.match(messages[0].content,/24 nós/);
 assert.match(messages[0].content,/reprovad/i);
 assert.match(messages[1].content,/30 cenários/);
});
