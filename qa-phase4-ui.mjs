import {saveTfDocument} from './qa-phase2.mjs';
import {attachReviewedCases,TASK_UUID} from './qa-workspace.mjs';
import {validateEvidence,legacyPreview,auditLabel,auditDetails} from './qa-phase4.mjs';

export function createPhase4Ui({db,getTask,getUserId,getScenarios,toast,onImported}){
  const $=id=>document.getElementById(id);
  const el=(tag,cls='',label='')=>{
    const e=document.createElement(tag);if(cls)e.className=cls;if(label)e.textContent=label;return e;
  };
  const status=(id,message)=>{$(id).textContent=message};
  const date=t=>t?new Date(t).toLocaleString('pt-BR'):'—';
  let activeTaskId=null,taskToken=0,evidence=[],audit=[],auditPage=0,auditHasMore=false;
  let legacyRecords=[],selectedLegacy=null,selectedKind='teste',legacyCases=[],generationId=null,loading=false;
  const owner=()=>getTask()?.user_id===getUserId();
  const scoped=()=>Boolean(getTask()&&getTask().id===activeTaskId);
  const errorMsg=e=>e?.message||String(e);
  const empty=(id,message)=>{$(id).append(el('p','muted fine',message))};

  function reset(){
    activeTaskId=null;taskToken++;evidence=[];audit=[];auditPage=0;auditHasMore=false;
    legacyRecords=[];selectedLegacy=null;legacyCases=[];generationId=null;
    for(const id of ['evidence-list','audit-list','legacy-case-list'])$(id).replaceChildren();
    $('legacy-record').replaceChildren(new Option('Selecione um histórico',''));
    $('legacy-content').value='';$('evidence-summary').value='';$('evidence-url').value='';
    $('audit-more').hidden=true;
    status('evidence-status','');status('legacy-status','');
  }
  function scenarioOptions(){
    const field=$('evidence-scenario');
    field.replaceChildren(new Option('Toda a TF',''));
    for(const scenario of getScenarios())field.add(new Option(scenario.titulo.slice(0,120),scenario.id));
  }
  function renderEvidence(){
    const list=$('evidence-list');list.replaceChildren();
    $('evidence-save').disabled=!owner()||loading;
    if(!owner())status('evidence-status','Somente o proprietário pode acrescentar evidências.');
    if(!evidence.length)empty('evidence-list','Nenhuma evidência registrada nesta TF.');
    for(const item of evidence){
      const card=el('article','qa-phase4-entry');
      card.append(el('strong','',item.tipo+' · '+date(item.created_at)));
      card.append(el('p','',item.resumo));
      if(item.referencia && /^https:\/\//i.test(item.referencia)){
        const link=el('a','qa-phase4-link','Abrir referência HTTPS');
        link.href=item.referencia;link.target='_blank';link.rel='noopener noreferrer';
        card.append(link);
      }
      list.append(card);
    }
  }
  async function fetchEvidence(taskId){
    const {data,error}=await db.from('qa_evidencias').select('*')
      .eq('tarefa_id',taskId).order('created_at',{ascending:false}).limit(100);
    if(error)throw error;
    if(activeTaskId!==taskId)return;
    evidence=data||[];renderEvidence();
  }
  function renderAudit(){
    const list=$('audit-list');list.replaceChildren();
    if(!audit.length)empty('audit-list','Ainda não há eventos auditados para esta TF.');
    for(const entry of audit){
      const card=el('article','qa-phase4-entry');
      card.append(el('strong','',auditLabel(entry)));
      const detail=auditDetails(entry);
      if(detail)card.append(el('p','',detail));
      card.append(el('small','',date(entry.created_at)));
      list.append(card);
    }
    $('audit-more').hidden=!auditHasMore;
  }
  async function loadAudit(taskId,page=0){
    const limit=30;
    const {data,error}=await db.from('qa_eventos')
      .select('id,acao,detalhes,created_at').eq('tarefa_id',taskId)
      .order('created_at',{ascending:false}).range(0,(page+1)*limit);
    if(error)throw error;
    if(activeTaskId!==taskId)return;
    audit=(data||[]).slice(0,(page+1)*limit);
    auditPage=page;
    auditHasMore=(data||[]).length>(page+1)*limit;
    renderAudit();
  }
  $('audit-more').addEventListener('click',async()=>{
    if(!scoped())return;
    $('audit-more').disabled=true;
    try{await loadAudit(activeTaskId,auditPage+1)}
    catch(e){toast('Erro ao buscar eventos: '+errorMsg(e),true)}
    finally{$('audit-more').disabled=false}
  });
  $('evidence-save').addEventListener('click',async()=>{
    if(!scoped()||!owner()||loading)return;
    const taskId=activeTaskId;loading=true;$('evidence-save').disabled=true;
    try{
      const values=validateEvidence({
        tipo:$('evidence-type').value,resumo:$('evidence-summary').value,
        referencia:$('evidence-url').value,cenario_id:$('evidence-scenario').value||null
      });
      if(!confirm('Salvar esta evidência na TF? O registro ficará preservado no histórico.'))return;
      const {data,error}=await db.from('qa_evidencias')
        .insert({...values,tarefa_id:taskId,user_id:getUserId()}).select('id').single();
      if(error)throw error;
      if(!data?.id)throw Error('Evidência não confirmada no banco.');
      $('evidence-summary').value='';$('evidence-url').value='';
      status('evidence-status','Evidência registrada na TF.');
      await Promise.all([fetchEvidence(taskId),loadAudit(taskId,0)]);
      toast('Evidência salva com rastreabilidade.');
    }catch(e){status('evidence-status',errorMsg(e));toast(errorMsg(e),true)}
    finally{loading=false;renderEvidence()}
  });

  function localHistory(kind){
    const key=kind==='teste'?'h_teste':'posts_v1';
    try{
      const raw=JSON.parse(localStorage.getItem(key)||'[]');
      return Array.isArray(raw)?raw.slice(0,80).filter(x=>x&&typeof x.md==='string')
        .map((entry,index)=>({...entry,_key:'local:'+kind+':'+(entry.id||index),_from:'navegador'})):[];
    }catch{return[]}
  }
  async function fetchLegacy(kind){
    const table=kind==='teste'?'qa_generator_tests':'qa_generator_posts';
    const {data,error}=await db.from(table).select('id,ts,titulo,md')
      .eq('user_id',getUserId()).order('ts',{ascending:false}).limit(80);
    if(error)throw error;
    return [
      ...(data||[]).filter(row=>typeof row.md==='string')
        .map(row=>({...row,_key:'conta:'+kind+':'+row.id,_from:'conta'})),
      ...localHistory(kind)
    ];
  }
  async function loadLegacy(kind){
    const taskId=activeTaskId,token=taskToken;
    legacyRecords=[];
    selectedLegacy=null;legacyCases=[];generationId=null;
    $('legacy-content').value='';
    $('legacy-record').replaceChildren(new Option('Carregando históricos',''));
    $('legacy-case-list').replaceChildren();
    status('legacy-status','');
    try{
      const results=await fetchLegacy(kind);
      if(token!==taskToken||taskId!==activeTaskId||kind!==$('legacy-kind').value)return;
      legacyRecords=results;
      $('legacy-record').replaceChildren(new Option('Selecione um histórico',''));
      for(const row of results){
        const timestamp=row.ts?date(Number(row.ts)):'data não registrada';
        const item=new Option((row.titulo||'Sem título').slice(0,100)+' · '+timestamp+
          ' ('+row._from+')',row._key);
        $('legacy-record').add(item);
      }
      if(!results.length)status('legacy-status','Nenhum histórico desta categoria encontrado.');
    }catch(e){$('legacy-record').replaceChildren(new Option('Indisponível',''));
      status('legacy-status','Falha ao carregar históricos: '+errorMsg(e))}
  }
  function renderLegacyCases(){
    const list=$('legacy-case-list');list.replaceChildren();
    if(selectedKind!=='teste')return;
    if(!selectedLegacy)return;
    try{
      const view=legacyPreview({...selectedLegacy,md:$('legacy-content').value},selectedKind,getScenarios());
      legacyCases=view.items;
      list.append(el('p','muted fine',view.summary));
      if(!legacyCases.length)list.append(el('p','muted fine','Nenhum título ## Cenário reconhecido. Corrija o roteiro antes de importar.'));
      for(const [index,item] of legacyCases.entries()){
        const row=el('label','qa-phase4-check');
        const check=el('input');check.type='checkbox';
        check.checked=item.selected&&!item.duplicate;
        check.disabled=item.duplicate;
        check.onchange=()=>{item.selected=check.checked};
        const summary=el('span','',item.titulo+
          (item.duplicate?' (já cadastrado ou duplicado)':''));
        row.append(check,summary);list.append(row);
      }
    }catch(e){legacyCases=[];list.append(el('p','muted fine',errorMsg(e)))}
  }
  $('legacy-kind').addEventListener('change',()=>{
    selectedKind=$('legacy-kind').value;
    if(scoped())loadLegacy(selectedKind).catch(e=>toast(errorMsg(e),true));
  });
  $('legacy-record').addEventListener('change',()=>{
    selectedLegacy=legacyRecords.find(x=>x._key===$('legacy-record').value)||null;
    $('legacy-content').value=selectedLegacy?.md||'';
    generationId=selectedLegacy&&TASK_UUID.test(String(selectedLegacy.id))
      ?selectedLegacy.id:crypto.randomUUID();
    renderLegacyCases();
  });
  $('legacy-content').addEventListener('input',renderLegacyCases);
  $('legacy-import-save').addEventListener('click',async()=>{
    if(loading||!scoped()||!owner())return status('legacy-status','Selecione uma TF própria.');
    if(!selectedLegacy)return status('legacy-status','Escolha um registro antes de importar.');
    const taskId=activeTaskId,markdown=$('legacy-content').value.trim();
    if(!markdown)return status('legacy-status','O conteúdo não pode estar vazio.');
    if(!confirm(selectedKind==='teste'
      ?'Adicionar os cenários selecionados à TF como NÃO EXECUTADOS? Resultados OK do histórico antigo serão ignorados.'
      :'Salvar este post revisado como nova versão privada da TF?'))return;
    loading=true;$('legacy-import-save').disabled=true;
    status('legacy-status','Importando após revisão...');
    try{
      if(selectedKind==='teste'){
        const selected=legacyCases.filter(item=>item.selected&&!item.duplicate);
        if(!selected.length)throw Error('Selecione ao menos um cenário completo que ainda não exista.');
        const result=await attachReviewedCases(db,{
          taskId,generationId,items:selected
        });
        status('legacy-status',(result.inserted||0)+' cenário(s) importado(s); '+(result.skipped||0)+' duplicado(s) ignorado(s).');
        await onImported('teste',taskId);
      }else{
        const title=String(selectedLegacy.titulo||'Post histórico').trim().slice(0,240);
        const record=await saveTfDocument(db,{
          taskId,type:'post',title:title.length>=3?title:'Post histórico',
          content:markdown,source:markdown===selectedLegacy.md?'gerado':'manual'
        });
        status('legacy-status','Post vinculado à TF · versão '+record.versao+'.');
        await onImported('post',taskId);
      }
      await loadAudit(taskId,0);
      toast('Histórico importado na TF existente sem modificar o registro antigo.');
    }catch(e){status('legacy-status','Falha: '+errorMsg(e));toast(errorMsg(e),true)}
    finally{loading=false;$('legacy-import-save').disabled=false}
  });
  async function load(taskId){
    if(!taskId||!getUserId()){reset();return}
    if(activeTaskId!==taskId){
      reset();activeTaskId=taskId;
    }
    const token=++taskToken;
    scenarioOptions();
    await Promise.all([fetchEvidence(taskId),loadAudit(taskId,0)]);
    if(activeTaskId!==taskId||token!==taskToken)return;
    selectedKind=$('legacy-kind').value;
    await loadLegacy(selectedKind);
    $('legacy-import-save').disabled=!owner();
    renderEvidence();
  }
  return {load,reset,refreshAudit:()=>activeTaskId?loadAudit(activeTaskId,0):Promise.resolve()};
}
