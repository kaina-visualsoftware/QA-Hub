import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractWithNvidia,NVIDIA_MAX_INPUT} from '../qa-nvidia.mjs';

test('NVIDIA extraction accepts structured output but keeps extracted scenarios unexecuted',async()=>{
 let called=0;
 const fake={functions:{async invoke(name,{body,signal}){
   called++;
   assert.equal(name,'qa-ai');
   assert.match(body.text,/TF 67866/);
   assert.ok(signal);
   return {data:{model:'nvidia/nemotron-3.5-lightning-30b-a3b',draft:{
     codigo:'99999',titulo:'Promoção por tabela',descricao:'Testes de preço',
     status:'aprovado',user_id:'admin',cenarios:[{titulo:'Validar promoção',status:'aprovado',passos:'Incluir item'}]
   }},error:null};
 }}};
 const info=await extractWithNvidia('TF 67866 — Promoção por tabela. Versão: 12.08.08.0000',fake);
 assert.equal(called,1);
 assert.equal(info.draft.fields.codigo,'67866');
 assert.equal(info.draft.fields.status,undefined);
 assert.equal(info.draft.fields.user_id,undefined);
 assert.equal(info.draft.cenarios[0].status,'nao_executado');
 assert.match(info.model,/nemotron/);
});

test('NVIDIA errors are shown without leaking credentials',async()=>{
 const fake={functions:{async invoke(){return {data:null,error:{
   context:{async json(){return {message:'A IA online ainda não foi ativada no Supabase.'}}}
 }};}}};
 await assert.rejects(extractWithNvidia('Relatório de QA',fake),/não foi ativada/);
});

test('Reject empty, oversized and unavailable client payloads',async()=>{
 assert.equal(NVIDIA_MAX_INPUT,20000);
 await assert.rejects(extractWithNvidia('',{}),/Cole o texto/);
 await assert.rejects(extractWithNvidia('x'.repeat(NVIDIA_MAX_INPUT+1),{}),/20.000/);
 await assert.rejects(extractWithNvidia('um relatório',{}),/indisponível/);
});

test('Edge Function has auth, secret env, free model allowlist and no hardcoded user keys',()=>{
 const code=readFileSync(new URL('../supabase/functions/qa-ai/index.ts',import.meta.url),'utf8');
 assert.match(code,/Deno.env.get\("NVIDIA_API_KEY"\)/);
 assert.match(code,/auth.getUser\(token\)/);
 assert.match(code,/qa_ai_claim_request/);
 assert.match(code,/nvidia\/nemotron-3.5-lightning-30b-a3b/);
 assert.match(code,/z-ai\/glm-5-3-flash/);
 assert.match(code,/Não invente|Nunca invente/);
 assert.doesNotMatch(code,/nvapi-[a-zA-Z0-9_-]+/);
});
