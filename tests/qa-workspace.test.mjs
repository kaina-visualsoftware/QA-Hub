import test from 'node:test';
import assert from 'node:assert/strict';
import {taskToGeneratorText,parseGeneratedCases,markScenarioDuplicates,validateReviewedCases,attachReviewedCases,formatNumberedCaseSteps,hasCompleteGeneratedCase} from '../qa-workspace.mjs';

const markdown = `# ROTEIRO
## Objetivo
Validar pedido.
## Cenário 01 — Abrir pedido
### Cenário
Abrir a tela.
### Passos
1. Acessar Vendas.
2. Abrir pedido.
### Resultado esperado
- Pedido aberto.
---
## Cenário 02 — Editar pedido
### Passos
1. Alterar quantidade.
### Resultado esperado
- Valor recalculado.
## Pontos de atenção
Verifique a integração.`;

test('parses scenario headings and fields, never inferring a passed state',()=>{
 const parsed=parseGeneratedCases(markdown);
 assert.equal(parsed.length,2);
 assert.equal(parsed[0].titulo,'Abrir pedido');
 assert.match(parsed[0].passos,/2. Abrir pedido/);
 assert.equal(parsed[0].esperado,'- Pedido aberto.');
 assert.equal(parsed[0].observacoes,'Objetivo:\nAbrir a tela.');
 assert.equal(parsed[1].titulo,'Editar pedido');
 assert.ok(parsed.every(x=>x.selected));
 assert.ok(parsed.every(x=>!('status' in x)));
});
test('duplicate matching is content based and keeps distinct expectations',()=>{
 const parsed=parseGeneratedCases(markdown);
 const marked=markScenarioDuplicates([...parsed,{...parsed[0],source_index:3}],[parsed[0]]);
 assert.deepEqual(marked.map(x=>x.duplicate),[true,false,true]);
 assert.deepEqual(marked.map(x=>x.selected),[false,true,false]);
 const changed=markScenarioDuplicates([{...parsed[0],esperado:'Erro esperado'}],[parsed[0]]);
 assert.equal(changed[0].duplicate,false);
});
test('TF prompt excludes potentially sensitive detail fields',()=>{
 const text=taskToGeneratorText({codigo:'67866',titulo:'Pedido',descricao:'Verificar saldo',sistema:'Vendas',
  base_teste:'base-secreta',empresa:'Cliente privado',observacoes:'senha não compartilhar',conclusao:'Notas pessoais'});
 assert.match(text,/67866/);
 assert.match(text,/Verificar saldo/);
 assert.doesNotMatch(text,/base-secreta|Cliente privado|senha não compartilhar|Notas pessoais/);
});
test('validate reviewed fields before touching storage',async()=>{
 const parsed=parseGeneratedCases(markdown);
 const valid=validateReviewedCases(parsed);
 assert.equal(valid.length,2);
 assert.equal(valid[0].source_index,'1');
 assert.throws(()=>validateReviewedCases([{titulo:'Título válido',passos:'',esperado:'sim'}]),/passos/);
 assert.throws(()=>validateReviewedCases(Array.from({length:101},()=>parsed[0])),/100 casos/);
 let call;
 const client={async rpc(method,payload){call={method,payload};return {data:{inserted:2,skipped:0},error:null}}};
 const id='11111111-1111-4111-8111-111111111111',gen='22222222-2222-4222-8222-222222222222';
 const result=await attachReviewedCases(client,{taskId:id,generationId:gen,items:parsed});
 assert.equal(result.inserted,2);
 assert.equal(call.method,'qa_attach_generated_cases');
 assert.equal(call.payload.p_tarefa_id,id);
 assert.deepEqual(call.payload.p_itens,valid);
});

test('numbered steps gain line breaks without modifying dates or technical version identifiers',()=>{
 const input='1. Abrir o MyExportNFe. 2. Verificar o campo Mês/Ano 12.08.07.0000. 3. Enviar ao contador.';
 assert.equal(formatNumberedCaseSteps(input),
  '1. Abrir o MyExportNFe.\n2. Verificar o campo Mês/Ano 12.08.07.0000.\n3. Enviar ao contador.');
 assert.equal(formatNumberedCaseSteps('1. Abrir.\n2. Conferir.'),'1. Abrir.\n2. Conferir.');
 assert.equal(formatNumberedCaseSteps('Versão 12.08.07.0000. Acessar pedido.'),
  'Versão 12.08.07.0000. Acessar pedido.');
 assert.equal(formatNumberedCaseSteps('Verificar status 2. Em build.'),'Verificar status 2. Em build.');
});
test('case completeness excludes missing and placeholder-only steps or expected results',()=>{
 const base={titulo:'Envio ao contador',passos:'1. Abrir a tela.',
  esperado:'Envio efetuado.',observacoes:'',selected:true};
 assert.equal(hasCompleteGeneratedCase(base),true);
 for(const item of [
  {...base,passos:''},
  {...base,esperado:' '},
  {...base,passos:'1. [A confirmar]\n2. A confirmar'},
  {...base,esperado:'[A confirmar]'},
  {...base,esperado:'—'},
  {...base,titulo:'  '}
 ])assert.equal(hasCompleteGeneratedCase(item),false,JSON.stringify(item));
 assert.equal(hasCompleteGeneratedCase({...base,esperado:'Não permite o envio sem contador.'}),true);
});
test('parser accepts minor heading variations and formats inline numbered steps',()=>{
 const parsed=parseGeneratedCases([
  '## Cenário 6 — Impedir envio sem contabilista',
  '### **Passos:**',
  '1. Abrir o MyExportNFe. 2. Verificar o bloqueio.',
  '### Resultado esperado:',
  'O envio deve ser bloqueado.'
 ].join('\n'));
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].passos,'1. Abrir o MyExportNFe.\n2. Verificar o bloqueio.');
 assert.equal(parsed[0].esperado,'O envio deve ser bloqueado.');
 assert.equal(hasCompleteGeneratedCase(parsed[0]),true);
});
