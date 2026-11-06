import {calculateRequirementCoverage,saveRequirementScenarioLinks,coverageCsv,COVERAGE_STATES} from './qa-requirements-coverage.mjs';

// TF-only matrix. Scenario execution states are read-only; only links are edited.
export function createCoverageUi({db,getTask,getTaskId,getUserId,getScenarios,toast}){
  const $=id=>document.getElementById(id);
  const node=(tag,cls='',value='')=>{
    const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=value;return e;
  };
  const message=error=>error?.message||String(error);
  let taskId=null,requirements=[],links=[],error=null,loading=false,saving=false;
  let token=0,selectedRequirementId=null,focusedScenarioId=null;
  const owner=()=>taskId&&getTaskId()===taskId&&getTask()?.user_id===getUserId();
  const scenarios=()=>getScenarios().filter(s=>s.tarefa_id===taskId);
  const report=()=>calculateRequirementCoverage(requirements,scenarios(),links,taskId);
  const button=(text,action,cls='btn soft')=>{
    const b=node('button',cls,text);b.type='button';b.onclick=action;return b;
  };
  function reset(){
    token++;taskId=null;requirements=[];links=[];error=null;loading=false;
    selectedRequirementId=null;focusedScenarioId=null;
    $('coverage-list').replaceChildren();$('coverage-summary').replaceChildren();
    $('coverage-search').value='';$('coverage-filter').value='all';
    $('coverage-status').textContent='Salve a TF para consultar a matriz.';
    $('coverage-count').textContent='0';$('coverage-export').disabled=true;
    $('coverage-refresh').disabled=true;$('coverage-focus').textContent='';
  }
  function counter(label,value,note){
    const card=node('div','qa-r4-counter');
    card.append(node('span','',label),node('strong','',String(value)),node('small','',note));
    return card;
  }
  function revisions(requirement){
    const panel=node('div','qa-r4-revision-area');
    const trigger=button('Histórico de alterações',async()=>{
      const prev=panel.querySelector('.qa-r4-revision-list');
      if(prev){prev.remove();return;}
      const current=taskId;
      const list=node('div','qa-r4-revision-list');
      list.append(node('p','muted fine','Consultando versões…'));panel.append(list);
      trigger.disabled=true;
      try{
        const {data,error:fetchError}=await db.from('qa_requisito_revisoes')
          .select('id,tarefa_id,versao,codigo,titulo,descricao,criterios_aceite,estado,created_at')
          .eq('tarefa_id',current).eq('requisito_id',requirement.id)
          .order('versao',{ascending:false}).limit(200);
        if(fetchError)throw fetchError;
        if(current!==getTaskId()||current!==taskId)return;
        list.replaceChildren();
        if(!data?.length)list.append(node('p','muted fine','Nenhuma versão registrada.'));
        for(const row of data||[]){
          const item=node('article','qa-r4-revision');
          item.append(node('strong','','Versão '+row.versao+' · '+row.estado),
            node('small','',row.created_at?new Date(row.created_at).toLocaleString('pt-BR'):''),
            node('p','','Código e título: '+row.codigo+' · '+row.titulo),
            node('p','',row.descricao));
          if(row.criterios_aceite)item.append(node('p','','Critérios de aceite: '+row.criterios_aceite));
          list.append(item);
        }
      }catch(e){
        list.replaceChildren(node('p','qa-r4-error','Falha ao consultar versões: '+message(e)));
      }finally{trigger.disabled=false;}
    });
    panel.append(trigger);return panel;
  }
  function editor(item){
    const section=node('section','qa-r4-editor');
    section.setAttribute('aria-label','Vincular cenários a '+item.codigo);
    section.append(node('p','muted fine','Escolha os cenários que verificam este requisito. A execução da TF não é alterada.'));
    const available=node('div','qa-r4-case-selector');
    const marked=new Set(item.cases.map(s=>s.id));
    if(focusedScenarioId)marked.add(focusedScenarioId);
    for(const scenario of scenarios()){
      const label=node('label','qa-r4-option');
      const checkbox=document.createElement('input');
      checkbox.type='checkbox';checkbox.value=scenario.id;checkbox.checked=marked.has(scenario.id);
      const name=node('span','',scenario.titulo);
      const display={aprovado:'Aprovado',reprovado:'Reprovado',bloqueado:'Bloqueado',nao_executado:'Não executado'};
      name.append(node('small','',display[scenario.status]||'Não executado'));
      label.append(checkbox,name);available.append(label);
    }
    if(!scenarios().length)available.append(node('p','muted fine',
      'Nenhum cenário salvo. Cadastre um cenário na aba Cenários.'));
    const controls=node('div','qa-r4-actions');
    const save=button('Salvar vínculos',async()=>{
      if(saving||!owner())return;
      saving=true;save.disabled=true;cancel.disabled=true;
      $('coverage-status').textContent='Salvando vínculos de '+item.codigo+'…';
      const target=taskId;
      try{
        const ids=[...available.querySelectorAll('input:checked')].map(x=>x.value);
        const result=await saveRequirementScenarioLinks(db,{
          taskId:target,requirementId:item.id,scenarioIds:ids
        });
        if(target!==getTaskId())return;
        selectedRequirementId=null;
        await load(target,{keepFocus:true});
        $('coverage-status').textContent=result.linked+' cenário(s) vinculado(s) a '+item.codigo+
          '. Adicionados: '+result.inserted+' · Removidos: '+result.removed+'.';
        toast('Vínculos salvos sem modificar os resultados dos testes.');
      }catch(e){
        $('coverage-status').textContent='Erro ao salvar vínculos: '+message(e);
        toast(message(e),true);
      }finally{saving=false;save.disabled=false;cancel.disabled=false;}
    },'btn primary');
    const cancel=button('Cancelar',()=>{selectedRequirementId=null;render()});
    controls.append(save,cancel);section.append(available,controls);return section;
  }
  function render(){
    const list=$('coverage-list'),summary=$('coverage-summary');
    list.replaceChildren();summary.replaceChildren();
    $('coverage-refresh').disabled=!owner()||loading||saving;
    $('coverage-export').disabled=!owner()||loading||saving||!!error;
    if(!taskId){
      $('coverage-status').textContent='Salve a TF para consultar sua cobertura.';return;
    }
    if(loading){
      $('coverage-status').textContent='Carregando requisitos e vínculos privados…';return;
    }
    if(error){
      $('coverage-status').textContent='Não foi possível carregar a matriz: '+message(error);
      list.append(node('p','qa-r4-error','A cobertura parcial não será exibida. Clique em Atualizar.'));
      return;
    }
    const {items,totals}=report();
    $('coverage-count').textContent=totals.total;
    summary.append(
      counter('Requisitos aprovados',totals.total,'Somente requisitos ativos'),
      counter('Cobertos',totals.linked+' · '+totals.coveragePercent+'%','Ao menos um cenário associado'),
      counter('Validados',totals.validated+' · '+totals.validationPercent+'%','Todos os cenários aprovados'),
      counter('Sem cobertura',totals.unlinked,'Sem cenário associado'),
      counter('Com falha / bloqueio',totals.failed+' / '+totals.blocked,'Situação real dos testes')
    );
    $('coverage-status').textContent=totals.linked+' de '+totals.total+
      ' requisitos com cenários; '+totals.validated+
      ' validados. Cobertura não significa execução nem aprovação automática.';
    const focus=scenarios().find(s=>s.id===focusedScenarioId);
    $('coverage-focus').textContent=focus?'Cenário em foco: '+focus.titulo+
      '. Abra Vincular cenários no requisito desejado para associá-lo.':'';
    const filter=$('coverage-filter').value,q=$('coverage-search').value.trim().toLowerCase();
    const ordered=focus?[...items].sort((a,b)=>
      Number(b.cases.some(c=>c.id===focus.id))-Number(a.cases.some(c=>c.id===focus.id))):items;
    const filtered=ordered.filter(item=>{
      const all=[item.codigo,item.titulo,item.descricao,...item.cases.map(c=>c.titulo)]
        .join(' ').toLowerCase();
      if(q&&!all.includes(q))return false;
      const state=item.coverage;
      return filter==='all'||
        filter==='unlinked'&&state==='sem_cenario'||
        filter==='pending'&&['nao_executado','parcial'].includes(state)||
        filter==='failed'&&state==='reprovado'||
        filter==='blocked'&&state==='bloqueado'||
        filter==='validated'&&state==='validado';
    });
    if(!filtered.length){
      list.append(node('p','qa-r4-empty',totals.total?
        'Nenhum requisito corresponde ao filtro.':
        'Nenhum requisito aprovado. Cadastre e aprove requisitos na aba Requisitos.'));
      return;
    }
    for(const item of filtered){
      const article=node('article','qa-r4-card');
      const head=node('div','qa-r4-card-head');
      const title=node('div','qa-r4-heading');
      title.append(node('strong','',item.codigo+' · '+item.titulo),
        node('small','',item.tipo+' · Versão '+(item.versao||1)));
      const status=node('span','qa-r4-status qa-r4-'+item.coverage,COVERAGE_STATES[item.coverage]);
      head.append(title,status);article.append(head);
      article.append(node('p','qa-r4-subtitle',item.linkedCount+
        ' cenário(s) associado(s) · '+item.executedCount+' executado(s)'));
      if(item.cases.length){
        const ul=node('ul','qa-r4-linked-list');
        for(const sc of item.cases){
          const li=node('li');
          li.append(node('span','',sc.titulo),
            node('small','',({aprovado:'Aprovado',reprovado:'Reprovado',
              bloqueado:'Bloqueado',nao_executado:'Não executado'})[sc.status]||'Não executado'));
          ul.append(li);
        }
        article.append(ul);
      }else article.append(node('p','qa-r4-empty','Sem cenários associados.'));
      const actions=node('div','qa-r4-actions');
      const edit=button(selectedRequirementId===item.id?'Fechar editor':'Vincular cenários',()=>{
        selectedRequirementId=selectedRequirementId===item.id?null:item.id;render();
      });
      edit.disabled=!owner()||saving;actions.append(edit);article.append(actions);
      if(selectedRequirementId===item.id)article.append(editor(item));
      article.append(revisions(item));
      list.append(article);
    }
  }
  async function load(id,{keepFocus=false}={}){
    const seq=++token;
    if(!keepFocus||id!==taskId){selectedRequirementId=null;focusedScenarioId=null;}
    taskId=id||null;requirements=[];links=[];loading=true;error=null;
    if(!id){reset();return;}
    render();
    try{
      if(!owner())throw Error('Somente o proprietário pode consultar vínculos privados.');
      const [r,l]=await Promise.all([
        db.from('qa_requisitos')
          .select('id,tarefa_id,codigo,tipo,titulo,descricao,estado,ordem,versao')
          .eq('tarefa_id',id).eq('estado','aprovado').order('ordem',{ascending:true}).limit(501),
        db.from('qa_requisito_cenarios')
          .select('id,tarefa_id,requisito_id,cenario_id').eq('tarefa_id',id).limit(5001)
      ]);
      if(r.error)throw r.error;if(l.error)throw l.error;
      if(seq!==token||getTaskId()!==id)return;
      if((r.data||[]).length>500||(l.data||[]).length>5000)
        throw Error('Muitos requisitos ou vínculos para uma consulta completa. Ajuste o volume antes de calcular a cobertura.');
      requirements=r.data||[];links=l.data||[];
    }catch(e){if(seq===token)error=e;}
    finally{if(seq===token){loading=false;render();}}
  }
  $('coverage-search').addEventListener('input',()=>{selectedRequirementId=null;render()});
  $('coverage-filter').addEventListener('change',()=>{selectedRequirementId=null;render()});
  $('coverage-refresh').addEventListener('click',()=>load(taskId,{keepFocus:true}));
  $('coverage-export').addEventListener('click',()=>{
    if(!owner()||loading||error)return;
    const text=coverageCsv(report().items);
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=url;a.download='matriz-cobertura-'+(getTask()?.codigo||'tf')+'.csv';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Matriz CSV exportada.');
  });
  function focusScenario(id){
    if(!owner()||!scenarios().some(s=>s.id===id))return;
    focusedScenarioId=id;selectedRequirementId=null;
    $('coverage-search').value='';$('coverage-filter').value='all';render();
  }
  return {load,reset,render,focusScenario};
}
