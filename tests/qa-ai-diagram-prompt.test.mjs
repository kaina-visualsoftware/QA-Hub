import test from "node:test";
import assert from "node:assert/strict";
import { diagramMessages, extractDiagramFromNvidia } from "../supabase/functions/qa-ai/diagram.mjs";

test("Mermaid generation prompt enforces minimal v12 grammar and data-only inputs", () => {
  const messages=diagramMessages("Pedido 67866: recalcular desconto.");
  const [system,user]=messages;
  assert.equal(system.role,"system");
  assert.match(system.content,/flowchart LR/);
  assert.match(system.content,/uma conexão por linha/i);
  assert.match(system.content,/IDs ASCII simples e únicos/);
  assert.match(system.content,/Não use subgraph, direction/);
  assert.match(system.content,/Não invente regras/i);
  assert.match(user.content,/Pedido 67866/);
  assert.doesNotMatch(user.content,/<ERRO>/);
});

test("Repair prompt includes rejected Mermaid and real parser diagnostics as DATA", () => {
  const invalid='flowchart LR\n A["Sem fechar"';
  const error='Parse error on line 2: Expecting SQE';
  const [system,user]=diagramMessages("Abrir pedido.", {mermaid:invalid,syntaxError:error});
  assert.match(system.content,/MODO CORREÇÃO/);
  assert.match(user.content,/<MERMAID>/);
  assert.match(user.content,/Sem fechar/);
  assert.match(user.content,/Expecting SQE/);
  assert.match(user.content,/Retorne apenas o fluxograma COMPLETO corrigido/);
});

test("Response extractor preserves code and normalizes direction without executing content", () => {
  assert.equal(extractDiagramFromNvidia({
    choices:[{message:{content:"```mermaid\nflowchart TD\n A[\"Abrir\"] --> B[\"Fim\"]\n```"}}]
  }), 'flowchart LR\n A["Abrir"] --> B["Fim"]');
  assert.equal(extractDiagramFromNvidia({
    choices:[{message:{content:"flowchart LR\n A --> B\n click A href \"javascript:alert(1)\""}}]
  }), null);
});
