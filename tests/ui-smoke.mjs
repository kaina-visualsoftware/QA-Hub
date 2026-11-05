// Real Chromium smoke tests with a deterministic, in-browser Supabase fake.
// All email addresses and TFs here are synthetic; no production account is accessed.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';

const site='http://127.0.0.1:8765/';
mkdirSync('artifacts/ui', {recursive:true});
const fakeSupabase = `
export function createClient(){
  const pub='11111111-1111-4111-8111-111111111111',priv='22222222-2222-4222-8222-222222222222';
  const tables={
    qa_tarefas:[
      {id:pub,publica:true,user_id:'different-user',titulo:'TF exemplo pública',codigo:'PUB01',tipo_teste:'BUILD',status:'rascunho',sistema:'Exemplo',descricao:'Fluxo público visível'},
      {id:priv,publica:false,user_id:'different-user',titulo:'TF particular secreta',codigo:'PRV01',tipo_teste:'BUILD',status:'rascunho',sistema:'Interno'}
    ],
    qa_cenarios:[
      {id:'scenario-public',tarefa_id:pub,titulo:'Cenário compartilhado',passos:'Abrir tela',ordem:1},
      {id:'scenario-private',tarefa_id:priv,titulo:'Cenário secreto',ordem:1}
    ],
    qa_diagramas:[
      {id:'diagram-public',tarefa_id:pub,titulo:'Fluxo compartilhado',conteudo:'flowchart TD\\n A["Começo"] --> B["Fim"]'},
      {id:'diagram-private',tarefa_id:priv,titulo:'Fluxo secreto',conteudo:'flowchart TD\\n A --> B'}
    ],
    qa_admins:[]
  };
  let user=null;
  let nextId=0;
  function from(table){
    let kind='read',payload=null,conditions={};
    function rows(){return (tables[table]||[]).filter(row=>
      Object.entries(conditions).every(([key,val])=>row[key]===val));}
    function execute(){
      if(kind==='insert'){
        const added=(Array.isArray(payload)?payload:[payload]).map(row=>({
          ...row,id:row.id||'test-qa-'+(++nextId),
          created_at: new Date().toISOString()
        }));
        tables[table].push(...added);
        return {data:added,error:null};
      }
      if(kind==='update'){
        const found=rows();
        found.forEach(row=>Object.assign(row,payload));
        return {data:found,error:null};
      }
      if(kind==='delete'){
        const found=rows();
        tables[table]=tables[table].filter(row=>!found.includes(row));
        return {data:found,error:null};
      }
      return {data:rows(),error:null};
    }
    const q={
      select(){return q},
      order(){return q},
      limit(){return Promise.resolve(execute())},
      eq(key,value){conditions[key]=value;return q},
      maybeSingle(){const result=execute();return Promise.resolve({
        data:result.data[0]??null,error:null
      })},
      single(){const result=execute();return Promise.resolve({
        data:result.data[0]??null,error:null
      })},
      insert(value){kind='insert';payload=value;return q},
      update(value){kind='update';payload=value;return q},
      delete(){kind='delete';return q},
      then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}
    };
    return q;
  }
  return {
    from,
    functions:{
      async invoke(name,{body}){
        if(name!=='qa-ai')return {data:null,error:new Error('Unknown function')};
        await new Promise(resolve=>setTimeout(resolve,400));
        if(body.mode==='diagram'){
          return {data:{model:'nvidia/nemotron-3.5-lightning-30b-a3b',
            mermaid:'flowchart TD\\n  A["Início"] --> B["Validar pedido"]\\n  B --> C["Concluir"]'},error:null};
        }
        return {data:{model:'nvidia/nemotron-3.5-lightning-30b-a3b',draft:{
          codigo:'67866',titulo:'Inclusão de produto',tipo_teste:'BUILD',
          descricao:body.text,cenarios:[{titulo:'Incluir produto',passos:'Abrir catálogo e incluir produto',
            esperado:'Produto incluído',obtido:'',observacoes:''}]
        }},error:null};
      }
    },
    auth:{
      async getSession(){return {data:{session:user?{user}:null},error:null}},
      onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
      async signInWithPassword({email}){
        user={id:'qa-fixture-user',email};
        return {data:{user,session:{user}},error:null};
      },
      async signOut(){user=null;return {error:null}},
      async signUp(){return {data:{session:null,user:null},error:null}},
      async resend(){return {error:null}}
    }
  }
}
`;
const fakeChart=`export default class Chart { constructor(){ } destroy(){ } }`;
const fakeMermaid=`export default {initialize(){},async parse(){return true},async render(){return {svg:'<svg viewBox="0 0 900 500"></svg>'}}}`;

function contrast(foreground,background) {
  function luma(s){
    const arr=(s.match(/[0-9.]+/g)||[]).slice(0,3).map(Number).map(v=>{
      const p=v/255;return p<=0.04045?p/12.92:((p+0.055)/1.055)**2.4;
    });
    return arr[0]*.2126+arr[1]*.7152+arr[2]*.0722;
  }
  const l=[luma(foreground),luma(background)].sort((a,b)=>b-a);
  return (l[0]+0.05)/(l[1]+0.05);
}

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];
try {
  for(const width of [320,390,768,1366]){
    const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(width+': '+e.message));
    await page.route('https://esm.sh/**', async route=>{
      const url=route.request().url();
      const source=url.includes('@supabase/supabase-js')?fakeSupabase:
        url.includes('chart.js')?fakeChart:fakeMermaid;
      await route.fulfill({status:200,contentType:'application/javascript',
        headers:{'access-control-allow-origin':'*'},body:source});
    });
    await page.goto(site, {waitUntil:'load'});
    await page.waitForURL('**/qa.html');
    await page.waitForLoadState('load');
    await page.locator('#auth-screen').waitFor({state:'visible'});
    assert.equal(await page.locator('#auth-screen').isVisible(),true);
    assert.equal(await page.locator('#auth-form').count(),1);
    let overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,'Auth screen horizontal overflow at '+width+': '+overflow);

    await page.locator('#auth-email').fill('qa.fixture@example.test');
    await page.locator('#auth-password').fill('OnlyForAutomatedTests123!');
    await page.locator('#auth-submit').click();
    await page.locator('#shell').waitFor({state:'visible',timeout:8500}).catch(async error=>{
      const info=await page.evaluate(()=>({
        authMessage:document.querySelector('#toast')?.innerText,
        authWarning:document.querySelector('#auth-warning')?.innerText,
        shellHidden:document.querySelector('#shell')?.hidden,
        scriptLoaded:document.querySelector('#auth-submit')?.getAttribute('aria-busy')
      }));
      console.error('QA AUTH DIAGNOSTIC',JSON.stringify(info),'PAGE ERRORS',errors);
      throw error;
    });
    await page.locator('#view-dashboard').waitFor({state:'visible'});
    assert.equal(await page.locator('#user-role').innerText(),'Testador');
    overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    if(overflow>1){
      const exceeding=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>{
        const r=el.getBoundingClientRect();
        return {tag:el.tagName,id:el.id,cls:String(el.className).slice(0,80),right:Math.round(r.right),width:Math.round(r.width)};
      }).filter(el=>el.right>innerWidth+1).slice(0,12));
      console.log('Overflow details',width,JSON.stringify(exceeding));
    }
    assert.ok(overflow<=1,'Dashboard horizontal overflow at '+width+': '+overflow);

    if(width<=768){
      const menu=page.locator('#menu-button');
      assert.equal(await menu.locator('svg.menu-icon').count(),1);
      const menuColors = await menu.evaluate(button => {
        const style = getComputedStyle(button);
        return { foreground: style.color, background: style.backgroundColor, visible: button.offsetParent !== null };
      });
      assert.equal(menuColors.visible,true,'menu button hidden at '+width);
      assert.ok(contrast(menuColors.foreground, menuColors.background)>=7,
        'mobile menu lacks visible contrast at '+width+': '+JSON.stringify(menuColors));
      await menu.click();
      assert.equal(await menu.getAttribute('aria-expanded'),'true');
      assert.equal(await page.locator('#sidebar-backdrop').isVisible(),true);
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'),'false');
      assert.equal(await page.locator('#sidebar-backdrop').isVisible(),false);
      await menu.click();
      await page.locator('#sidebar-backdrop').click({position:{x:width-4,y:500}});
      assert.equal(await menu.getAttribute('aria-expanded'),'false');
    }

    await page.locator('#new-task').click();
    await page.locator('#view-editor').waitFor({state:'visible'});
    assert.equal(await page.locator('#editor-fields').isVisible(),false);
    assert.equal(await page.locator('#assist-panel').isVisible(),true);
    assert.equal(await page.locator('#save-task').isVisible(),false);
    assert.equal(await page.locator('#ai-loading-modal').isVisible(),false);
    assert.equal(await page.locator('#assist-loading').count(),0);
    assert.equal(await page.locator('#task-detail-tabs').isVisible(),false);
    assert.equal(await page.locator('#assist-status').count(),0);
    assert.equal(await page.locator('#assist-result').count(),0);
    assert.equal(await page.locator('#assist-error').isVisible(),false);
    assert.equal(await page.locator('#task-form #save-task').count(),1);
    assert.equal(await page.locator('#assist-device').isVisible(),false);
    if(width===320||width===1366){
      await page.screenshot({path:'artifacts/ui/qa-entry-'+width+'.png',fullPage:true});
    }
    if(width===768){
      await page.locator('#assist-manual').click();
      assert.equal(await page.locator('#editor-fields').isVisible(),true);
      assert.equal(await page.locator('#task-detail-tabs').isVisible(),false);
      assert.equal(await page.locator('#assist-back').isVisible(),true);
      await page.locator('#assist-back').click();
      assert.equal(await page.locator('#assist-panel').isVisible(),true);
      assert.equal(await page.locator('#editor-fields').isVisible(),false);
    }
    await page.locator('#assist-text').fill(`TF 67866 — Inclusão de produto
O QUE FOI TESTADO:
Validar inclusão pelo catálogo.
CENÁRIOS TESTADOS:
CENÁRIO 1 - Incluir produto
- Abrir catálogo
- Incluir produto`);
    assert.equal(await page.locator('#save-status').isVisible(),false);
    if(width===390){
      assert.equal(await page.locator('#assist-consent').count(),0);
      await page.locator('#assist-ai').click();
      await page.locator('#ai-loading-modal').waitFor({state:'visible'});
      assert.equal(await page.locator('#ai-loading-modal .ai-loading-spinner').count(),1);
      assert.equal(await page.locator('#editor-fields').isVisible(),false);
      assert.equal(await page.locator('#assist-ai').isDisabled(),true);
      assert.equal(await page.locator('#assist-panel').getAttribute('aria-busy'),'true');
      assert.equal(await page.locator('#assist-loading').count(),0);
      assert.equal(await page.locator('#assist-status').count(),0);
      assert.equal(await page.locator('#toast').isVisible(),false);
      await page.screenshot({path:'artifacts/ui/qa-loading-390.png',fullPage:true});
    }else{
      await page.locator('#assist-local').click();
    }
    await page.locator('#editor-fields').waitFor({state:'visible'});
    assert.equal(await page.locator('#assist-panel').isVisible(),false);
    assert.equal(await page.locator('#ai-loading-modal').isVisible(),false);
    assert.equal(await page.locator('#task-detail-tabs').isVisible(),false);
    assert.equal(await page.locator('#save-task').isVisible(),true);
    assert.equal(await page.locator('.wizard-review-heading').count(),0);
    assert.equal(await page.locator('#task-form #assist-back').count(),1);
    assert.equal(await page.locator('#draft-scenario-review').isVisible(),true);
    assert.equal(await page.locator('#draft-scenario-list input[type="checkbox"]').count(),1);
    assert.match(await page.locator('#draft-scenario-list').innerText(),/Incluir produto/);
    if(width===320){
      await page.locator('#draft-scenario-list input[type="checkbox"]').uncheck();
      assert.match(await page.locator('#draft-scenario-count').innerText(),/0 de 1/);
    }
    assert.match(await page.locator('#editor-caption').innerText(),/1 caso/);
    assert.equal(await page.locator('#task-extra-details').evaluate(el=>el.open),false);
    assert.equal(await page.locator('#task-analysis-details').evaluate(el=>el.open),false);
    const saveIsAtBottom=await page.evaluate(()=>{
      const form=document.querySelector('#task-form');
      const save=form.querySelector('#save-task');
      const conclusion=form.querySelector('[name="conclusao"]');
      return save!==null &&
        save.getBoundingClientRect().top>conclusion.getBoundingClientRect().bottom &&
        !document.querySelector('.editor-heading #save-task');
    });
    assert.equal(saveIsAtBottom,true,'Save TF must remain below the form content');
    if(width===320||width===1366){
      await page.screenshot({path:'artifacts/ui/qa-review-'+width+'.png',fullPage:true});
    }
    assert.equal(await page.locator('#task-form input[name="codigo"]').inputValue(),'67866');
    assert.equal(await page.locator('#task-form select[name="status"]').inputValue(),'rascunho');
    assert.equal(await page.locator('#task-visibility').inputValue(),'false');
    if(width===1366||width===390){
      await page.locator('#task-visibility').selectOption('true');
    }
    const title=page.locator('#task-form input[name="titulo"]');
    await title.fill('Teste de responsividade '+width);
    if(!(await page.locator('#save-status').isVisible())){
      const details=await page.evaluate(()=>{
        const n=document.querySelector('#save-status');
        return {node:n?.outerHTML,display:n?getComputedStyle(n).display:null,
          parent:n?.parentElement?.outerHTML.slice(0,450),
          title:document.querySelector('#task-form input[name="titulo"]').value,
          hash:location.hash};
      });
      console.log('SAVE STATUS DIAGNOSTIC',width,JSON.stringify(details),'BROWSER ERRORS',errors);
    }
    assert.equal(await page.locator('#save-status').isVisible(),true);
    page.once('dialog',dialog=>dialog.dismiss());
    await page.evaluate(()=>{location.hash='#/tarefas'});
    await page.waitForFunction(()=>location.hash==='#/nova');
    assert.equal(await title.inputValue(),'Teste de responsividade '+width);
    assert.equal(await page.locator('#save-status').isVisible(),true);

    await page.locator('#save-task').click();
    await page.waitForFunction(()=>location.hash.startsWith('#/tarefa/'));
    await page.waitForFunction((expected)=>document.querySelector('#scenarios-number').textContent===String(expected),width===320?0:1);
    assert.equal(await page.locator('#task-detail-tabs').isVisible(),true);
    const firstTab=page.locator('#tab-btn-resumo');
    await firstTab.focus();
    await firstTab.press('ArrowRight');
    assert.equal(await page.locator('#tab-btn-cenarios').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#tab-cenarios').isVisible(),true);
    await page.locator('#tab-btn-resumo').click();
    assert.equal(await page.locator('#assist-back').isVisible(),false);
    assert.equal(await page.locator('#save-status').isVisible(),false);
    if(width===1366||width===390){
      assert.equal(await page.locator('#task-visibility').inputValue(),'true');
      assert.equal(await page.locator('#task-public-link').isVisible(),true);
      assert.match(await page.locator('#task-public-link').getAttribute('href'),/public\.html\?tf=/);
    }else{
      assert.equal(await page.locator('#task-public-link').isVisible(),false);
    }
    if(width===390||width===1366){
      // Scenario actions open dialogs without resetting the active tab or
      // scrolling down to forms appended after the TF.
      await page.locator('#tab-btn-cenarios').click();
      const selectedBefore=await page.locator('#tab-btn-cenarios').getAttribute('aria-selected');
      assert.equal(selectedBefore,'true');
      await page.locator('[data-edit-scenario]').first().click();
      await page.locator('#scenario-dialog').waitFor({state:'visible'});
      assert.equal(await page.locator('#tab-btn-cenarios').getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('#scenario-dialog').evaluate(el=>el.open),true);
      assert.equal(await page.locator('#scenario-form').isVisible(),true);
      await page.locator('#scenario-form input[name="titulo"]').fill('Cenário alterado e revisado');
      await page.locator('#cancel-scenario').click();
      await page.locator('#record-confirm-dialog').waitFor({state:'visible'});
      assert.match(await page.locator('#record-confirm-title').innerText(),/Descartar/);
      await page.locator('#record-confirm-cancel').click();
      assert.equal(await page.locator('#scenario-dialog').evaluate(el=>el.open),true);
      await page.locator('#cancel-scenario').click();
      await page.locator('#record-confirm-accept').click();
      await page.locator('#scenario-dialog').waitFor({state:'hidden'});
      assert.equal(await page.locator('#tab-btn-cenarios').getAttribute('aria-selected'),'true');

      await page.locator('[data-edit-scenario]').first().click();
      await page.locator('#scenario-form input[name="titulo"]').fill('Cenário editado por modal');
      await page.locator('#scenario-form button[type="submit"]').click();
      await page.locator('#scenario-dialog').waitFor({state:'hidden'});
      assert.equal(await page.locator('#tab-btn-cenarios').getAttribute('aria-selected'),'true');
      assert.match(await page.locator('#scenarios-list').innerText(),/Cenário editado por modal/);

      await page.locator('[data-delete-scenario]').first().click();
      await page.locator('#record-confirm-dialog').waitFor({state:'visible'});
      assert.match(await page.locator('#record-confirm-title').innerText(),/Excluir cenário/);
      await page.locator('#record-confirm-cancel').click();
      assert.equal(await page.locator('#scenarios-number').innerText(),'1');
      await page.locator('[data-delete-scenario]').first().click();
      await page.locator('#record-confirm-accept').click();
      await page.waitForFunction(()=>document.querySelector('#scenarios-number').textContent==='0');
      assert.equal(await page.locator('#tab-btn-cenarios').getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('#tab-cenarios').isVisible(),true);
      assert.equal(await page.locator('#tab-resumo').isVisible(),false);

      await page.locator('#add-scenario').click();
      await page.locator('#scenario-dialog').waitFor({state:'visible'});
      await page.locator('#scenario-form input[name="titulo"]').fill('Cenário novo no modal');
      await page.locator('#scenario-form textarea[name="passos"]').fill('1. Abrir tela de vendas');
      await page.locator('#scenario-form button[type="submit"]').click();
      await page.locator('#scenario-dialog').waitFor({state:'hidden'});
      await page.waitForFunction(()=>document.querySelector('#scenarios-number').textContent==='1');
      assert.match(await page.locator('#scenarios-list').innerText(),/Cenário novo no modal/);
      assert.equal(await page.locator('#tab-btn-cenarios').getAttribute('aria-selected'),'true');
      await page.screenshot({path:'artifacts/ui/scenario-modal-workflow-'+width+'.png',fullPage:true});
    }
    if(width===390||width===1366){
      await page.locator('#tab-btn-diagramas').click();
      await page.locator('#add-diagram').click();
      await page.locator('#diagram-form').waitFor({state:'visible'});
      await page.locator('#diagram-dialog').waitFor({state:'visible'});
      assert.equal(await page.locator('#tab-btn-diagramas').getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('#diagram-ai-text-wrap').isVisible(),false);
      if(width===390){
        await page.locator('input[name="diagram-ai-origin"][value="text"]').check();
        await page.locator('#diagram-ai-text').fill('Abrir pedido, verificar estoque e concluir pedido.');
      }
      await page.locator('#diagram-generate').click();
      await page.locator('#diagram-ai-progress').waitFor({state:'visible'});
      await page.waitForFunction(()=>document.querySelector('#diagram-source').value.startsWith('flowchart LR'));
      await page.waitForFunction(()=>document.querySelector('#diagram-ai-progress').hidden===true);
      await page.locator('#zoom-diagram-preview').click();
      await page.locator('#diagram-viewer').waitFor({state:'visible'});
      const initialZoom=await page.locator('#diagram-zoom-label').innerText();
      await page.locator('[data-viewer="plus"]').click();
      const higherZoom=await page.locator('#diagram-zoom-label').innerText();
      assert.notEqual(higherZoom,initialZoom,'Zoom should update');
      await page.locator('[data-viewer="fit"]').click();
      await page.locator('[data-viewer="close"]').click();
      await page.locator('#diagram-form button[type="submit"]').click();
      await page.locator('#diagram-dialog').waitFor({state:'hidden'});
      await page.waitForFunction(()=>document.querySelector('#diagrams-number').textContent==='1');
      assert.equal(await page.locator('#tab-btn-diagramas').getAttribute('aria-selected'),'true');
      await page.locator('[data-zoom-diagram]').click();
      await page.locator('#diagram-viewer').waitFor({state:'visible'});
      await page.locator('[data-viewer="close"]').click();

      await page.locator('[data-edit-diagram]').click();
      await page.locator('#diagram-dialog').waitFor({state:'visible'});
      await page.locator('#diagram-form input[name="titulo"]').fill('Fluxo atualizado no modal');
      await page.locator('#diagram-form button[type="submit"]').click();
      await page.locator('#diagram-dialog').waitFor({state:'hidden'});
      assert.match(await page.locator('#diagrams-list').innerText(),/Fluxo atualizado no modal/);
      assert.equal(await page.locator('#tab-btn-diagramas').getAttribute('aria-selected'),'true');
      await page.locator('[data-delete-diagram]').click();
      await page.locator('#record-confirm-dialog').waitFor({state:'visible'});
      await page.locator('#record-confirm-accept').click();
      await page.waitForFunction(()=>document.querySelector('#diagrams-number').textContent==='0');
      assert.equal(await page.locator('#tab-btn-diagramas').getAttribute('aria-selected'),'true');
    }
    await page.locator('#sidebar .navigation a[data-route="tarefas"]').evaluate(el=>el.click());
    await page.locator('#view-tarefas').waitFor({state:'visible'});
    assert.equal(await page.locator('#task-list .task-item').count(),1);
    await page.locator('#task-search').fill('inexistente-'+width);
    assert.equal(await page.locator('[data-clear-filters]').count(),1);
    await page.locator('[data-clear-filters]').click();
    assert.equal(await page.locator('#task-list .task-item').count(),1);

    const contrastRatio=await page.evaluate(()=>{
      const el=document.querySelector('.task-title small');
      const s=getComputedStyle(el);
      return {fg:s.color,bg:getComputedStyle(document.querySelector('.panel')).backgroundColor};
    });
    assert.ok(contrast(contrastRatio.fg,contrastRatio.bg)>=4.5,
      'Task metadata insufficient contrast at '+width);
    overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,'Task list horizontal overflow at '+width+': '+overflow);
    await page.screenshot({path:'artifacts/ui/qa-'+width+'.png',fullPage:true});
    await context.close();
    console.log('PASS '+width+'px: login, layout, mobile nav, tabs, draft guard, save, filters, contrast');
  }
  // Public gallery: guest can view only explicitly published TFs and related records.
  for(const width of [390,1366]){
    const context=await browser.newContext({viewport:{width,height:844}});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push('public '+width+': '+e.message));
    await page.route('https://esm.sh/**', async route=>{
      const url=route.request().url();
      const source=url.includes('@supabase/supabase-js')?fakeSupabase:
        url.includes('chart.js')?fakeChart:fakeMermaid;
      await route.fulfill({status:200,contentType:'application/javascript',
        headers:{'access-control-allow-origin':'*'},body:source});
    });
    await page.goto(site+'public.html',{waitUntil:'load'});
    await page.waitForFunction(()=>document.querySelector('#public-list-count').textContent.includes('1 TF'));
    assert.equal(await page.locator('.public-task-card').count(),1);
    assert.match(await page.locator('#public-list').innerText(),/TF exemplo pública/);
    assert.doesNotMatch(await page.locator('#public-list').innerText(),/secreta/);
    await page.locator('.public-task-card').click();
    await page.locator('#public-detail').waitFor({state:'visible'});
    assert.match(await page.locator('#public-scenario-list').innerText(),/Cenário compartilhado/);
    assert.match(await page.locator('#public-diagram-list').innerText(),/Fluxo compartilhado/);
    assert.doesNotMatch(await page.locator('#public-detail').innerText(),/Cenário secreto|Fluxo secreto/);
    await page.locator('.public-diagram button').click();
    await page.locator('#diagram-viewer').waitFor({state:'visible'});
    await page.locator('[data-viewer="plus"]').click();
    await page.locator('[data-viewer="close"]').click();
    await page.screenshot({path:'artifacts/ui/public-'+width+'.png',fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,'Public gallery overflow at '+width+': '+overflow);
    await page.goto(site+'public.html?tf=22222222-2222-4222-8222-222222222222');
    await page.locator('#public-error').waitFor({state:'visible'});
    assert.match(await page.locator('#public-error').innerText(),/não é pública/);
    await context.close();
    console.log('PASS public '+width+'px: guest, public read, private isolation, diagrams and zoom');
  }
  assert.deepEqual(errors,[],'Unexpected browser JavaScript exceptions');
  console.log('QA UI smoke: all Chromium viewport tests passed');
} finally {
  await browser.close();
}
