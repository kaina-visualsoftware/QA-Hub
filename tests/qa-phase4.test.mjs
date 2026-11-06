import test from 'node:test';
import assert from 'node:assert/strict';
import {slicePage,validateEvidence,legacyPreview,auditDetails,legacyRecordId} from '../qa-phase4.mjs';

test('list pagination is bounded and deterministic',()=>{
 const items=Array.from({length:101},(_,i)=>i);
 assert.deepEqual(slicePage(items,0,24).rows,items.slice(0,24));
 assert.equal(slicePage(items,3).visible,96);
 assert.equal(slicePage(items,4).hasMore,false);
 assert.equal(slicePage(items,0,10000).visible,100);
});
test('evidence accepts notes or HTTPS URL; rejects unsafe inputs',()=>{
 assert.deepEqual(validateEvidence({tipo:'observacao',resumo:'Pedido validado.'}),{
  tipo:'observacao',resumo:'Pedido validado.',referencia:'',cenario_id:null
 });
 assert.throws(()=>validateEvidence({tipo:'log',resumo:'Teste',referencia:'javascript:alert(1)'}),/HTTPS/);
 assert.throws(()=>validateEvidence({tipo:'captura',resumo:'x'}),/evidência/);
});
test('legacy execution flags are ignored when planning case import',()=>{
 const raw='## Cenário 01 — Abrir cadastro\n### Passos\n1. Abrir\n### Resultado esperado\n- Abriu';
 const record={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',md:raw,
  exec:{'Cenário 01 — Abrir cadastro':{s:'OK',o:'FUNCIONANDO:'}}};
 const p=legacyPreview(record,'teste',[]);
 assert.equal(p.items.length,1);
 assert.equal(p.items[0].selected,true);
 assert.equal(Object.hasOwn(p.items[0],'status'),false);
 assert.match(p.summary,/não executados/);
 assert.equal(legacyRecordId(record),record.id);
 assert.equal(auditDetails({acao:'cenario.status',detalhes:{anterior:'nao_executado',novo:'aprovado'}}),'nao_executado → aprovado');
});
