import test from 'node:test';
import assert from 'node:assert/strict';
import {
 approvedRequirementRows,requireAuthorizedTask,composeRequirementContext,
 combineDiagramContext,loadApprovedRequirements,recordRequirementUsage
} from '../qa-requirements-context.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const taskA='33333333-3333-4333-8333-333333333333';
const taskB='44444444-4444-4444-8444-444444444444';
const rows=[
  {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',tarefa_id:taskA,
    codigo:'RF-001',tipo:'RF',titulo:'Recálculo do pedido',
    descricao:'Ao remover o desconto, o total é recalculado.',
    criterios_aceite:'O total correto aparece na tela.',
    updated_at:'2026-11-06T11:00:00.000Z',ordem:1,estado:'aprovado'},
  {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',tarefa_id:taskA,
    codigo:'RN-001',tipo:'RN',titulo:'Bloquear descontos negativos',
    descricao:'Percentuais negativos não autorizados são impedidos.',
    criterios_aceite:'',updated_at:'2026-11-06T11:02:00.000Z',
    ordem:2,estado:'aprovado'},
  {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',tarefa_id:taskA,
    codigo:'RF-003',tipo:'RF',titulo:'Rascunho',
    descricao:'Não aprovado.',updated_at:'2026-11-06T11:00:00Z',ordem:3,estado:'rascunho'},
  {id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',tarefa_id:taskB,
    codigo:'RF-999',tipo:'RF',titulo:'Outra tarefa',
    descricao:'Não pode vazar.',updated_at:'2026-11-06T11:00:00Z',ordem:1,estado:'aprovado'}
];
test('R3: never use unapproved or other-task requirements',()=>{
  const approved=approvedRequirementRows(rows,taskA);
  assert.deepEqual(approved.map(x=>x.codigo),['RF-001','RN-001']);
  const context=composeRequirementContext(approved,[approved[0].id],'Detalhe extra',{taskId:taskA});
  assert.equal(context.selectedCount,1);
  assert.match(context.text,/RF-001/);
  assert.match(context.text,/Detalhe extra/);
  assert.doesNotMatch(context.text,/RN-001|RF-999|Rascunho|Não pode vazar/);
  assert.deepEqual(context.snapshots.map(x=>x.updated_at),['2026-11-06T11:00:00.000Z']);
});
test('R3: selectable default and empty context do not fabricate requirements',()=>{
  const approved=approvedRequirementRows(rows,taskA);
  const all=composeRequirementContext(approved,approved.map(x=>x.id),'',{taskId:taskA});
  assert.equal(all.selectedCount,2);
  const none=composeRequirementContext(approved,[],'',{taskId:taskA});
  assert.equal(none.text,'');
  assert.equal(none.selectedCount,0);
  const custom=composeRequirementContext(approved,[],'Somente complemento',{taskId:taskA});
  assert.match(custom.text,/Somente complemento/);
  assert.doesNotMatch(custom.text,/RF-001/);
});
test('R3: reject cross-task IDs, unknown IDs, too many and silent truncation',()=>{
  const approved=approvedRequirementRows(rows,taskA);
  assert.throws(()=>composeRequirementContext(approved,[rows[3].id],'',{taskId:taskA}),/outra TF|indisponíveis/);
  assert.throws(()=>composeRequirementContext(approved,Array.from({length:101},(_,i)=>String(i)),'',{taskId:taskA}),/100 requisitos/);
  assert.throws(()=>composeRequirementContext(approved,[approved[0].id],'A'.repeat(20000),{taskId:taskA}),/Nenhum item foi omitido/);
  assert.throws(()=>combineDiagramContext('Etapas do processo','B'.repeat(20000)),/Nada foi cortado/);
});
test('R3: task identity and owner are required to fetch approved data',()=>{
  assert.throws(()=>requireAuthorizedTask({id:taskA,user_id:owner},'outro-usuario'),/não pertence/);
  assert.throws(()=>requireAuthorizedTask({id:'outro-id',user_id:owner},owner),/não pertence/);
  assert.equal(requireAuthorizedTask({id:taskA,user_id:owner},owner),taskA);
});
test('R3: query is scoped to task and approved status',async()=>{
  const called=[];
  const db={from(table){
    assert.equal(table,'qa_requisitos');
    return {
      select(columns){called.push(['select',columns]);return this},
      eq(key,value){called.push(['eq',key,value]);return this},
      order(key){called.push(['order',key]);return this},
      limit(value){called.push(['limit',value]);return Promise.resolve({data:rows.filter(x=>x.tarefa_id===taskA&&x.estado==='aprovado'),error:null})}
    };
  }};
  const result=await loadApprovedRequirements(db,{id:taskA,user_id:owner},owner);
  assert.equal(result.length,2);
  assert.deepEqual(called.filter(x=>x[0]==='eq'),[['eq','tarefa_id',taskA],['eq','estado','aprovado']]);
});
test('R3: usage persistence is private metadata, never uploads original files',async()=>{
  let saved;
  const db={from(table){
    assert.equal(table,'qa_geracao_contextos');
    return {insert(value){
      saved=value;return {select(){
        return {single:async()=>({data:{id:taskA},error:null})};
      }};
    }};
  }};
  const approved=approvedRequirementRows(rows,taskA);
  const ctx=composeRequirementContext(approved,[approved[0].id],'',{taskId:taskA});
  assert.equal(await recordRequirementUsage(db,{taskId:taskA,uid:owner,
    type:'post',artifactRef:'generated-1',snapshots:ctx.snapshots}),taskA);
  assert.equal(saved.quantidade,1);
  assert.equal(saved.requisitos_snapshot[0].codigo,'RF-001');
  assert.equal(JSON.stringify(saved).includes('storage_path'),false);
  assert.equal(await recordRequirementUsage(db,{taskId:taskA,uid:owner,
    type:'teste',artifactRef:'generated-empty',snapshots:[]}),null);
});
