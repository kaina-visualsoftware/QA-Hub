import test from "node:test";
import assert from "node:assert/strict";
import {findEvidence,verifyGrounding,unsupportedIdentifiers,evidenceKey}
 from "../supabase/functions/qa-ai/grounding.mjs";

test("F5 exact quote works with accents, spacing, case and honest line numbers",()=>{
 const source="Resumo inicial.\nANÁLISE DE VIABILIDADE:\nO pedido 67866 contém desconto negativo.\nConclusão.";
 const found=findEvidence(source,"O   PEDIDO 67866 contem desconto negativo.");
 assert.equal(found?.line,3);
 assert.equal(verifyGrounding(source,"Desconto negativo no pedido 67866.",
  "O pedido 67866 contém desconto negativo.").status,"verified");
 assert.equal(findEvidence(source,"Essa correção foi realizada"),null);
 assert.equal(evidenceKey("Não  HAVERÁ   DUPLICAÇÃO"),"nao havera duplicacao");
});
test("F5 multiline quote tracks start line, including UTF-8, without made-up lines",()=>{
 const source="Abertura 🧪\nRegra A:\nVersão 12.08.09.0000.\nO valor não deve mudar.";
 const quote="Regra A: Versao 12.08.09.0000. O valor não deve mudar.";
 const result=findEvidence(source,quote);
 assert.equal(result?.line,2);
 assert.equal(verifyGrounding(source,"Versão 12.08.09.0000 não muda.",quote).status,"verified");
});
test("F5 rejects quote invented by model and ungrounded numeric identifiers",()=>{
 const source="O pedido 67866 está bloqueado. A versão é 12.08.09.0000.";
 assert.equal(verifyGrounding(source,"Pedido 12345","Essa regra não existe").reason,"quote_not_found");
 assert.equal(verifyGrounding(source,"Pedido 12345",
  "O pedido 67866 está bloqueado.").reason,"identifier_not_in_source");
 assert.ok(unsupportedIdentifiers("Pedido 67867",source).some(id=>id.includes("67867")));
 assert.equal(verifyGrounding(source,"Pedido 67866",
  "O pedido 67866 está bloqueado.").status,"verified");
});
test("F5 unrelated quote cannot support an invented prose claim",()=>{
 const source="A máscara de telefone do estrangeiro usa código de área.";
 assert.equal(verifyGrounding(source,"Corrigir desconto indevido",
  "A máscara de telefone do estrangeiro usa código de área.").reason,
  "claim_not_supported_by_quote");
});
test("F5 short or malicious model citations do not count as verified",()=>{
 const source="O sistema deve registrar cada venda válida em Contas a Receber.";
 assert.equal(findEvidence(source,"O sistema"),null);
 assert.equal(verifyGrounding(source,"javascript:alert(1)",
  "O sistema deve registrar cada venda válida").status,"needs_review");
 assert.equal(findEvidence(source,""),null);
});
test("F5 multi-line evidence with whitespace and emoji remains anchored",()=>{
 const source="RF-10: Registrar o pedido.\n    🧪 Validar retorno esperado.";
 const found=findEvidence(source,"RF-10: Registrar o pedido. 🧪 Validar retorno esperado.");
 assert.equal(found?.line,1);
});

test("F8 golden guard rejects falsely approved test from pending source",()=>{
 const source="Observação: teste ainda não executado.";
 const evidence="Observação: teste ainda não executado.";
 assert.equal(verifyGrounding(source,"Teste aprovado",evidence).reason,
  "execution_not_proven");
 assert.equal(verifyGrounding(source,"Teste ainda não executado",evidence).status,
  "verified");
});
