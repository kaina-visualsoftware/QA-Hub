import test from 'node:test';
import assert from 'node:assert/strict';
import {extractLocalDraft,normalizeDraft,extractWithBrowserAI} from '../qa-assistant.mjs';

test('freeform QA notes populate explicitly stated metadata, never invent status',()=>{
 const result=extractLocalDraft(`TF 67866 — Promoção por tabela de preço
Versão: 12.08.08.0000
TIPO DE TESTE: RELEASE
EMPRESA: Exemplo QA
O QUE FOI TESTADO:
Inclusão automática de produtos por tabela.
QUAL É O PROBLEMA IDENTIFICADO?
Ao remover desconto, o valor permanecia inalterado.
O QUE O DESENVOLVEDOR ALTEROU?
Ajustou o cálculo da remoção do desconto.
CONCLUSÃO:
Aguardando homologação.`);
 assert.equal(result.fields.codigo,'67866');
 assert.equal(result.fields.tipo_teste,'RELEASE');
 assert.equal(result.fields.versao,'12.08.08.0000');
 assert.match(result.fields.causa,/valor permanecia/);
 assert.match(result.fields.correcao,/Ajustou o cálculo/);
 assert.equal(result.fields.status,undefined);
 assert.equal(result.cenarios.length,0);
});
test('structured QA report produces staged not-executed scenarios',()=>{
 const result=extractLocalDraft(`TIPO DE TESTE:
[X] BUILD [ ] RELEASE
O QUE FOI TESTADO:
Validação do fluxo de pedidos.
CENÁRIOS TESTADOS:
CENÁRIO 1 - Inclusão de produto
- Aberta a tela
- Produto incluído
CENÁRIO 2 - Produto duplicado
- Repetida a inclusão
CONCLUSÃO:
Aguardando revisão.`);
 assert.equal(result.fields.tipo_teste,'BUILD');
 assert.equal(result.cenarios.length,2);
 assert.equal(result.cenarios[0].status,'nao_executado');
 assert.match(result.cenarios[1].titulo,/Produto duplicado/);
});
test('arbitrary text can fill a draft without forcing approval',()=>{
 const result=extractLocalDraft('Na versão nova o desconto de cliente não aparece na tela de compras.');
 assert.match(result.fields.descricao,/desconto de cliente/);
 assert.equal(result.fields.status,undefined);
});
test('AI JSON is whitelisted and scenarios remain unexecuted',()=>{
 const result=normalizeDraft({
   titulo:'Validação de desconto',tipo_teste:'RELEASE',status:'aprovado',
   user_id:'fake-admin',cenarios:[{titulo:'Aplica desconto',status:'aprovado',passos:'Abrir compra'}]
 });
 assert.equal(result.fields.titulo,'Validação de desconto');
 assert.equal(result.fields.status,undefined);
 assert.equal(result.fields.user_id,undefined);
 assert.equal(result.cenarios[0].status,'nao_executado');
});
test('AI is never assumed available and errors are recoverable',async()=>{
 await assert.rejects(extractWithBrowserAI('Relatório',null),/não está disponível/);
 await assert.rejects(extractWithBrowserAI('Relatório',{availability:async()=> 'unavailable',create:async()=>{}}),/não é compatível/);
});
test('on-device AI response is schema-normalized with mocked model',async()=>{
 let destroyed=false;
 const model={
   availability:async()=> 'available',
   create:async()=>({prompt:async()=>JSON.stringify({titulo:'TF criada pela IA',tipo_teste:'BUILD',cenarios:[{titulo:'Teste um',passos:'Executar'}]}),destroy(){destroyed=true;}})
 };
 const result=await extractWithBrowserAI('Resumo do teste',model);
 assert.equal(result.fields.titulo,'TF criada pela IA');
 assert.equal(result.cenarios[0].status,'nao_executado');
 assert.equal(destroyed,true);
});
test('empty or excessively large text is rejected',()=>{
 assert.throws(()=>extractLocalDraft(''),/Cole o texto/);
 assert.throws(()=>extractLocalDraft('a'.repeat(30001)),/30.000/);
});
