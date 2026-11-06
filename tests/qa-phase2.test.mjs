import test from 'node:test';
import assert from 'node:assert/strict';
import {executionSummary,buildExecutionReport,saveTfDocument,cleanDocumentName,selectedScenarioContext} from '../qa-phase2.mjs';

const task={id:'11111111-1111-4111-8111-111111111111',codigo:'67866',
 titulo:'Desconto no pedido',sistema:'Vendas',tipo_teste:'BUILD',
 versao:'12.08.08.0000',status:'em_teste',conclusao:'Aguardando reteste'};
const scenarios=[
 {id:'s1',titulo:'Fluxo normal',status:'aprovado',passos:'Abrir pedido',esperado:'Desconto removido',
  obtido:'Desconto removido',observacoes:'Confirmado na versão'},
 {id:'s2',titulo:'Kit rateado',status:'reprovado',passos:'Salvar kit',esperado:'Desconto removido',
  obtido:'Ainda aparece',observacoes:'Falha reproduzida'},
 {id:'s3',titulo:'Integração indisponível',status:'nao_executado',passos:'Desligar serviço',esperado:'Aviso'},
 {id:'s4',titulo:'Pedido bloqueado',status:'bloqueado',passos:'Acessar',esperado:'Resultado'}
];
test('report includes only actual persisted case statuses without fake approvals',()=>{
 const md=buildExecutionReport(task,scenarios,'2026-11-06T12:00:00.000Z');
 assert.match(md,/Reprovados: 1/);
 assert.match(md,/Aprovados: 1/);
 assert.match(md,/Bloqueados: 1/);
 assert.match(md,/Não executados: 1/);
 assert.match(md,/Resultado obtido\nAinda aparece/);
 assert.match(md,/Ainda não registrado/);
 assert.match(md,/Aguardando reteste/);
 assert.match(md,/não aprova a TF/);
 assert.deepEqual(executionSummary([]),{total:0,nao_executado:0,aprovado:0,reprovado:0,bloqueado:0,finalizados:0});
});
test('document save is scoped to authenticated TF and version is returned',async()=>{
 let call=null;
 const client={async rpc(name,args){call={name,args};return {data:{id:'x',tarefa_id:task.id,tipo:'post',versao:2},error:null}}};
 const data=await saveTfDocument(client,{taskId:task.id,type:'post',title:'Correção nos descontos',content:'Texto revisado'});
 assert.equal(data.versao,2);
 assert.equal(call.name,'qa_save_document');
 assert.equal(call.args.p_tarefa_id,task.id);
 assert.equal(call.args.p_origem,'manual');
 await assert.rejects(()=>saveTfDocument(client,{taskId:'não é uuid',type:'post',title:'Título',content:'Texto'}),/TF válida/);
 await assert.rejects(()=>saveTfDocument(client,{taskId:task.id,type:'xml',title:'Título',content:'Texto'}),/Tipo/);
});
test('diagram context contains only selected scenario records',()=>{
 const chosen=selectedScenarioContext(task,scenarios,['s1','s3','outra-tf']);
 assert.deepEqual(chosen.ids,['s1','s3']);
 assert.equal(chosen.selected.length,2);
 assert.match(cleanDocumentName('TF 67866 — Descontos'),/TF-67866-Descontos\.md/);
});
