import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';

mkdirSync('artifacts/ui',{recursive:true});
const site='http://127.0.0.1:8765/';
const stub=String.raw\`
const rows={qa_generator_posts:[],qa_generator_tests:[]};
let seq=0;
export function createClient(){
  return {
    auth:{
      async getUser(){return {data:{user:{id:'11111111-1111-4111-8111-111111111111',is_anonymous:false}},error:null}},
      async getSession(){return {data:{session:{access_token:'test-token'}},error:null}}
    },
    from(table){
      const filters=[];
      const lookup=()=> (rows[table]||[]).filter(r=>filters.every(([key,val])=>r[key]===val));
      const q={
        select(){return q},
        eq(field,value){filters.push([field,value]);return q},
        order(){return q},
        limit(){return Promise.resolve({data:lookup(),error:null})},
        maybeSingle(){return Promise.resolve({data:lookup()[0]||null,error:null})},
        single(){return Promise.resolve({data:lookup()[0]||null,error:null})},
        insert(row){
          const entry={...row,id:'new-'+(++seq)};
          (rows[table]||[]).push(entry);
          return {select(){return {single:async()=>({data:{id:entry.id},error:null})}}};
        },
        update(changes){
          return {eq(field,value){
            const matched=(rows[table]||[]).filter(r=>r[field]===value);
            return {eq(nextField,nextValue){
              matched.filter(r=>r[nextField]===nextValue).forEach(r=>Object.assign(r,changes));
              return Promise.resolve({error:null});
            }};
          }};
        },
        delete(){
          return {eq(field,value){
            return {eq(nextField,nextValue){
              rows[table]=rows[table].filter(r=>!(r[field]===value&&r[nextField]===nextValue));
              return Promise.resolve({error:null});
            }};
          }};
        }
      };
      return q;
    }
  };
}
\`;
const post='# MELHORIA NO PEDIDO\n\nO sistema recebeu uma melhoria no módulo **Vendas**.\n\nPara acessar a funcionalidade, acesse:\n[CAMINHO DO MENU]\n\n[IMAGEM]\n\n**TAREFA:** 123456\n\n**JUSTIFICATIVA:** Facilitar a operação.';
const plan='# ROTEIRO DE TESTES — PEDIDO\n## Objetivo\nValidar comportamento do pedido.\n## Pré-requisitos\n- Cadastro já existente.\n---\n## Cenário 01 — Abrir pedido\n### Cenário\nVerificar abertura.\n### Passos\n1. Abrir pedido\n### Resultado esperado\n- Pedido aberto.\n---\n## Cenário 02 — Validar pedido\n### Cenário\nConfirmar retorno.\n### Passos\n1. Confirmar pedido\n### Resultado esperado\n- Resultado apresentado.\n---\n## Pontos de atenção / possíveis bugs\n- Verificar mensagens de erro não descritas.\n';
const browser=await chromium.launch({headless:true});
const allErrors=[];
for(const width of [390,1366]){
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1});
  const page=await context.newPage();
  const aiCalls=[];
  page.on('pageerror',err=>allErrors.push(width+': '+err.message));
  await page.route('https://esm.sh/**',async route=>{
    await route.fulfill({status:200,contentType:'application/javascript',
      headers:{'access-control-allow-origin':'*'},body:stub});
  });
  await page.route('https://pqadmlhcsimlcclpkyov.supabase.co/functions/v1/qa-generators',async route=>{
    const request=route.request().postDataJSON();
    aiCalls.push(request.mode);
    const md=request.mode==='post'?post:plan;
    const body=['event: chunk','data: '+JSON.stringify({text:md}),'','event: done',
      'data: '+JSON.stringify({model:'nvidia/nemotron-3.5-lightning-30b-a3b',truncated:false}),'',''].join('\n');
    await route.fulfill({status:200,contentType:'text/event-stream',
      headers:{'access-control-allow-origin':'*'},body});
  });
  await page.goto(site+'geradores.html#post',{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('#session-label').textContent.includes('sincronizado'));
  assert.equal(await page.locator('#ttl').innerText(),'Posts do fórum');
  await page.locator('#t').fill('TF 123456 — melhoria no pedido, módulo Vendas');
  await page.locator('#go').click();
  await page.waitForFunction(()=>document.querySelector('#prev').textContent.includes('MELHORIA NO PEDIDO'));
  await page.waitForFunction(()=>!document.querySelector('#go').disabled);
  assert.match(await page.locator('#prev').innerText(),/CAMINHO DO MENU/);
  assert.ok((await page.locator('#hl').innerText()).includes('MELHORIA NO PEDIDO'));
  await page.locator('#n-teste').click();
  await page.locator('#t').fill('TF 123456 — validar pedido no módulo Vendas');
  await page.locator('#go').click();
  await page.waitForFunction(()=>document.querySelector('#exec')?.textContent.includes('Colados no SIA'));
  await page.waitForFunction(()=>!document.querySelector('#go').disabled);
  assert.equal(await page.locator('#xl button').count(),2);
  assert.match(await page.locator('#xs').innerText(),/0\/2/);
  assert.deepEqual(aiCalls,['post','teste']);
  await page.locator('#n-release').click();
  await page.locator('#rv').fill('12.10.06.0000');
  await page.locator('#ra').fill('#199727\t21/10/2026\n17:58:57\t6637\nCLIENTE EXEMPLO\nBUG\tNORMAL\t012 - Teste\tTÍTULO\t26/10/2026 15:58:12\tSOLICITANTE\tANALISTA\tDEV\tSPRINT DE TESTE');
  await page.locator('#b1').click();
  assert.match(await page.locator('#to').innerText(),/Tarefas da Release 12.10.06.0000/);
  assert.match(await page.locator('#to').innerText(),/#199727/);
  await page.locator('#n-diff').click();
  await page.locator('#da').fill('A\nB');
  await page.locator('#db').fill('A\nC');
  await page.locator('#b1').click();
  assert.match(await page.locator('#to').innerText(),/adicionada/);
  await page.locator('#n-xml').click();
  await page.locator('#xa').fill('<root><item a="1">antes</item></root>');
  await page.locator('#xb').fill('<root><item a="2">depois</item></root>');
  await page.locator('#b1').click();
  assert.match(await page.locator('#to').innerText(),/ATRIBUTO/);
  await page.locator('#n-lib').click();
  await page.locator('#lr').fill('Licença de teste');
  await page.locator('#lc').fill('CÓDIGO EXEMPLO');
  await page.locator('#ls').click();
  await page.waitForFunction(()=>document.querySelector('#ll').textContent.includes('Licença de teste'));
  assert.deepEqual(aiCalls,['post','teste'],'local tools must never contact AI');
  await page.screenshot({path:'artifacts/ui/geradores-'+width+'.png',fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=1,'Horizontal overflow at '+width+': '+overflow);
  await context.close();
  console.log('PASS geradores '+width+': AI posts and QA, release, diff, XML, local guardados');
}
await browser.close();
assert.deepEqual(allErrors,[],'No uncaught browser errors');
