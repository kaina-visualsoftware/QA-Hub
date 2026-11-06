import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';

mkdirSync('artifacts/ui',{recursive:true});
const site='http://127.0.0.1:8765/';
const stub=String.raw`
const tfId='33333333-3333-4333-8333-333333333333';
const rows={qa_generator_posts:[],qa_generator_tests:[],
  qa_tarefas:[{id:tfId,user_id:'11111111-1111-4111-8111-111111111111',
    titulo:'Desconto no pedido',codigo:'67866',tipo_teste:'BUILD',
    versao:'12.08.08.0000',sistema:'Vendas',descricao:'Verificar desconto',
    causa:'Rateio do kit',correcao:'Cálculo corrigido',status:'rascunho',
    observacoes:'Não deve ser alterado'}],
  qa_cenarios:[]};
if(typeof window!=='undefined')window.__qaIntegrationRows=rows;
let seq=0;
export function createClient(){
  return {
    auth:{
      async getUser(){return {data:{user:{id:'11111111-1111-4111-8111-111111111111',is_anonymous:false}},error:null}},
      async getSession(){return {data:{session:{access_token:'test-token'}},error:null}}
    },
    async rpc(name,args){
      if(name!=='qa_attach_generated_cases')return {data:null,error:{message:'RPC desconhecida'}};
      if(args.p_tarefa_id!==tfId)return {data:null,error:{message:'TF não encontrada'}};
      let inserted=0,skipped=0;
      for(const item of args.p_itens){
        const seen=rows.qa_cenarios.some(c=>c.tarefa_id===tfId
          && ((c.origem_geracao===args.p_geracao_id&&c.origem_item===item.source_index)
          || (c.titulo===item.titulo&&c.passos===item.passos&&c.esperado===item.esperado)));
        if(seen){skipped++;continue}
        rows.qa_cenarios.push({...item,origem_geracao:args.p_geracao_id,
          origem_item:item.source_index,tarefa_id:tfId,status:'nao_executado',ordem:++seq});
        inserted++;
      }
      return {data:{inserted,skipped,tarefa_id:tfId},error:null};
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
`;
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
  await page.goto(site+'geradores.html?embedded=1&mode=post',{waitUntil:'load'});
  assert.equal(await page.locator('nav').isVisible(),false,'Embedded tools should not render a second navigation');
  await page.waitForFunction(()=>document.querySelector('#session-label').textContent.includes('sincronizado'));
  assert.equal(await page.locator('#ttl').textContent(),'Posts do fórum');
  await page.locator('#t').fill('TF 123456 — melhoria no pedido, módulo Vendas');
  await page.locator('#go').click();
  await page.waitForFunction(()=>document.querySelector('#prev').textContent.includes('MELHORIA NO PEDIDO'));
  await page.waitForFunction(()=>!document.querySelector('#go').disabled);
  assert.match(await page.locator('#prev').innerText(),/CAMINHO DO MENU/);
  assert.ok((await page.locator('#hl').innerText()).includes('MELHORIA NO PEDIDO'));
  await page.locator('#n-teste').evaluate(el=>el.click());
  await page.locator('#t').fill('TF 123456 — validar pedido no módulo Vendas');
  await page.locator('#go').click();
  await page.waitForFunction(()=>document.querySelector('#exec')?.textContent.includes('Colados no SIA'));
  await page.waitForFunction(()=>!document.querySelector('#go').disabled);
  assert.equal(await page.locator('#xl button').count(),2);
  assert.match(await page.locator('#xs').innerText(),/0\/2/);
  assert.deepEqual(aiCalls,['post','teste']);
  await page.locator('#n-release').evaluate(el=>el.click());
  await page.locator('#rv').fill('12.10.06.0000');
  await page.locator('#ra').fill('#199727\t21/10/2026\n17:58:57\t6637\nCLIENTE EXEMPLO\nBUG\tNORMAL\t012 - Teste\tTÍTULO\t26/10/2026 15:58:12\tSOLICITANTE\tANALISTA\tDEV\tSPRINT DE TESTE');
  await page.locator('#b1').click();
  assert.match(await page.locator('#to').innerText(),/Tarefas da Release 12.10.06.0000/);
  assert.match(await page.locator('#to').innerText(),/#199727/);
  await page.locator('#n-diff').evaluate(el=>el.click());
  await page.locator('#da').fill('A\nB');
  await page.locator('#db').fill('A\nC');
  await page.locator('#b1').click();
  assert.match(await page.locator('#to').innerText(),/adicionada/);
  await page.locator('#n-xml').evaluate(el=>el.click());
  await page.locator('#xa').fill('<root><item a="1">antes</item></root>');
  await page.locator('#xb').fill('<root><item a="2">depois</item></root>');
  await page.locator('#b1').click();
  assert.match(await page.locator('#to').innerText(),/ATRIBUTO/);
  await page.locator('#n-lib').evaluate(el=>el.click());
  await page.locator('#lr').fill('Licença de teste');
  await page.locator('#lc').fill('CÓDIGO EXEMPLO');
  await page.locator('#ls').click();
  // The title is shown inside an editable input, not as textContent.
  await page.waitForFunction(()=>[...document.querySelectorAll('#ll input')].some(e=>e.value==='Licença de teste'));
  assert.match(await page.evaluate(()=>localStorage.getItem('h_lib')||''),/Licença de teste/);
  assert.deepEqual(aiCalls,['post','teste'],'local tools must never contact AI');
  await page.screenshot({path:'artifacts/ui/geradores-'+width+'.png',fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=1,'Horizontal overflow at '+width+': '+overflow);
  await context.close();
  console.log('PASS geradores '+width+': AI posts and QA, release, diff, XML, local guardados');
}
// Integration regression: a linked TF must retain all its metadata and gain
// only the selected, explicitly reviewed scenarios. Sending the same batch twice is safe.
{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
 const page=await context.newPage();
 page.on('pageerror',err=>allErrors.push('TF integration: '+err.message));
 await page.route('https://esm.sh/**',async route=>route.fulfill({status:200,
   contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:stub}));
 await page.route('https://pqadmlhcsimlcclpkyov.supabase.co/functions/v1/qa-generators',async route=>{
   const body=['event: chunk','data: '+JSON.stringify({text:plan}),'','event: done',
     'data: '+JSON.stringify({model:'test',truncated:false}),'',''].join('\n');
   await route.fulfill({status:200,contentType:'text/event-stream',
     headers:{'access-control-allow-origin':'*'},body});
 });
 await page.goto(site+'geradores.html?embedded=1&mode=teste&tf=33333333-3333-4333-8333-333333333333');
 await page.waitForFunction(()=>document.querySelector('#session-label').textContent.includes('67866'));
 assert.match(await page.locator('#t').inputValue(),/Rateio do kit/);
 assert.doesNotMatch(await page.locator('#t').inputValue(),/Não deve ser alterado/);
 await page.locator('#go').click();
 await page.waitForFunction(()=>document.querySelector('#qa-case-list') || document.querySelector('#qa-attach-list .qa-case'));
 await page.waitForFunction(()=>document.querySelectorAll('#qa-attach-list .qa-case').length===2);
 await page.waitForFunction(()=>!document.querySelector('#qa-attach-save').disabled);
 await page.locator('#qa-attach-list .qa-case input[type=checkbox]').last().uncheck();
 await page.locator('#qa-attach-save').click();
 await page.waitForFunction(()=>document.querySelector('#qa-attach-status').textContent.includes('1 caso(s) adicionado(s)'));
 assert.match(await page.locator('#qa-attach-info').innerText(),/1 duplicado/);
 const integrity=await page.evaluate(()=>({
   tasks:window.__qaIntegrationRows?.qa_tarefas?.length??null,
   cases:window.__qaIntegrationRows?.qa_cenarios?.length??null
 }));
 assert.equal(integrity.tasks,1,'Importing cases must not create a TF');
 assert.equal(integrity.cases,1,'Only one selected case should be imported');
 const saved=await page.evaluate(()=>({
   task:window.__qaIntegrationRows.qa_tarefas[0],
   case:window.__qaIntegrationRows.qa_cenarios[0]
 }));
 assert.equal(saved.task.codigo,'67866');
 assert.equal(saved.task.observacoes,'Não deve ser alterado');
 assert.equal(saved.task.causa,'Rateio do kit');
 assert.equal(saved.case.status,'nao_executado');
 // Reload should preserve the navigation and the focused task (database behavior
 // is checked by the RPC contract and SQL migration, as the fake resets on reload).
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#session-label').textContent.includes('67866'));
 await page.screenshot({path:'artifacts/ui/qa-cases-integration.png',fullPage:true});
 await context.close();
 console.log('PASS linked TF: preview, selective import, preservation, reload');
}
await browser.close();
assert.deepEqual(allErrors,[],'No uncaught browser errors');
