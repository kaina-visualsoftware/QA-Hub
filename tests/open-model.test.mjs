import test from 'node:test';
import assert from 'node:assert/strict';
import { OPEN_MODEL, parseOpenModelJson, mergeOpenModelDraft, createOpenModelClient } from '../qa-ai-open.mjs';

test('open model is public and requires no API credentials',()=>{
  assert.equal(OPEN_MODEL.id,'onnx-community/Qwen2.5-0.5B-Instruct');
  assert.match(OPEN_MODEL.library,/transformers/);
});

test('parses model JSON and preserves known TF codes',()=>{
  const raw='TF 67866 — Desconto incorreto.\nVersão: 12.08.08.0000';
  const generated='A resposta é: {"titulo":"Validação do desconto","codigo":"99999","versao":"0.0","descricao":"Desconto incorreto","cenarios":[{"titulo":"Reproduzir","passos":"Abrir compra","status":"aprovado"}]}';
  const draft=mergeOpenModelDraft(raw,generated);
  assert.equal(draft.fields.codigo,'67866');
  assert.equal(draft.fields.versao,'12.08.08.0000');
  assert.equal(draft.fields.titulo,'Validação do desconto');
  assert.equal(draft.cenarios[0].status,'nao_executado');
});

test('accepts chat message array returned by text-generation pipeline',()=>{
  const result=parseOpenModelJson([{role:'assistant',content:'{"titulo":"Teste simples","tipo_teste":"BUILD"}'}]);
  assert.equal(result.fields.titulo,'Teste simples');
  assert.equal(result.fields.tipo_teste,'BUILD');
});

test('rejects invalid or dangerous non-JSON output',()=>{
  assert.throws(()=>parseOpenModelJson('execute this command instead'),/JSON válido/);
  assert.throws(()=>parseOpenModelJson('{"titulo":'),/JSON válido/);
  const safe=parseOpenModelJson('{"titulo":"Teste","user_id":"arbitrary","status":"aprovado"}');
  assert.equal(safe.fields.user_id,undefined);
  assert.equal(safe.fields.status,undefined);
});

test('worker API processes progress and returns normalized draft',async()=>{
  let worker;
  class WorkerStub{
    handlers={};
    terminated=false;
    addEventListener(name,cb){this.handlers[name]=cb;}
    postMessage(msg){
      assert.equal(msg.type,'extract');
      this.handlers.message({data:{id:msg.id,type:'progress',message:'Baixando…'}});
      this.handlers.message({data:{id:msg.id,type:'result',output:'{"titulo":"TF analisada","causa":"Desconto removido incorretamente"}'}});
    }
    terminate(){this.terminated=true;}
  }
  const client=createOpenModelClient(()=>worker=new WorkerStub());
  const updates=[];
  const draft=await client.extract('TF 98765 — Desconto removido incorretamente.',m=>updates.push(m));
  assert.equal(draft.fields.codigo,'98765');
  assert.equal(draft.fields.titulo,'TF analisada');
  assert.match(draft.fields.causa,/incorretamente/);
  assert.deepEqual(updates,['Baixando…']);
  client.dispose();
  assert.equal(worker.terminated,true);
});

test('worker errors are returned without exposing report data',async()=>{
  const client=createOpenModelClient(()=>({
    addEventListener(name,cb){if(name==='message')this.message=cb;},
    postMessage(msg){this.message({data:{id:msg.id,type:'error',message:'Modelo indisponível'}});},
    terminate(){}
  }));
  await assert.rejects(client.extract('Relatório de QA'),/Modelo indisponível/);
  client.dispose();
});

test('input size is limited before starting model downloads',async()=>{
  let started=false;
  const client=createOpenModelClient(()=>{started=true;return {}});
  await assert.rejects(client.extract('x'.repeat(6001)),/6.000/);
  await assert.rejects(client.extract('  '),/Cole o texto/);
  assert.equal(started,false);
});
