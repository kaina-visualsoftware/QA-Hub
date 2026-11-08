import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {POST_SYSTEM,TEST_SYSTEM,messagesForGenerator} from '../supabase/functions/qa-generators/prompts.mjs';

const html=readFileSync(new URL('../geradores.html',import.meta.url),'utf8');
// The integrated legacy generator remains accessible as an explicit fallback.
const qa=readFileSync(new URL('../qa-legacy.html',import.meta.url),'utf8');
const qaScript=readFileSync(new URL('../qa.js',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];

test('geradores starts without Claude runtime and uses Supabase and NVIDIA',()=>{
 assert.ok(script,'module script must exist');
 assert.doesNotMatch(script,/claude\.use|service_role|sb_secret_/);
 assert.match(script,/qa-generators/);
 const check=script.replace(/^import[^\n]+;\s*$/gm,'');
 assert.doesNotThrow(()=>new Script(check));
});

test('QA Hub integrates all six productivity modules under one navigation',()=>{
 for(const route of ['post','teste','release','lib','diff','xml']){
   assert.match(qa,new RegExp('href="#/ferramentas/'+route+'"'));
   assert.match(qa,new RegExp('data-route="ferramentas/'+route+'"'));
   assert.match(html,new RegExp('n-'+route));
 }
 assert.doesNotMatch(qa,/href="\.\/geradores\.html#/);
 assert.match(qa,/id="view-ferramentas"/);
 assert.match(qa,/id="tool-frame"/);
 assert.match(qaScript,/const toolRoute = hash\.match/);
 assert.match(qaScript,/qa-hub:navigate-tool/);
 assert.match(qaScript,/event\.origin !== location\.origin/);
 assert.match(qaScript,/state\.toolFrameContext/);
 assert.match(qaScript,/task-post-link'\)\.href='#\/ferramentas\/post\?tf=/);
 assert.match(qaScript,/task-testplan-link'\)\.href='#\/ferramentas\/teste\?tf=/);
 assert.match(html,/nav\{display:none!important\}/);
 assert.match(html,/location\.replace\(destination\.href\)/);
 assert.match(html,/session-label/);
});

test('posts and test-plan prompts preserve supplied constraints',()=>{
 assert.match(POST_SYSTEM,/\[Caminho a ser confirmado\]/);
 assert.match(POST_SYSTEM,/\[Imagem: descricao-da-captura\.png\]/);
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
