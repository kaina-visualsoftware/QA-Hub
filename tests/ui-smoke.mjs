// Real Chromium smoke tests with a deterministic, in-browser Supabase fake.
// All email addresses and TFs here are synthetic; no production account is accessed.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';

const site='http://127.0.0.1:8765/';
mkdirSync('artifacts/ui', {recursive:true});
const fakeSupabase = `
export function createClient(){
  const tables={qa_tarefas:[],qa_cenarios:[],qa_diagramas:[],qa_admins:[]};
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
const fakeMermaid=`export default {initialize(){},async render(){return {svg:'<svg></svg>'}}}`;

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
    await page.locator('#shell').waitFor({state:'visible'});
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
    const firstTab=page.locator('#tab-btn-resumo');
    await firstTab.focus();
    await firstTab.press('ArrowRight');
    assert.equal(await page.locator('#tab-btn-cenarios').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#tab-cenarios').isVisible(),true);
    await page.locator('#tab-btn-resumo').click();

    page.once('dialog',dialog=>dialog.dismiss());
    await page.evaluate(()=>{location.hash='#/tarefas'});
    await page.waitForFunction(()=>location.hash==='#/nova');
    assert.equal(await title.inputValue(),'Teste de responsividade '+width);
    assert.equal(await page.locator('#save-status').isVisible(),true);

    await page.locator('#save-task').click();
    await page.waitForFunction(()=>location.hash.startsWith('#/tarefa/'));
    assert.equal(await page.locator('#save-status').isVisible(),false);
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
  assert.deepEqual(errors,[],'Unexpected browser JavaScript exceptions');
  console.log('QA UI smoke: all Chromium viewport tests passed');
} finally {
  await browser.close();
}
