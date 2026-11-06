import {executionSummary,EXECUTION_STATUSES} from './qa-phase2.mjs';
import {normalizeNarrative} from './qa-narrative.mjs';

// Issue #33: a button click by the QA is the execution action.
// AI generation never calls these helpers or changes scenario outcomes.
export function quickExecutionPayload(scenario,status,observed=''){
 if(!Object.hasOwn(EXECUTION_STATUSES,status))
  throw Error('Situação de execução inválida.');
 if(!scenario?.id||!scenario.tarefa_id)throw Error('Cenário inválido.');
 const value=normalizeNarrative(String(observed||'').trim());
 if(['reprovado','bloqueado'].includes(status)&&value.length<5)
  throw Error('Informe o que falhou ou por que o cenário está bloqueado (mínimo de 5 caracteres).');
 if(value.length>10000)throw Error('Resultado observado muito extenso.');
 return {status,obtido:status==='nao_executado'?'':value,
  updated_at:new Date().toISOString()};
}
export function createCompletionDraft(task,scenarios=[]){
 if(!task?.titulo||!Array.isArray(scenarios))throw Error('TF inválida.');
 const summary=executionSummary(scenarios);
 const executed=scenarios.filter(s=>s.status!=='nao_executado');
 const prefix='TF '+(task.codigo||task.titulo)+
  (task.versao?' · versão '+task.versao:'')+
  (task.sistema?' · módulo '+task.sistema:'');
 const details=executed.map((s,i)=>
  String(i+1)+'. '+s.titulo+' — '+EXECUTION_STATUSES[s.status]+
  (s.passos?'\nPassos: '+s.passos:'')+
  (s.esperado?'\nEsperado: '+s.esperado:'')+
  (s.obtido?'\nObservado: '+s.obtido:'')+
  (s.observacoes?'\nObservações: '+s.observacoes:'')).join('\n\n');
 const tested=prefix+'\n\n'+
  (details||'Nenhum cenário executado até o momento.')+
  (summary.nao_executado?'\n\nPendentes de execução: '+summary.nao_executado+'.':'');
 const state=summary.total===0?'Nenhum cenário cadastrado.':
  summary.reprovado?'Há '+summary.reprovado+' cenário(s) reprovado(s).':
  summary.bloqueado?'Há '+summary.bloqueado+' cenário(s) bloqueado(s).':
  summary.nao_executado?'A execução ainda está em andamento.':
  'Todos os cenários cadastrados foram executados e aprovados; a aprovação da TF permanece sob decisão do testador.';
 const conclusion='Resumo dos resultados registrados: '+summary.aprovado+
  ' aprovado(s), '+summary.reprovado+' reprovado(s), '+
  summary.bloqueado+' bloqueado(s) e '+summary.nao_executado+
  ' não executado(s), de '+summary.total+'.\n'+state;
 return {tested,conclusion,summary};
}
export function progressForTask(scenarios){
 const summary=executionSummary(scenarios);
 return {done:summary.finalizados,total:summary.total,pending:summary.nao_executado,
  failed:summary.reprovado,blocked:summary.bloqueado};
}
