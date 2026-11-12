import test from "node:test";
import assert from "node:assert/strict";
import {SCENARIO_BATCH_SIZE,parseScenarioSeeds,taskFieldMessages,
 taskSeedMessages,taskScenarioMessages,parseTaskFields,parseTaskScenarioBatch}
 from "../supabase/functions/qa-ai/stages.mjs";

const seeds=[
 {source_index:0,titulo:"Remover desconto negativo",passos:"1. Abrir pedido 67866.",
  esperado:"O desconto some.",observacoes:"Dados sintéticos."},
 {source_index:1,titulo:"Verificar valor do kit",passos:"1. Abrir pedido 67867.",
  esperado:"Não mudar o valor.",observacoes:""}
];
const reply=(value,reason="stop")=>({choices:[{
 message:{content:JSON.stringify(value)},finish_reason:reason
}]});
test("F4 uses deterministic source indices, four scenarios per batch",()=>{
 assert.equal(SCENARIO_BATCH_SIZE,4);
 assert.deepEqual(parseScenarioSeeds(seeds),seeds);
 assert.equal(parseScenarioSeeds([...seeds,seeds[0]]),null);
 assert.equal(parseScenarioSeeds([{...seeds[0],source_index:999}]),null);
 assert.equal(parseScenarioSeeds([{...seeds[0],observacoes:"🧪".repeat(2000)}]),null);
});
test("fields prompt is small and prohibits invented causes and execution",()=>{
 const messages=taskFieldMessages("Somente RF-301: não alterar o saldo.");
 assert.equal(messages.length,2);
 assert.match(messages[0].content,/só quando documentadas/);
 assert.match(messages[0].content,/sem gerar cenários/);
 assert.match(messages[1].content,/RF-301/);
 assert.match(messages[0].content,/mesmo sem seções ou campos nomeados/);
 assert.match(messages[0].content,/derivation/);
 assert.match(messages[0].content,/Identificadores e metadados/);
 assert.ok(messages[0].content.length<3000);
});
test("F4 parses fields but not invented scenarios",()=>{
 const extracted=parseTaskFields(reply({titulo:"Corrigir descontos",
  descricao:"O desconto permanece.",cenarios:[{titulo:"Inventado"}]}));
 assert.equal(extracted.titulo,"Corrigir descontos");
 assert.equal(Object.hasOwn(extracted,"cenarios"),false);
 assert.equal(parseTaskFields(reply({cenarios:[{titulo:"Só teste"}]})),null);
 assert.equal(parseTaskFields(reply({titulo:"Truncado"},"length")),null);
});
test("batch prompt treats seeds as data and never requests new tests",()=>{
 const prompts=taskScenarioMessages("REQ-10",seeds);
 assert.match(prompts[0].content,/Não inclua novos cenários/);
 const user=JSON.parse(prompts[1].content);
 assert.equal(user.scenario_seeds.length,2);
 assert.equal(user.report_text,"REQ-10");
 assert.throws(()=>taskScenarioMessages("x",[]));
});
test("stage parser rejects invented IDs, duplicates and truncated JSON",()=>{
 const output=reply({cenarios:[
  {source_index:0,titulo:"Remover desconto",passos:"Abrir pedido",esperado:"Valor zerado"},
  {source_index:40,titulo:"Inventado",passos:"Novo teste",esperado:"OK"},
  {source_index:0,titulo:"Repetido",passos:"Repetido",esperado:"Repetido"}
 ]});
 const parsed=parseTaskScenarioBatch(output,seeds);
 assert.equal(parsed,null);
 assert.equal(parseTaskScenarioBatch(reply({cenarios:[
  {source_index:0,titulo:"Remover desconto",passos:"Abrir pedido",esperado:"Valor zerado"},
  {source_index:1,titulo:"Conferir kit",passos:"Abrir kit",esperado:"Valor igual"}
 ]}),seeds)?.length,2);
 assert.equal(parseTaskScenarioBatch(reply({cenarios:[]}),seeds),null);
 assert.equal(parseTaskScenarioBatch(reply({cenarios:[{
  source_index:0,titulo:"Somente um",passos:"Passo",esperado:"Resultado"
 }]}),seeds),null);
 assert.equal(parseTaskScenarioBatch(reply({cenarios:[{source_index:0}]},"length"),seeds),null);
});
test("unknown response properties cannot set execution status",()=>{
 const parsed=parseTaskScenarioBatch(reply({cenarios:[
  {source_index:0,titulo:"Remover desconto",passos:"Abrir pedido",esperado:"Valor zerado"},
  {source_index:1,titulo:"Conferir kit",passos:"Abrir pedido de exemplo",
   esperado:"Valor igual",token:"SECRET",status:"aprovado"}
 ]}),seeds);
 assert.deepEqual(Object.keys(parsed[1]).sort(),
  ["source_index","titulo","passos","esperado","observacoes"].sort());
});

test("task-seeds stage asks NVIDIA to identify only cited, documented scenarios",()=>{
 const source="CENÁRIO 1 — Conferir desconto\\nPassos: Abrir pedido\\nResultado esperado: Sem duplicação.";
 const prompt=taskSeedMessages(source);
 assert.equal(prompt.length,2);
 assert.match(prompt[0].content,/No máximo 20 cenários/);
 assert.match(prompt[0].content,/LITERALMENTE/);
 assert.match(prompt[0].content,/Não invente testes/);
 assert.match(prompt[1].content,/Conferir desconto/);
 assert.match(prompt[0].content,/seeds/);
});
