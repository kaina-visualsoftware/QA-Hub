import test from 'node:test';
import assert from 'node:assert/strict';
import {composeFullTaskContext,fetchTaskSupport,sanitizeAiContext} from '../qa-test-context.mjs';
const tf='11111111-1111-4111-8111-111111111111',uid='22222222-2222-4222-8222-222222222222';
const task={id:tf,user_id:uid,titulo:'Desconto do pedido',codigo:'67866',tipo_teste:'BUILD',sistema:'Comercial',versao:'12.08',descricao:'Desconto não removido',causa:'Rateio de kit',correcao:'Tratamento de percentuais negativos'};
test('issue 31: complete task context includes exact approved fact sources',()=>{
 const result=composeFullTaskContext(task,{
  scenarios:[{tarefa_id:tf,titulo:'Remover desconto',passos:'1. Abrir pedido',esperado:'Saldo atualizado',status:'nao_executado'}],
  documents:[{tarefa_id:tf,titulo:'Análise',tipo:'relatorio',versao:1,conteudo:'Fluxo de descontos'}],
  evidence:[{tarefa_id:tf,tipo:'descricao',resumo:'Tela mostrou valor incorreto'}],
  events:[{tarefa_id:tf,acao:'cenario.criado',created_at:'2026-11-06'}]
 },{manual:'Dado de teste R$ 49,50'});
 for(const term of ['67866','Rateio de kit','percentuais negativos','Remover desconto','Saldo atualizado','Análise','Tela mostrou valor incorreto','cenario.criado','Dado de teste']){
  assert.ok(result.text.includes(term),term);
 }
 assert.match(result.text,/Situação real: nao_executado/);
 assert.doesNotMatch(result.text,/Status real: aprovado/);
 assert.equal(result.sourceCounts.scenarios,1);
});
test('issue 31: never copy sources belonging to another TF',()=>{
 const other='33333333-3333-4333-8333-333333333333';
 const result=composeFullTaskContext(task,{
  scenarios:[{tarefa_id:other,titulo:'Outro cliente',passos:'Senha 123'}],
  documents:[{tarefa_id:other,titulo:'Outro relatório',conteudo:'Segredo de outra TF'}]
 });
 assert.doesNotMatch(result.text,/Outro cliente|Segredo de outra TF/);
});
test('issue 31: credentials, personal IDs and email are redacted',()=>{
 const content=sanitizeAiContext('Senha: MinhaSenha123 token=abc1234, CPF 123.456.789-00, email foo@bar.com, Bearer abcdefghijklmnop');
 assert.doesNotMatch(content,/MinhaSenha123|abc1234|123\.456|foo@bar|abcdefghijklmnop/);
 assert.match(content,/OMITID/);
});
test('issue 31: missing facts, unreadable source and truncated document explicitly signaled',()=>{
 const data=composeFullTaskContext({...task,causa:'',correcao:''},{
  documents:[{tarefa_id:tf,titulo:'Longo',conteudo:'X'.repeat(7000)}],
  failures:['qa_evidencias: sem conexão']
 });
 assert.match(data.text,/A confirmar:/);
 assert.match(data.text,/OMITIDOS 500 caracteres/);
 assert.match(data.text,/qa_evidencias: sem conexão/);
 assert.throws(()=>composeFullTaskContext(task,{}, {manual:'Z'.repeat(30001)}),/Nenhuma parte foi cortada/);
});
test('issue 31: failed optional source is non-fatal and owner is checked',async()=>{
 const calls=[];
 const db={from(table){
  calls.push(table);
  return {select(){return this},eq(field,id){assert.equal(field,'tarefa_id');assert.equal(id,tf);return this},
    order(){return this},async limit(){if(table==='qa_documentos')return {data:null,error:{message:'Indisponível'}};
      return {data:[{tarefa_id:tf,titulo:'Acessível'}],error:null}}
  };
 }};
 const result=await fetchTaskSupport(db,task,uid);
 assert.equal(result.failures.length,1);
 assert.equal(result.scenarios.length,1);
 assert.equal(calls.length,4);
 await assert.rejects(()=>fetchTaskSupport(db,task,'other'),/sem permissão/);
});
