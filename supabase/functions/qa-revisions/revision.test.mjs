import test from "node:test";
import assert from "node:assert/strict";
import {validateRevisionInput,revisionMessages,normalizeRevision} from "./revision.mjs";
const base={operation:"post_excerpt",format:"bbcode",
 task:"TF 77881: Não reaplicar a taxa no boleto.",
 requirements:"RF-12: Valor deve ser zero.",
 current:"[b]Anteriormente:[/b] Taxa aplicada duas vezes.",
 instructions:"Deixar mais objetivo."};
test("rejects oversized, invalid and incomplete revision requests",()=>{
 assert.equal(validateRevisionInput({...base,current:"pequeno"}),null);
 assert.equal(validateRevisionInput({...base,task:"x".repeat(30001)}),null);
 assert.equal(validateRevisionInput({...base,instructions:"x".repeat(1201)}),null);
 assert.equal(validateRevisionInput({...base,operation:"test_case"}),null);
 assert.equal(validateRevisionInput(base)?.format,"bbcode");
});
test("prompt requests one selected snippet, never overwrite full document",()=>{
 const msgs=revisionMessages(base);
 assert.match(msgs[0].content,/ÚNICO TRECHO/);
 assert.match(msgs[0].content,/bbcode/);
 assert.match(msgs[0].content,/Nunca invente resultados/);
 assert.ok(msgs[1].content.includes(base.current));
 assert.ok(msgs[1].content.includes(base.requirements));
});
test("a single test case must be parsable Markdown without results invented",()=>{
 const input={...base,operation:"test_case",format:"markdown"};
 assert.ok(validateRevisionInput(input));
 const msgs=revisionMessages(input);
 assert.match(msgs[0].content,/Nunca afirme que o teste já foi executado/);
 const response="## Cenário — Permissões\n### Cenário\nVerificar.\n### Passos\n1. Abrir\n### Resultado esperado\nAcesso negado.";
 assert.equal(normalizeRevision({choices:[{message:{content:response}}]},"test_case"),response);
 assert.equal(normalizeRevision({choices:[{message:{content:"**Recebido**"}}]},"test_case"),null);
});
test("rejects empty, dangerous or oversized drafts",()=>{
 assert.equal(normalizeRevision({choices:[{message:{content:""}}]},"post_excerpt"),null);
 assert.equal(normalizeRevision({choices:[{message:{content:"<script>alert(1)</script>"}}]},"post_excerpt"),null);
 assert.equal(normalizeRevision({choices:[{message:{content:"x".repeat(13001)}}]},"post_excerpt"),null);
});
