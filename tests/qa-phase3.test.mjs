import test from 'node:test';
import assert from 'node:assert/strict';
import {
 coverageMetrics,normalizeReleaseVersion,exactTaskCodePresent,comparisonCounters,
 validateReference,linkTaskRelease,recordComparison,createReference
} from '../qa-phase3.mjs';
const task='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
test('coverage uses real scenarios and excludes unrelated records',()=>{
 const got=coverageMetrics([{id:task},{id:other}],[
   {tarefa_id:task,status:'aprovado'},{tarefa_id:task,status:'reprovado'},
   {tarefa_id:task,status:'nao_executado'},
   {tarefa_id:'33333333-3333-4333-8333-333333333333',status:'aprovado'}
 ]);
 assert.deepEqual(got,{
 totalTasks:2,withCases:1,withoutCases:1,totalCases:3,executed:2,
 unexecuted:1,coveragePct:67,approved:1,failed:1,blocked:0
 });
 assert.equal(coverageMetrics([],[]).coveragePct,0);
});
test('release association requires exact code and a deliberate valid version',async()=>{
 assert.equal(exactTaskCodePresent('#67866',['67866','77866']),true);
 assert.equal(exactTaskCodePresent('67866',['167866']),false);
 assert.throws(()=>normalizeReleaseVersion('12.10'),/formato/);
 let args;
 const client={rpc:async(name,params)=>{args={name,params};return {data:other,error:null}}};
 assert.equal(await linkTaskRelease(client,{taskId:task,version:'12.10.06.0000'}),other);
 assert.equal(args.name,'qa_link_release');
 assert.equal(args.params.p_tarefa_id,task);
 await assert.rejects(()=>linkTaskRelease(client,{taskId:'abc',version:'12.10.06.0000'}),/TF válida/);
});
test('comparisons store only counters, never XML or original text',async()=>{
 assert.deepEqual(comparisonCounters('diff_xml',{adicionados:1,removidos:2,alterados:5,xml:'<secret />'}),
  {tipo:'diff_xml',adicionados:1,removidos:2,alterados:5});
 assert.throws(()=>comparisonCounters('diff_xml',{adicionados:-1}),/Contagem/);
 let inserted;
 const client={from:()=>({insert:x=>{inserted=x;return {select:()=>({single:async()=>({data:{id:other},error:null})})}}})};
 await recordComparison(client,{taskId:task,userId:other,type:'diff_texto',values:{adicionados:3,removidos:1,text:'secret'}});
 assert.deepEqual(Object.keys(inserted).sort(),['adicionados','alterados','removidos','tarefa_id','tipo','user_id'].sort());
});
test('reusable references reject credential-like data',async()=>{
 assert.throws(()=>validateReference({titulo:'Acessos',categoria:'nota',conteudo:'senha: 123456'}),/Não armazene/);
 assert.throws(()=>validateReference({titulo:'Cadastro',categoria:'nota',conteudo:'123.456.789-01'}),/Não armazene/);
 let inserted;
 const client={from:()=>({insert:x=>{inserted=x;return {select:()=>({single:async()=>({data:{id:task},error:null})})}}})};
 await createReference(client,{userId:other,titulo:'Checklist de login',conteudo:'Validar campos obrigatórios',categoria:'checklist'});
 assert.equal(inserted.user_id,other);
 assert.equal(inserted.categoria,'checklist');
});
