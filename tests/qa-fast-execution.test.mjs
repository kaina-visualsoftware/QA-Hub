import test from 'node:test';
import assert from 'node:assert/strict';
import {quickExecutionPayload,createCompletionDraft,progressForTask} from '../qa-fast-execution.mjs';
const base={id:'case-1',tarefa_id:'task-1',titulo:'Remover desconto',passos:'Abrir pedido',esperado:'Desconto removido'};
const task={titulo:'Desconto',codigo:'67866',tipo_teste:'BUILD',versao:'12.08'};
test('issue 33: human approval never invents an observed outcome',()=>{
 const result=quickExecutionPayload(base,'aprovado');
 assert.equal(result.status,'aprovado');
 assert.equal(result.obtido,'');
 assert.ok(result.updated_at);
 assert.equal(Object.hasOwn(result,'tarefa_id'),false);
});
test('issue 33: failures or blocked results must be explicitly described',()=>{
 assert.throws(()=>quickExecutionPayload(base,'reprovado',''),/Informe o que falhou/);
 assert.throws(()=>quickExecutionPayload(base,'bloqueado','OK'),/Informe o que falhou/);
 assert.equal(quickExecutionPayload(base,'reprovado','GERADO UMA VENDA TAL').obtido,'Gerado uma venda tal');
 assert.throws(()=>quickExecutionPayload(base,'aprovado','X'.repeat(10001)),/muito extenso/);
});
test('issue 33: report suggestions reflect only recorded executions',()=>{
 const cases=[{...base,status:'aprovado',obtido:''},
  {...base,id:'case-2',titulo:'Fluxo alternativo',status:'reprovado',obtido:'Valor não atualizado'},
  {...base,id:'case-3',titulo:'Regressão',status:'nao_executado',obtido:''}];
 const draft=createCompletionDraft(task,cases);
 assert.match(draft.tested,/Remover desconto/);
 assert.match(draft.tested,/Valor não atualizado/);
 assert.doesNotMatch(draft.tested,/3\. Regressão/);
 assert.match(draft.tested,/Pendentes de execução: 1/);
 assert.match(draft.conclusion,/1 aprovado\(s\), 1 reprovado\(s\)/);
 assert.match(draft.conclusion,/execução ainda|cenário\(s\) reprovado\(s\)/);
 const progress=progressForTask(cases);
 assert.deepEqual(progress,{done:2,total:3,pending:1,failed:1,blocked:0});
});
test('issue 33: empty or pending-only tasks never appear complete',()=>{
 const draft=createCompletionDraft(task,[{...base,status:'nao_executado'}]);
 assert.match(draft.tested,/Nenhum cenário executado/);
 assert.match(draft.conclusion,/1 não executado/);
 assert.doesNotMatch(draft.conclusion,/todos.*aprovados/i);
});
