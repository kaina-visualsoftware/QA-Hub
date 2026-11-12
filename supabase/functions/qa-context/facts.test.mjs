import test from "node:test";
import assert from "node:assert/strict";
import {parseModelFacts,semanticMessages} from "./facts.mjs";

test("only quote from exact source is accepted",()=>{
 const source="RF-912: Não aplicar uma taxa adicional quando a NF estiver cancelada.";
 const payload={choices:[{message:{content:JSON.stringify({facts:[
  {category:"regra",quote:"Não aplicar uma taxa adicional quando a NF estiver cancelada.",
   summary:"Taxa adicional não deve ser aplicada."},
  {category:"regra",quote:"É possível aplicar taxas em qualquer situação.",
   summary:"Fato não presente."}
 ]})}}]};
 const result=parseModelFacts(payload,source);
 assert.equal(result.valid,true);
 assert.equal(result.facts.length,1);
 assert.equal(result.unverified,1);
 assert.match(result.facts[0].quote,/Não aplicar/);
});
test("reject unknown categories and outputs that are not structured",()=>{
 const source="Somente gerentes podem editar a permissão. O usuário comum não pode.";
 assert.equal(parseModelFacts({choices:[{message:{content:"isto não é JSON"}}]},source).valid,false);
 const result=parseModelFacts({choices:[{message:{content:JSON.stringify({facts:[
  {category:"execucao",quote:"Somente gerentes podem editar a permissão.",summary:"Acabou"}
 ]})}}]},source);
 assert.equal(result.facts.length,0);
 assert.equal(result.unverified,1);
});
test("accept fenced JSON and preserve exact audit quotes",()=>{
 const source="RF-43: Critério de aceite: total é R$ 1.250,00.";
 const model={choices:[{message:{content:
  String.fromCharCode(96).repeat(3)+"json\n"+
  JSON.stringify({facts:[{category:"aceite",quote:source,summary:"Total correto."}]})+
  "\n"+String.fromCharCode(96).repeat(3)}}]};
 assert.equal(parseModelFacts(model,source).facts[0].quote,source);
});
test("separate post/test goals promote different QA facts without treating data as instructions",()=>{
 const text="TESTE: não permitir editar documento com o cadastro bloqueado.";
 const a=semanticMessages("post","TF","TF-001",text);
 const b=semanticMessages("teste","TF","TF-001",text);
 assert.match(a[0].content,/comportamento ANTERIOR e POSTERIOR/);
 assert.match(b[0].content,/pré-condições/);
 assert.match(a[0].content,/nunca instrução/);
 assert.match(a[1].content,/TESTE: não permitir/);
});

test("timeout retry remains exclusively NVIDIA with shorter exact-source evidence",()=>{
 const source="Revisão final: pedido mínimo = TotalVale / (percentual/100).";
 const standard=semanticMessages("teste","TF","TF-017",source);
 const compact=semanticMessages("teste","TF","TF-017",source,{compact:true});
 assert.match(standard[0].content,/até 12 fatos distintos/);
 assert.match(compact[0].content,/NO MÁXIMO 5 fatos/);
 assert.match(compact[0].content,/SUBSTRING LITERAL e EXATA/);
 assert.match(compact[0].content,/contraditórios/);
 assert.equal(compact[1].content.includes(source),true);
 assert.equal(compact[1].content.includes("TF-017"),true);
 const grounded=parseModelFacts({choices:[{message:{content:JSON.stringify({facts:[
  {category:"regra",quote:source,summary:"Decisão final extraída pela NVIDIA."},
  {category:"regra",quote:"Fórmula sem divisão.",summary:"Invenção."}
 ]})}}]},source);
 assert.deepEqual(grounded.facts.map(x=>x.quote),[source]);
 assert.equal(grounded.unverified,1);
});

test("standard profile preserves 12 NVIDIA evidence slots and exact quotes while limiting redundant summary text",()=>{
 const source="RF-12: O pedido não pode ser faturado sem aprovação do gerente.";
 const messages=semanticMessages("teste","TF","TF-001",source);
 assert.match(messages[0].content,/até 12 fatos distintos/);
 assert.match(messages[0].content,/entre 10 e 450 caracteres/);
 assert.match(messages[0].content,/até 100 caracteres/);
 assert.match(messages[0].content,/sem repetir quote/);
 assert.match(messages[1].content,/O pedido não pode ser faturado/);
});
