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
    qa_admins:[],
    qa_documentos:[],qa_releases:[],qa_release_tarefas:[],qa_artefatos:[],qa_referencias:[],
    qa_evidencias:[],qa_eventos:[],qa_generator_posts:[],
    qa_requisito_fontes:[],qa_requisitos:[],
    qa_generator_tests:[{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      user_id:'55555555-5555-4555-8555-555555555555',
      ts:1750000000000,titulo:'Roteiro legado',
      md:'## Cenário 01 — Importação histórica\\n### Passos\\n1. Abrir pedido\\n### Resultado esperado\\n- Pedido listado',
      exec:{'Cenário 01 — Importação histórica':{s:'OK',o:'FUNCIONANDO:'}}
    }]
  };
  window.__qaR1Rows=tables;
  let user=null;
  let nextId=0;
  const storageObjects=new Map();
  function from(table){
    let kind='read',payload=null,conditions={};
    function rows(){return (tables[table]||[]).filter(row=>
      Object.entries(conditions).every(([key,val])=>row[key]===val));}
    function execute(){
      if(kind==='insert'){
        const added=(Array.isArray(payload)?payload:[payload]).map(row=>({
          ...row,id:row.id||'33333333-3333-4333-8333-'+String(++nextId).padStart(12,'0'),
          created_at: new Date().toISOString()
        }));
        tables[table].push(...added);
        if(['qa_evidencias','qa_cenarios'].includes(table)){
          for(const row of added){
            tables.qa_eventos.push({
              id:'audit-'+(++nextId),tarefa_id:row.tarefa_id,
              acao:table==='qa_evidencias'?'evidencia.criada':'cenario.criado',
              detalhes:table==='qa_evidencias'?{tipo:row.tipo}:{status:row.status},
              created_at:new Date().toISOString()
            });
          }
        }
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
      range(start,end){const result=execute();return Promise.resolve({data:result.data.slice(start,end+1),error:null})},
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
    storage:{
      from(bucket){
        return {
          async upload(path,file,options){
            if(bucket!=='qa-requisitos'||!user||!path.startsWith(user.id+'/')||
                storageObjects.has(path))
              return {data:null,error:{message:'Upload não autorizado'}};
            storageObjects.set(path,{file,size:file.size,mime:options.contentType});
            return {data:{path},error:null};
          },
          async download(path){
            const object=storageObjects.get(path);
            if(bucket!=='qa-requisitos'||!user||!path.startsWith(user.id+'/')||!object)
              return {data:null,error:{message:'Download não autorizado'}};
            return {data:object.file,error:null};
          },
          async remove(paths){
            for(const path of paths){
              if(!path.startsWith(user.id+'/')||
                tables.qa_requisito_fontes.some(x=>x.storage_path===path))
                return {data:null,error:{message:'Somente uploads órfãos podem ser removidos'}};
              storageObjects.delete(path);
            }
            return {data:paths,error:null};
          }
        };
      }
    },
    async rpc(name,args){
      if(name==='qa_register_requirement_file'){
        const task=tables.qa_tarefas.find(t=>t.id===args.p_tarefa_id);
        const object=storageObjects.get(args.p_path);
        if(!user||!task||task.user_id!==user.id||!object||
            !args.p_path.startsWith(user.id+'/'+task.id+'/'))
          return {data:null,error:{message:'TF ou arquivo sem permissão'}};
        if(object.size!==args.p_tamanho||object.mime!==args.p_mime)
          return {data:null,error:{message:'Metadados inválidos'}};
        if(tables.qa_requisito_fontes.some(x=>x.tarefa_id===task.id&&
          x.tipo_fonte==='arquivo'&&x.hash===args.p_sha256))
          return {data:null,error:{message:'Este arquivo já foi anexado à TF'}};
        const versions=tables.qa_requisito_fontes.filter(x=>x.tarefa_id===task.id&&
          x.tipo_fonte==='arquivo'&&x.nome_arquivo.toLowerCase()===args.p_nome.toLowerCase());
        const version=Math.max(0,...versions.map(x=>x.versao||0))+1;
        const source={
          id:'44444444-4444-4444-8444-'+String(++nextId).padStart(12,'0'),
          tarefa_id:task.id,user_id:user.id,tipo_fonte:'arquivo',
          nome_arquivo:args.p_nome,storage_path:args.p_path,mime:args.p_mime,
          tamanho_arquivo:args.p_tamanho,hash:args.p_sha256,
          texto_extraido:args.p_texto_extraido||'',versao:version,
          created_at:new Date().toISOString()
        };
        tables.qa_requisito_fontes.push(source);
        return {data:{id:source.id,tarefa_id:task.id,versao:version},error:null};
      }
      if(name==='qa_import_requisitos_da_fonte'){
        const task=tables.qa_tarefas.find(t=>t.id===args.p_tarefa_id);
        const source=tables.qa_requisito_fontes.find(x=>x.id===args.p_fonte_id&&
          x.tarefa_id===args.p_tarefa_id&&x.user_id===user?.id);
        if(!task||!source||task.user_id!==user?.id)
          return {data:null,error:{message:'TF ou fonte sem permissão'}};
        let inserted=0,skipped=0;
        for(const row of args.p_itens){
          if(tables.qa_requisitos.some(x=>x.tarefa_id===task.id&&x.codigo===row.codigo)){
            skipped++;continue;
          }
          tables.qa_requisitos.push({
            ...row,id:'44444444-4444-4444-8444-'+String(++nextId).padStart(12,'0'),
            tarefa_id:task.id,user_id:user.id,fonte_id:source.id,
            created_at:new Date().toISOString()
          });
          inserted++;
        }
        return {data:{tarefa_id:task.id,fonte_id:source.id,inserted,skipped},error:null};
      }
      if(name==='qa_import_requisitos'){
        const task=tables.qa_tarefas.find(t=>t.id===args.p_tarefa_id);
        if(!task||task.user_id!==user?.id)
          return {data:null,error:{message:'TF sem permissão'}};
        if(!Array.isArray(args.p_itens)||args.p_itens.length<1)
          return {data:null,error:{message:'Itens inválidos'}};
        const source={id:'44444444-4444-4444-8444-'+String(++nextId).padStart(12,'0'),
          tarefa_id:task.id,user_id:user.id,tipo_fonte:'texto',
          texto_extraido:args.p_texto,created_at:new Date().toISOString()};
        tables.qa_requisito_fontes.push(source);
        let inserted=0,skipped=0;
        for(const row of args.p_itens){
          if(tables.qa_requisitos.some(q=>q.tarefa_id===task.id&&q.codigo===row.codigo)){
            skipped++;continue;
          }
          tables.qa_requisitos.push({
            ...row,id:'44444444-4444-4444-8444-'+String(++nextId).padStart(12,'0'),
            tarefa_id:task.id,user_id:user.id,fonte_id:source.id,
            created_at:new Date().toISOString()
          });
          inserted++;
        }
        if(!inserted)tables.qa_requisito_fontes.pop();
        return {data:{tarefa_id:task.id,fonte_id:inserted?source.id:null,inserted,skipped},error:null};
      }
      if(name==='qa_attach_generated_cases'){
        const task=tables.qa_tarefas.find(t=>t.id===args.p_tarefa_id);
        if(!task||task.user_id!==user?.id)return {data:null,error:{message:'TF sem permissão'}};
        let inserted=0,skipped=0;
        for(const row of args.p_itens){
          const same=tables.qa_cenarios.some(s=>s.tarefa_id===task.id&&
            (s.origem_geracao===args.p_geracao_id&&s.origem_item===row.source_index));
          if(same){skipped++;continue}
          const item={...row,id:'33333333-3333-4333-8333-'+String(++nextId).padStart(12,'0'),
            tarefa_id:task.id,user_id:user.id,ordem:1,status:'nao_executado',
            obtido:'',origem_geracao:args.p_geracao_id,origem_item:row.source_index};
          tables.qa_cenarios.push(item);
          tables.qa_eventos.push({id:'audit-'+(++nextId),tarefa_id:task.id,
            acao:'cenario.criado',detalhes:{status:'nao_executado'},
            created_at:new Date().toISOString()});
          inserted++;
        }
        return {data:{inserted,skipped,tarefa_id:task.id},error:null};
      }
      if(name==='qa_link_release'){
        const task=tables.qa_tarefas.find(t=>t.id===args.p_tarefa_id);
        if(!task||task.user_id!==user?.id)return {data:null,error:{message:'TF sem permissão'}};
        let release=tables.qa_releases.find(x=>x.user_id===user.id&&x.versao===args.p_versao);
        if(!release){release={id:'44444444-4444-4444-8444-444444444444',user_id:user.id,versao:args.p_versao,created_at:new Date().toISOString()};tables.qa_releases.push(release)}
        if(!tables.qa_release_tarefas.some(x=>x.tarefa_id===task.id&&x.release_id===release.id))
          tables.qa_release_tarefas.push({tarefa_id:task.id,release_id:release.id,user_id:user.id});
        return {data:release.id,error:null};
      }
      if(name!=='qa_save_document')return {data:null,error:{message:'RPC desconhecida'}};
      const parent=tables.qa_tarefas.find(t=>t.id===args.p_tarefa_id);
      if(!parent || parent.user_id!==user?.id)
        return {data:null,error:{message:'TF sem permissão'}};
      const versions=tables.qa_documentos.filter(doc=>doc.tarefa_id===parent.id&&doc.tipo===args.p_tipo);
      const latest=versions.sort((a,b)=>b.versao-a.versao)[0];
      if(latest&&latest.titulo===args.p_titulo&&latest.conteudo===args.p_conteudo)
        return {data:latest,error:null};
      const saved={
        id:'test-doc-'+(++nextId),tarefa_id:parent.id,user_id:parent.user_id,
        tipo:args.p_tipo,titulo:args.p_titulo,conteudo:args.p_conteudo,
        origem:args.p_origem,versao:(latest?.versao||0)+1,
        created_at:new Date().toISOString()
      };
      tables.qa_documentos.push(saved);
      return {data:saved,error:null};
    },
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
        user={id:'55555555-5555-4555-8555-555555555555',email};
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


    // The legacy generator modules must behave as native routes of the QA Hub shell.
    await page.locator('#sidebar .navigation a[data-route="ferramentas/post"]').evaluate(el=>el.click());
    await page.locator('#view-ferramentas').waitFor({state:'visible'});
    assert.equal(await page.locator('#tool-view-title').innerText(),'Posts do fórum');
    const tool=page.frameLocator('#tool-frame');
    await tool.locator('#t').waitFor({state:'visible',timeout:12000});
    const requirementHeight=await tool.locator('#r').evaluate(node=>node.getBoundingClientRect().height);
    assert.ok(requirementHeight<=130,'Embedded optional requirement must stay compact at '+width+': '+requirementHeight);
    assert.equal(await tool.locator('nav').isVisible(),false,'No duplicate tool navigation');
    assert.equal(await context.pages().length,1,'Tool navigation must not open another tab');
    assert.equal(await page.locator('#sidebar .navigation a[data-route="ferramentas/post"]').getAttribute('aria-current'),'page');
    const source=await page.locator('#tool-frame').getAttribute('src');
    await tool.locator('#t').fill('QA Hub mantém o conteúdo ao alternar ferramentas');
    await page.locator('#sidebar .navigation a[data-route="ferramentas/diff"]').evaluate(el=>el.click());
    await page.locator('#native-diff').waitFor({state:'visible'});
    assert.equal(await page.locator('#tool-frame').isVisible(),false,'Native text tool should not use an iframe');
    await page.locator('#native-diff textarea').first().fill('Pedido\nAntes');
    await page.locator('#native-diff textarea').last().fill('Pedido\nDepois');
    await page.locator('#native-diff .qa-native-actions > button').first().click();
    assert.match(await page.locator('#native-diff .qa-native-output').innerText(),/1 adicionada/);
    await page.evaluate(()=>document.activeElement?.blur());
    await page.screenshot({path:'artifacts/ui/qa-native-diff-'+width+'.png',fullPage:true});
    await page.locator('#sidebar .navigation a[data-route="ferramentas/xml"]').evaluate(el=>el.click());
    await page.locator('#native-xml').waitFor({state:'visible'});
    await page.locator('#native-xml textarea').first().fill('<root><item a="1"/></root>');
    await page.locator('#native-xml textarea').last().fill('<root><item a="2"/></root>');
    await page.locator('#native-xml .qa-native-actions > button').first().click();
    assert.match(await page.locator('#native-xml .qa-native-output').innerText(),/ATRIBUTO/);
    const checkboxSize=await page.locator('#native-xml input[type=checkbox]').evaluate(node=>{
      const rect=node.getBoundingClientRect();return {width:rect.width,height:rect.height};
    });
    assert.ok(checkboxSize.width<=24&&checkboxSize.height<=24,
      'XML checkbox should not inherit full-size text input dimensions at '+width+': '+JSON.stringify(checkboxSize));
    await page.evaluate(()=>document.activeElement?.blur());
    await page.screenshot({path:'artifacts/ui/qa-native-xml-'+width+'.png',fullPage:true});
    await page.locator('#sidebar .navigation a[data-route="ferramentas/release"]').evaluate(el=>el.click());
    await page.locator('#native-release').waitFor({state:'visible'});
    await page.locator('#native-release input').first().fill('12.10.06.0000');
    await page.locator('#native-release .qa-native-release-grid textarea').first().fill('Status 12\n#67866 — BUG — Correção de pedido');
    await page.locator('#native-release .qa-native-actions > button').first().click();
    assert.match(await page.locator('#native-release .qa-native-output').innerText(),/Tarefas da Release/);
    const advanced=page.locator('#native-release .qa-native-advanced');
    assert.equal(await advanced.getAttribute('open'),null,'Optional release fields should be collapsed by default');
    await page.locator('#native-release .qa-native-advanced summary').click();
    assert.equal(await advanced.evaluate(node=>node.open),true,'Advanced release settings must be accessible');
    await page.locator('#native-release .qa-native-advanced summary').click();
    const visual=await page.locator('#native-release').evaluate(node=>{
      const box=node.getBoundingClientRect();
      const grid=node.querySelector('.qa-native-grid');
      const inputs=[...node.querySelectorAll('.qa-native-release-grid > .qa-native-field')].map(field=>{
        const rect=field.getBoundingClientRect();
        return {left:rect.left,right:rect.right,width:rect.width};
      });
      return {
        background:getComputedStyle(node).backgroundColor,
        border:getComputedStyle(node).borderTopWidth,
        radius:getComputedStyle(node).borderTopLeftRadius,
        columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        bounds:{left:box.left,right:box.right},
        inputs,
        overflow:document.documentElement.scrollWidth-innerWidth
      };
    });
    assert.equal(visual.background,'rgb(255, 255, 255)','Native tools must use the same white surface as QA Hub panels');
    assert.equal(visual.border,'1px','Native tools must use standard panel border');
    assert.ok(visual.inputs.every(input=>input.left>=visual.bounds.left-1&&input.right<=visual.bounds.right+1),
      'Release fields must stay inside panel at '+width+': '+JSON.stringify(visual));
    assert.ok(visual.overflow<=1,'Release tool page overflow at '+width+': '+visual.overflow);
    assert.equal(visual.columns,width>840?2:1,'Native release grid responds correctly at '+width);
    await page.evaluate(()=>document.activeElement?.blur());
    await page.screenshot({path:'artifacts/ui/qa-native-release-'+width+'.png',fullPage:true});
    await page.locator('#sidebar .navigation a[data-route="ferramentas/post"]').evaluate(el=>el.click());
    await page.waitForFunction(()=>document.querySelector('#tool-frame').contentDocument?.querySelector('#ttl')?.textContent==='Posts do fórum');
    assert.equal(await tool.locator('#t').inputValue(),'QA Hub mantém o conteúdo ao alternar ferramentas');
    assert.equal(await page.locator('#tool-frame').getAttribute('src'),source,'Tool changes should not reload the module');
    overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,'Integrated tools horizontal overflow at '+width+': '+overflow);
    await page.locator('#sidebar .navigation a[data-route="dashboard"]').evaluate(el=>el.click());
    await page.locator('#view-dashboard').waitFor({state:'visible'});

    await page.locator('#new-task').click();
    await page.locator('#view-editor').waitFor({state:'visible',timeout:8000}).catch(async err=>{
      const diagnostics=await page.evaluate(()=>({
        url:location.href,hash:location.hash,
        authHidden:document.querySelector('#auth-screen').hidden,
        dashboardHidden:document.querySelector('#view-dashboard').hidden,
        editorHidden:document.querySelector('#view-editor').hidden,
        toast:document.querySelector('#toast').textContent,
        activeNav:[...document.querySelectorAll('.navigation .active')].map(x=>x.getAttribute('data-route'))
      }));
      console.error('NEW TF NAVIGATION DIAGNOSTICS',width,JSON.stringify(diagnostics),'PAGE ERRORS',errors);
      throw err;
    });
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
      assert.equal(await page.locator('#task-detail-tabs').isVisible(),true);
      assert.equal(await page.locator('#tab-btn-cenarios').isDisabled(),true);
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
    assert.equal(await page.locator('#task-detail-tabs').isVisible(),true);
    assert.equal(await page.locator('#tab-btn-requisitos').isDisabled(),false);
    assert.equal(await page.locator('#tab-btn-cenarios').isDisabled(),true);
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
    // R1: draft requirements are reviewable before the TF exists and must
    // remain in memory until the original task is saved.
    await page.locator('#tab-btn-requisitos').click();
    assert.equal(await page.locator('#tab-requisitos').isVisible(),true);
    assert.equal(await page.locator('#requirements-file').isDisabled(),true,
      'An unsaved TF must not accept permanent file uploads');
    await page.locator('#requirements-source').fill(
      'RF001: O pedido deve recalcular o total após remover desconto.\n'+
      'Critérios de aceite:\n- O valor atualizado é exibido na tela.\n\n'+
      'RN001: O sistema impede percentuais negativos não permitidos.');
    await page.locator('#requirements-organize').click();
    assert.equal(await page.locator('#requirements-review .qa-req-preview-card').count(),2);
    assert.equal(await page.locator('#requirements-review .qa-req-preview-card input[type=text]').first().inputValue(),'RF-001');
    await page.locator('#requirements-approve').click();
    await page.locator('#requirements-save').click();
    assert.match(await page.locator('#requirements-feedback').innerText(),/Salvar TF/);
    assert.equal(await page.evaluate(()=>window.__qaR1Rows.qa_requisitos.length),0);
    assert.equal(await page.evaluate(()=>window.__qaR1Rows.qa_requisito_fontes.length),0);
    await page.screenshot({path:'artifacts/ui/qa-r1-preview-'+width+'.png',fullPage:true});
    await page.locator('#tab-btn-resumo').click();
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
    assert.equal(await page.locator('#tab-btn-cenarios').isDisabled(),false);
    await page.locator('#tab-btn-requisitos').click();
    await page.waitForFunction(()=>document.querySelector('#requirements-number').textContent==='2');
    assert.match(await page.locator('#requirements-count').innerText(),/2 aprovado/);
    assert.equal(await page.locator('#requirements-list .qa-req-saved').count(),2);
    assert.equal(await page.locator('#requirements-source').inputValue(),'');
    assert.equal(await page.evaluate(()=>window.__qaR1Rows.qa_requisitos.length),2);
    assert.equal(await page.evaluate(()=>window.__qaR1Rows.qa_requisito_fontes.length),1);
    // R2: private file upload, visible version history, local text extraction
    // and import of reviewed items into the same TF without duplicating it.
    assert.equal(await page.locator('#requirements-file').isDisabled(),false);
    const firstFile=Buffer.from(
      'RF003: O pedido deve registrar data de envio.\n\nRF004: O usuário consulta o histórico de alterações.','utf8');
    await page.locator('#requirements-file').setInputFiles({
      name:'requisitos.txt',mimeType:'text/plain',buffer:firstFile
    });
    await page.waitForFunction(()=>!document.querySelector('#requirements-file-save').disabled);
    assert.match(await page.locator('#requirements-file-preview').inputValue(),/RF003/);
    await page.locator('#requirements-file-save').click();
    await page.waitForFunction(()=>document.querySelector('#requirements-file-count').textContent.includes('1 arquivo'));
    assert.match(await page.locator('#requirements-file-list').innerText(),/requisitos.txt · v1/);
    assert.match(await page.locator('#requirements-source').inputValue(),/RF003/);
    assert.match(await page.locator('#requirements-active-file').innerText(),/Fonte vinculada/);
    await page.locator('#requirements-organize').click();
    assert.equal(await page.locator('#requirements-review .qa-req-preview-card').count(),2);
    await page.locator('#requirements-approve').click();
    await page.locator('#requirements-save').click();
    await page.waitForFunction(()=>document.querySelector('#requirements-number').textContent==='4');
    assert.equal(await page.evaluate(()=>window.__qaR1Rows.qa_requisitos.length),4);
    assert.equal(await page.evaluate(()=>window.__qaR1Rows.qa_requisito_fontes.length),2);
    const linked=await page.evaluate(()=>{
      const rows=window.__qaR1Rows;
      const src=rows.qa_requisito_fontes.find(s=>s.tipo_fonte==='arquivo');
      return {source:src,matched:rows.qa_requisitos.filter(req=>req.fonte_id===src.id).length};
    });
    assert.equal(linked.source.versao,1);
    assert.equal(linked.matched,2,'Imported requirements must reference the file source');

    // Uploading the same bytes twice is rejected before creating a second
    // permanent object or mutating the TF.
    await page.locator('#requirements-file').setInputFiles({
      name:'requisitos.txt',mimeType:'text/plain',buffer:firstFile
    });
    await page.waitForFunction(()=>document.querySelector('#requirements-file-feedback').textContent.includes('já está anexado'));
    assert.equal(await page.locator('#requirements-file-save').isDisabled(),true);

    // A changed document with the same name creates v2 without replacing v1.
    await page.locator('#requirements-file').setInputFiles({
      name:'requisitos.txt',mimeType:'text/plain',
      buffer:Buffer.from('RF005: O pedido permite consultar o comprovante atualizado.','utf8')
    });
    await page.waitForFunction(()=>!document.querySelector('#requirements-file-save').disabled);
    await page.locator('#requirements-file-save').click();
    await page.waitForFunction(()=>document.querySelector('#requirements-file-count').textContent.includes('2 arquivo'));
    assert.match(await page.locator('#requirements-file-list').innerText(),/requisitos.txt · v2/);
    assert.match(await page.locator('#requirements-file-list').innerText(),/requisitos.txt · v1/);
    await page.locator('#requirements-organize').click();
    await page.locator('#requirements-approve').click();
    await page.locator('#requirements-save').click();
    await page.waitForFunction(()=>document.querySelector('#requirements-number').textContent==='5');
    assert.equal(await page.evaluate(()=>window.__qaR1Rows.qa_requisito_fontes.length),3);
    assert.equal(await page.evaluate(()=>window.__qaR1Rows.qa_tarefas.filter(t=>t.user_id==='55555555-5555-4555-8555-555555555555').length),1,
      'R2 cannot create a duplicate TF');

    // A disguised PDF is rejected before any file upload.
    await page.locator('#requirements-file').setInputFiles({
      name:'invalido.pdf',mimeType:'application/pdf',
      buffer:Buffer.from('not a PDF document')
    });
    await page.waitForFunction(()=>document.querySelector('#requirements-file-feedback').textContent.includes('PDF válido'));
    assert.equal(await page.locator('#requirements-file-save').isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.__qaR1Rows.qa_requisito_fontes.length),3);
    await page.screenshot({path:'artifacts/ui/qa-r2-files-'+width+'.png',fullPage:true});
    assert.equal(await page.evaluate(()=>window.__qaR1Rows.qa_tarefas.filter(t=>t.user_id==='55555555-5555-4555-8555-555555555555').length),1,
      'R1 cannot create an extra TF');
    let reqOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(reqOverflow<=1,'Requirements panel overflow at '+width+': '+reqOverflow);
    await page.screenshot({path:'artifacts/ui/qa-r1-saved-'+width+'.png',fullPage:true});
    await page.locator('#tab-btn-resumo').click();
    const firstTab=page.locator('#tab-btn-resumo');
    await firstTab.focus();
    await firstTab.press('ArrowRight');
    assert.equal(await page.locator('#tab-btn-requisitos').getAttribute('aria-selected'),'true');
    await page.locator('#tab-btn-requisitos').press('ArrowRight');
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
      // Phase 2: results are persisted on the original scenario, never inferred.
      await page.locator('#tab-btn-execucao').click();
      await page.locator('#execution-list .qa-execution-case').waitFor({state:'visible'});
      assert.match(await page.locator('#execution-summary').innerText(),/1 não executados/);
      await page.locator('.qa-execution-fields select').selectOption('aprovado');
      await page.locator('.qa-execution-fields textarea').first().fill('Pedido abriu com o resultado esperado.');
      await page.locator('.qa-execution-actions button').first().click();
      await page.waitForFunction(()=>document.querySelector('#execution-summary').textContent.includes('1 aprovados'));
      await page.waitForFunction(()=>document.querySelector('#coverage-percent').textContent==='100%');
      assert.match(await page.locator('#coverage-detail').innerText(),/1 de 1 cenários/);
      assert.match(await page.locator('#scenarios-list').innerText(),/Pedido abriu com o resultado esperado/);
      await page.locator('#tab-btn-documentos').click();
      await page.locator('#document-generate-report').click();
      assert.match(await page.locator('#document-content').inputValue(),/Aprovados: 1/);
      assert.match(await page.locator('#document-content').inputValue(),/Pedido abriu com o resultado esperado/);
      await page.locator('#document-save').click();
      await page.waitForFunction(()=>document.querySelector('#document-status').textContent.includes('versão 1'));
      assert.equal(await page.locator('#documents-list .qa-document-row').count(),1);
      await page.locator('#document-content').fill((await page.locator('#document-content').inputValue())+'\nNota de revisão adicional.');
      await page.locator('#document-save').click();
      await page.waitForFunction(()=>document.querySelector('#document-status').textContent.includes('versão 2'));
      await page.locator('#tab-btn-historico').click();
      assert.equal(await page.locator('#documents-history .qa-document-row').count(),2);
      await page.locator('#documents-history .qa-document-row button').last().click();
      assert.equal(await page.locator('#tab-btn-documentos').getAttribute('aria-selected'),'true');
      assert.doesNotMatch(await page.locator('#document-content').inputValue(),/Nota de revisão adicional/);
      await page.screenshot({path:'artifacts/ui/qa-phase2-documents-'+width+'.png',fullPage:true});
       // Phase 3: release and reusable references are persisted under the TF.
       await page.locator('#tab-btn-vinculos').click();
       assert.equal(await page.locator('#tab-vinculos').isVisible(),true);
       await page.locator('#links-release-version').fill('12.10.06.0000');
       page.once('dialog',dialog=>dialog.accept());
       await page.locator('#links-release-save').click();
       await page.waitForFunction(()=>document.querySelector('#links-release-list').textContent.includes('12.10.06.0000'));
       await page.locator('#links-reference-title').fill('Checklist para pedido');
       await page.locator('#links-reference-content').fill('Validar mensagens e regras de desconto.');
       await page.locator('#links-reference-safe').check();
       await page.locator('#links-reference-save').click();
       await page.waitForFunction(()=>document.querySelector('#links-reference-list').textContent.includes('Checklist para pedido'));
       page.once('dialog',dialog=>dialog.accept());
       await page.locator('#links-reference-list .qa-phase3-actions button').nth(1).click();
       assert.equal(await page.locator('#tab-btn-documentos').getAttribute('aria-selected'),'true');
       assert.match(await page.locator('#document-content').inputValue(),/Validar mensagens e regras de desconto/);
       // Finish the document workflow so navigation does not discard the new draft.
       await page.locator('#document-save').click();
       await page.waitForFunction(()=>document.querySelector('#document-status').textContent.includes('versão 3'));
       await page.screenshot({path:'artifacts/ui/qa-phase3-links-'+width+'.png',fullPage:true});
       // Phase 4: imported legacy cases remain unexecuted, evidence is audited.
       await page.locator('#tab-btn-historico').click();
       await page.waitForFunction(()=>document.querySelector('#legacy-record').options.length>1);
       await page.locator('#legacy-record').selectOption('conta:teste:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
       await page.waitForFunction(()=>document.querySelectorAll('#legacy-case-list .qa-phase4-check').length===1);
       assert.match(await page.locator('#legacy-case-list').innerText(),/não executados/);
       page.once('dialog',dialog=>dialog.accept());
       await page.locator('#legacy-import-save').click();
       await page.waitForFunction(()=>document.querySelector('#legacy-status').textContent.includes('1 cenário(s)'));
       await page.locator('#tab-btn-cenarios').click();
       assert.match(await page.locator('#scenarios-list').innerText(),/Importação histórica/);
       await page.locator('#tab-btn-auditoria').click();
       await page.locator('#evidence-summary').fill('Conferido o fluxo de pedido nesta versão.');
       page.once('dialog',dialog=>dialog.accept());
       await page.locator('#evidence-save').click();
       await page.waitForFunction(()=>document.querySelector('#evidence-list').textContent.includes('Conferido o fluxo'));
       assert.match(await page.locator('#audit-list').innerText(),/Evidência adicionada/);
       await page.waitForFunction(()=>{
         const tab=document.querySelector('#tab-btn-auditoria').getBoundingClientRect();
         const bar=document.querySelector('#task-detail-tabs').getBoundingClientRect();
         return tab.left>=bar.left-2&&tab.right<=bar.right+2;
       });
       await page.evaluate(()=>document.activeElement?.blur());
       await page.screenshot({path:'artifacts/ui/qa-phase4-audit-'+width+'.png',fullPage:true});
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
