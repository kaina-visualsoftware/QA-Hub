import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {POST_SYSTEM,TEST_SYSTEM,messagesForGenerator} from '../supabase/functions/qa-generators/prompts.mjs';

const html=readFileSync(new URL('../geradores.html',import.meta.url),'utf8');
const qa=readFileSync(new URL('../qa.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];

test('geradores starts without Claude runtime and uses Supabase and NVIDIA',()=>{
 assert.ok(script,'module script must exist');
 assert.doesNotMatch(script,/claude\.use|service_role|sb_secret_/);
 assert.match(script,/qa-generators/);
 const check=script.replace(/^import[^\n]+;\s*$/gm,'');
 assert.doesNotThrow(()=>new Script(check));
});

test('QA Hub links all seven requested productivity routes',()=>{
 for(const route of ['post','teste','release','lib','diff','xml']){
   assert.match(qa,new RegExp('geradores\\.html#'+route));
   assert.match(html,new RegExp('n-'+route));
 }
 assert.match(qa,/task-testplan-link/);
 assert.match(qa,/task-post-link/);
 assert.match(html,/session-label/);
});

test('posts and test-plan prompts preserve supplied constraints',()=>{
 assert.match(POST_SYSTEM,/\[CAMINHO DO MENU\]/);
 assert.match(POST_SYSTEM,/\[IMAGEM\]/);
 assert.match(POST_SYSTEM,/JUSTIFICATIVA/);
 assert.match(TEST_SYSTEM,/Cenário 01/);
 assert.match(TEST_SYSTEM,/Resultado esperado/);
 assert.match(TEST_SYSTEM,/Pontos de atenção/);
 assert.match(TEST_SYSTEM,/Não invente|NÃO INVENTE/i);
 assert.match(TEST_SYSTEM,/hipóteses de verificação/);
 const messages=messagesForGenerator('teste','Pedido de venda','Requisito 12');
 assert.equal(messages.length,2);
 assert.match(messages[1].content,/Pedido de venda/);
 assert.match(messages[1].content,/Requisito 12/);
 assert.equal(messagesForGenerator('post','Tarefa','')[0].content,POST_SYSTEM);
});

test('only the generation action sends report text to NVIDIA; local tools are client-only',()=>{
 const localRegion=script.slice(script.indexOf('function toolRelease()'),script.indexOf('const defExec='));
 assert.ok(localRegion.length>7000);
 assert.doesNotMatch(localRegion,/supa\.|fetch\(|qa-generators|claude\.use/);
 assert.match(html,/sem criptografia/);
 assert.match(script,/k==="post"\|\|k==="teste"/);
});
