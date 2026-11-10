import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNvidiaDraft} from '../supabase/functions/qa-ai/response.mjs';
import {extractWithNvidia} from '../qa-nvidia.mjs';

test('accepts JSON in a fenced Markdown block',()=>{
  const fence=String.fromCharCode(96).repeat(3);
  const response={choices:[{message:{content:'Campos extraídos:\n'+fence+'json\n{"codigo":"67866","titulo":"Desconto divergente","cenarios":[{"titulo":"Validar desconto","passos":["Abrir pedido","Consultar descontos"]}]}\n'+fence}}]};
  const draft=parseNvidiaDraft(response);
  assert.equal(draft.codigo,'67866');
  assert.equal(draft.titulo,'Desconto divergente');
  assert.equal(draft.cenarios[0].passos,'Abrir pedido\nConsultar descontos');
});

test('recognizes nested objects and localized field names',()=>{
  const response={choices:[{message:{content:JSON.stringify({
    tarefa:{'Título':'Valor divergente','O que foi testado':'Desconto do pedido','Causa raiz':'Rateio do kit','Versão':'12.08.08.0000'},
    'Cenários testados':[{'Título':'Primeiro cenário','Etapas':['Abrir a venda','Validar o pedido'],'Resultado esperado':'O desconto é removido'}]
  })}}]};
  const draft=parseNvidiaDraft(response);
  assert.equal(draft.titulo,'Valor divergente');
  assert.equal(draft.descricao,'Desconto do pedido');
  assert.equal(draft.causa,'Rateio do kit');
  assert.equal(draft.versao,'12.08.08.0000');
  assert.equal(draft.cenarios.length,1);
  assert.match(draft.cenarios[0].passos,/Abrir a venda/);
});

test('repairs trailing commas, unquoted keys, and single-quoted values',()=>{
  const response={choices:[{message:{content:"Aqui está: {titulo: 'Teste de pedido', descricao: 'Verificar cadastro', cenarios: [],}"}}]};
  const draft=parseNvidiaDraft(response);
  assert.equal(draft.titulo,'Teste de pedido');
  assert.equal(draft.descricao,'Verificar cadastro');
});

test('accepts headings and prose instead of JSON',()=>{
  const response={choices:[{message:{content:'Título: Inclusão de itens\nDescrição: Validar o cadastro\nCausa: Falha de sincronização\nCorreção: Alterar rotina de persistência'}}]};
  const draft=parseNvidiaDraft(response);
  assert.equal(draft.titulo,'Inclusão de itens');
  assert.equal(draft.descricao,'Validar o cadastro');
  assert.equal(draft.causa,'Falha de sincronização');
  assert.equal(draft.correcao,'Alterar rotina de persistência');
});

test('ignores unauthorized fields, approval and returned status',()=>{
  const response={choices:[{message:{content:JSON.stringify({
    titulo:'Teste',user_id:'admin',status:'aprovado',
    cenarios:[{titulo:'Rodar teste',status:'aprovado',passos:'Abrir menu'}]
  })}}]};
  const draft=parseNvidiaDraft(response);
  assert.equal(draft.user_id,undefined);
  assert.equal(draft.status,undefined);
  assert.equal(draft.cenarios[0].status,undefined);
});

test('recovers tool-call JSON and array content',()=>{
  const msg={choices:[{message:{content:null,tool_calls:[{function:{arguments:'{"titulo":"Via function call"}'}}]}}]};
  assert.equal(parseNvidiaDraft(msg).titulo,'Via function call');
  const parts={choices:[{message:{content:[{type:'text',text:'{"titulo":"Via content part"}'}]}}]};
  assert.equal(parseNvidiaDraft(parts).titulo,'Via content part');
});

test('returns null safely for unusable or incomplete responses',()=>{
  assert.equal(parseNvidiaDraft({choices:[{message:{content:''},finish_reason:'length'}]}),null);
  const partial={choices:[{message:{content:'JSON parcial: {"titulo":'}}]};
  assert.equal(parseNvidiaDraft(partial),null);
  assert.equal(parseNvidiaDraft({choices:[{message:{content:'<think>Raciocínio</think>Não há dados reconhecíveis.'}}]}),null);
});

test('when NVIDIA reply has no structure the original QA text is extracted locally',async()=>{
  const fake={functions:{async invoke(){return {data:{draft:{},fallback:true,model:'Extração local'},error:null};}}};
  const result=await extractWithNvidia('TF 67866 — Teste de desconto\nO QUE FOI TESTADO:\nValidar desconto por pedido.',fake);
  assert.equal(result.fallback,true);
  assert.equal(result.draft.fields.codigo,'67866');
  assert.match(result.draft.fields.descricao,/Validar desconto/);
});

test('service temporary unavailable falls back but credential errors do not',async()=>{
  const service={functions:{async invoke(){return {data:null,error:{context:{async json(){return {error:'ai_temporarily_unavailable'};}}}};}}};
  const recovered=await extractWithNvidia('TF 67866 — Checagem.',service);
  assert.equal(recovered.fallback,true);
  const auth={functions:{async invoke(){return {data:null,error:{context:{async json(){return {error:'nvidia_key_invalid',message:'Chave inválida'};}}}};}}};
  await assert.rejects(extractWithNvidia('TF 67866 — Checagem.',auth),/Chave inválida/);
});


test('partial NVIDIA response maps requirement to description rather than root cause',()=>{
 const response={choices:[{message:{content:JSON.stringify({
  Requisito:'A baixa de uma venda deve atualizar o saldo da conta.',
  'Causa raiz':'Rotina ignora movimentos negativos.'
 })}}]};
 const draft=parseNvidiaDraft(response);
 assert.match(draft.descricao,/baixa de uma venda/);
 assert.match(draft.causa,/movimentos negativos/);
});

test('partial NVIDIA response maps problem description independently of analysis',()=>{
 const response={choices:[{message:{content:JSON.stringify({
  'Problema identificado':'O desconto não é removido ao clicar em X.',
  'Análise de viabilidade':'O rateio gravou um percentual negativo.'
 })}}]};
 const draft=parseNvidiaDraft(response);
 assert.match(draft.descricao,/desconto não é removido/);
 assert.match(draft.causa,/percentual negativo/);
});
