import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateRequirementCoverage,saveRequirementScenarioLinks,coverageCsv,COVERAGE_STATES} from '../qa-requirements-coverage.mjs';

const task='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const req=(n,estado='aprovado',tarefa_id=task)=>({
  id:'33333333-3333-4333-8333-'+String(n).padStart(12,'0'),
  tarefa_id,codigo:'RF-'+String(n).padStart(3,'0'),
  tipo:'RF',titulo:'Requisito '+n,descricao:'Regra '+n,estado,ordem:n
});
const scenario=(n,status='nao_executado',tarefa_id=task)=>({
  id:'44444444-4444-4444-8444-'+String(n).padStart(12,'0'),
  tarefa_id,titulo:'Cenário '+n,status
});
const link=(r,s,tarefa_id=task)=>({
  tarefa_id,requisito_id:r.id,cenario_id:s.id
});
test('R4: only approved requirements of the current TF count',()=>{
  const r1=req(1),r2=req(2,'rascunho'),r3=req(3,'arquivado'),r4=req(4,'aprovado',other);
  const result=calculateRequirementCoverage([r1,r2,r3,r4],[scenario(1)],[],task);
  assert.equal(result.totals.total,1);
  assert.equal(result.totals.unlinked,1);
  assert.equal(result.totals.coveragePercent,0);
  assert.equal(result.totals.validationPercent,0);
});
test('R4: linked does not mean executed, approved, or validated',()=>{
  const r=req(1),s=scenario(1);
  const result=calculateRequirementCoverage([r],[s],[link(r,s)],task);
  assert.equal(result.totals.coveragePercent,100);
  assert.equal(result.totals.validationPercent,0);
  assert.equal(result.items[0].coverage,'nao_executado');
  assert.equal(result.items[0].executedCount,0);
});
test('R4: a mixed or blocked set is never validated; failures have priority',()=>{
  const r1=req(1),r2=req(2),r3=req(3);
  const cases=[
    scenario(1,'aprovado'),scenario(2,'nao_executado'),
    scenario(3,'bloqueado'),scenario(4,'reprovado')
  ];
  const links=[
    link(r1,cases[0]),link(r1,cases[1]),
    link(r2,cases[0]),link(r2,cases[2]),
    link(r3,cases[2]),link(r3,cases[3])
  ];
  const result=calculateRequirementCoverage([r1,r2,r3],cases,links,task);
  assert.deepEqual(result.items.map(x=>x.coverage),['parcial','bloqueado','reprovado']);
  assert.equal(result.totals.validationPercent,0);
  assert.equal(result.totals.failed,1);
  assert.equal(result.totals.blocked,1);
  assert.equal(result.totals.pending,1);
});
test('R4: approved only if all linked saved scenarios are approved',()=>{
  const r=req(1),s1=scenario(1,'aprovado'),s2=scenario(2,'aprovado');
  const result=calculateRequirementCoverage([r],[s1,s2],[link(r,s1),link(r,s2)],task);
  assert.equal(result.totals.validated,1);
  assert.equal(result.totals.fullyExecuted,1);
  assert.equal(result.totals.validationPercent,100);
});
test('R4: duplicate links and other TF scenarios do not inflate coverage',()=>{
  const r=req(1),s=scenario(1,'aprovado'),foreign=scenario(2,'aprovado',other);
  const result=calculateRequirementCoverage([r],[s,foreign],
    [link(r,s),link(r,s),link(r,foreign)],task);
  assert.equal(result.items[0].linkedCount,1);
  assert.equal(result.totals.distinctLinkedCases,1);
  assert.equal(result.totals.coveragePercent,100);
});
test('R4: RPC strictly verifies selection and confirmation',async()=>{
  let request;
  const db={rpc:async (fn,args)=>{
    assert.equal(fn,'qa_set_requirement_scenarios');request=args;
    return {data:{tarefa_id:task,requisito_id:req(1).id,
      linked:args.p_cenario_ids.length,inserted:1,removed:0},error:null};
  }};
  const selected=[scenario(1).id];
  const response=await saveRequirementScenarioLinks(db,{
    taskId:task,requirementId:req(1).id,scenarioIds:selected});
  assert.equal(response.linked,1);
  assert.deepEqual(request.p_cenario_ids,selected);
  assert.throws(()=>saveRequirementScenarioLinks(db,{
    taskId:task,requirementId:req(1).id,scenarioIds:[...selected,...selected]
  }),/únicos/);
  assert.throws(()=>saveRequirementScenarioLinks(db,{
    taskId:task,requirementId:req(1).id,scenarioIds:[other]
  }),/válidos|únicos/);
});
test('R4: safe CSV export has headers and guards against formula injection',()=>{
  const r={...req(1),titulo:'=HYPERLINK("bad")'};
  const c=scenario(1,'aprovado');
  const {items}=calculateRequirementCoverage([r],[c],[link(r,c)],task);
  const csv=coverageCsv(items);
  assert.ok(csv.startsWith('\ufeff'));
  assert.match(csv,/Código;|Código"/);
  assert.ok(csv.includes('\'=HYPERLINK'));
  assert.match(csv,/Validado/);
  assert.doesNotMatch(csv,/\n=/);
});
