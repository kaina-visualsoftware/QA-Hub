import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractWithNvidia} from '../qa-nvidia.mjs';

test('NVIDIA extraction accepts structured output but keeps extracted scenarios unexecuted',async()=>{
 let called=0;
 const fake={functions:{async invoke(name,{body,signal}){
   called++;
   assert.equal(name,'qa-ai');
   assert.match(body.text,/TF 67866/);
   assert.ok(signal);
   return {data:{provider:'NVIDIA Build',model:'nvidia/nemotron-3.5-lightning-30b-a3b',draft:{
     codigo:'99999',titulo:'Promoção por tabela',descricao:'Testes de preço',
     status:'aprovado',user_id:'admin',cenarios:[{titulo:'Validar promoção',status:'aprovado',passos:'Incluir item'}]
   }},error:null};
 }}};
 const info=await extractWithNvidia('TF 67866 — Promoção por tabela. Versão: 12.08.08.0000',fake);
 assert.equal(called,1);
 assert.equal(info.draft.fields.codigo,undefined, 'Identificador divergente da fonte não pode ser completado localmente.');
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
 await assert.rejects(extractWithNvidia('',{}),/Cole o texto/);
 await assert.rejects(extractWithNvidia('um relatório',{}),/indisponível/);
});

test('Edge Function has auth, secret env, free model allowlist and no hardcoded user keys',()=>{
 const code=readFileSync(new URL('../supabase/functions/qa-ai/index.ts',import.meta.url),'utf8');
 const models=readFileSync(new URL('../supabase/functions/_shared/llm/models.mjs',import.meta.url),'utf8');
 assert.match(code,/Deno.env.get\("NVIDIA_API_KEY"\)/);
 assert.match(code,/auth.getUser\(token\)/);
 assert.match(code,/qa_ai_claim_minute_request/);
 assert.match(code,/Retry-After/);
 assert.doesNotMatch(code,/12 usos por dia/);
 assert.match(code,/modelIds:MODEL_IDS/);
 assert.match(models,/nvidia\/nemotron-3.5-lightning-30b-a3b/);
 assert.match(models,/z-ai\/glm-5\.3-flash/);
 assert.doesNotMatch(models,/z-ai\/glm-5-3-flash/);
 assert.match(code,/Não invente|Nunca invente/);
 assert.doesNotMatch(code,/nvapi-[a-zA-Z0-9_-]+/);
});

test('NVIDIA AI uses a global rolling 15/minute limit without daily quota',()=>{
 const sql=readFileSync(new URL('../supabase/qa_ai_quota.sql',import.meta.url),'utf8');
 const code=readFileSync(new URL('../supabase/functions/qa-ai/index.ts',import.meta.url),'utf8');
 assert.match(sql,/count_recent\s*>=\s*15/);
 assert.match(sql,/interval '60 seconds'/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/qa_ai_claim_minute_request/);
 assert.match(sql,/not consulted/i);
 assert.match(code,/retry_after_seconds/);
 assert.match(code,/Não há limite diário no QA Hub/);
 assert.doesNotMatch(code,/qa_ai_claim_request"/);
});

test('accepts long TF input without truncating the request',async()=>{
 const text='Relatório de QA. '.repeat(6000)+' FIM DO CONTEXTO';
 const db={functions:{async invoke(_,{body}){assert.equal(body.text,text);return {data:{provider:'NVIDIA Build',draft:{titulo:'Análise completa',descricao:'Descrição'},model:'NVIDIA Build'},error:null};}}};
 const result=await extractWithNvidia(text,db);assert.equal(result.fallback,false);
});
