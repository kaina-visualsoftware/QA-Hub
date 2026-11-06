import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRequirements,normalizeRequirement,prepareImport,requirementKey} from '../qa-requirements.mjs';

test('R1: explicit RF/RN and acceptance criteria are extracted without changing wording',()=>{
 const text=[
  'RF001: Ao remover um desconto, o total do pedido deve ser recalculado.',
  'Critérios de aceite:',
  '- O valor atualizado deve ser exibido.',
  '',
  'RN001: Impedir percentuais negativos não permitidos.'
 ].join('\n');
 const items=parseRequirements(text);
 assert.equal(items.length,2);
 assert.deepEqual(items.map(x=>x.codigo),['RF-001','RN-001']);
 assert.deepEqual(items.map(x=>x.tipo),['RF','RN']);
 assert.match(items[0].descricao,/Ao remover um desconto/);
 assert.match(items[0].criterios_aceite,/valor atualizado/);
 assert.equal(items[0].suggested,false);
 assert.equal(items[1].selected,true);
 assert.ok(items.every(x=>x.estado==='rascunho'),'Nothing should be approved automatically');
});
test('R1: unstructured text generates clearly suggested codes and titles',()=>{
 const items=parseRequirements('O operador pode alterar a coluna do grid por meio de um menu.');
 assert.equal(items.length,1);
 assert.equal(items[0].codigo,'RF-001');
 assert.equal(items[0].suggested,true);
 assert.match(items[0].descricao,/operador pode alterar/);
});
test('R1: duplicate codes and normalized descriptions are marked, not deleted',()=>{
 const existing=[{codigo:'RF-001',descricao:'A tela apresenta campos de desconto.',estado:'aprovado'}];
 const items=parseRequirements('RF001: A tela apresenta campos de desconto.\nRF002: Os campos são editáveis.',{existing});
 assert.equal(items.length,2);
 assert.equal(items[0].duplicate,true);
 assert.equal(items[0].selected,false);
 assert.equal(items[1].selected,true);
 assert.equal(requirementKey('Ação    rápida'),requirementKey('acao rapida'));
});
test('R1: preview permits edits but validates all imported requirements',()=>{
 const text='RF001: O desconto de um pedido é atualizado na interface.';
 const items=parseRequirements(text);
 items[0].estado='aprovado';
 const batch=prepareImport(text,items);
 assert.equal(batch.items[0].estado,'aprovado');
 assert.equal(batch.items[0].codigo,'RF-001');
 assert.equal(Object.hasOwn(batch.items[0],'selected'),false);
 assert.throws(()=>normalizeRequirement({...batch.items[0],codigo:'BAD-123'}),/Código inválido/);
 assert.throws(()=>normalizeRequirement({...batch.items[0],descricao:'curt'}),/Descrição precisa/);
 assert.throws(()=>prepareImport(text,items.map(x=>({...x,selected:false}))),/Selecione/);
});
test('R1: source size and item count are bounded',()=>{
 assert.throws(()=>parseRequirements('x'),/5 caracteres/);
 assert.throws(()=>parseRequirements('x'.repeat(30001)),/30.000/);
 assert.throws(()=>parseRequirements(Array.from({length:101},(_,i)=>'RF'+String(i+1).padStart(3,'0')+': Comportamento número '+(i+1)).join('\n')),/Mais de 100/);
});
