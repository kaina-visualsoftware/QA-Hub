import {
  EXECUTION_STATUSES, executionSummary, buildExecutionReport,
  cleanDocumentName, saveTfDocument
} from './qa-phase2.mjs';

export function createPhase2Ui({
  db,getTask,getScenarios,getTaskId,refreshScenarios,onOpenDocuments,markDirty,toast
}){
  const $=id=>document.getElementById(id);
  let taskId=null,documents=[],working=false,reportBaseline=null;
  const create=(name,cls='',value='')=>{
    const node=document.createElement(name);
    if(cls)node.className=cls;
    if(value)node.textContent=value;
    return node;
  };
  const docStatus=message=>{$('document-status').textContent=message};
  const setDirty=dirty=>markDirty('document-form',dirty);

  function renderExecution(){
    const list=$('execution-list'),scenarios=getScenarios(),counts=executionSummary(scenarios);
    list.replaceChildren();
    $('execution-summary').textContent=counts.total+' cenários · '+counts.aprovado+
      ' aprovados · '+counts.reprovado+' reprovados · '+counts.bloqueado+
      ' bloqueados · '+counts.nao_executado+' não executados';
    if(!scenarios.length) {
      list.append(create('div','empty','Nenhum cenário cadastrado. Gere ou cadastre casos antes de executar.'));
      return;
    }
    for(const [index,scenario] of scenarios.entries()){
      const article=create('article','panel qa-execution-case');
      const heading=create('header','qa-execution-heading');
      const main=create('div');
      main.append(create('p','eyebrow','CENÁRIO '+String(index+1).padStart(2,'0')));
      main.append(create('h3','',scenario.titulo));
      heading.append(main);
      article.append(heading);
      const details=create('div','qa-execution-details');
      for(const [title,value] of [
        ['Passos',scenario.passos],['Resultado esperado',scenario.esperado]
      ]){
        const block=create('div');
        block.append(create('b','',title),create('p','',value||'Não informado'));
        details.append(block);
      }
      article.append(details);
      const fields=create('div','qa-execution-fields');
      const statusLabel=create('label');
      statusLabel.append(document.createTextNode('Resultado da execução'));
      const statusSelect=create('select');
      for(const [key,label] of Object.entries(EXECUTION_STATUSES))
        statusSelect.add(new Option(label,key));
      statusSelect.value=Object.hasOwn(EXECUTION_STATUSES,scenario.status)?scenario.status:'nao_executado';
      statusSelect.setAttribute('aria-label','Resultado de '+scenario.titulo);
      statusLabel.append(statusSelect);
      const outcome=create('label');
      outcome.append(document.createTextNode('O que realmente aconteceu?'));
      const outcomeText=create('textarea');
      outcomeText.rows=3;outcomeText.value=scenario.obtido||'';
      outcomeText.placeholder='Informe o comportamento observado, sem presumir sucesso.';
      outcome.append(outcomeText);
      const remarks=create('label');
      remarks.append(document.createTextNode('Observações'));
      const remarkText=create('textarea');
      remarkText.rows=2;remarkText.value=scenario.observacoes||'';
      remarks.append(remarkText);
      fields.append(statusLabel,outcome,remarks);
      article.append(fields);
      const actions=create('div','qa-execution-actions');
      const save=create('button','btn primary','Salvar resultado');
      save.type='button';
      const info=create('span','qa-execution-feedback');
      info.setAttribute('role','status');
      save.addEventListener('click',async()=>{
        if(working||!getTaskId()||getTaskId()!==taskId)return;
        const chosen=statusSelect.value,observed=outcomeText.value.trim(),notes=remarkText.value.trim();
        if((chosen==='aprovado'||chosen==='reprovado')&&!observed){
          info.textContent='Descreva o resultado observado antes de aprovar ou reprovar.';
          outcomeText.focus();return;
        }
        if(chosen==='bloqueado'&&!observed&&!notes){
          info.textContent='Explique por que a execução foi bloqueada.';
          remarkText.focus();return;
        }
        working=true;save.disabled=true;info.textContent='Salvando…';
        try{
          const {data,error}=await db.from('qa_cenarios').update({
            status:chosen,obtido:observed,observacoes:notes,
            updated_at:new Date().toISOString()
          }).eq('id',scenario.id).eq('tarefa_id',taskId).select('id').maybeSingle();
          if(error)throw error;
          if(!data)throw Error('Cenário sem permissão para alteração.');
          await refreshScenarios(taskId);
          toast('Resultado registrado no cenário. A situação geral da TF não foi alterada.');
        }catch(error){
          info.textContent='Falha ao salvar: '+(error.message||String(error));
          toast(info.textContent,true);
        }finally{working=false;save.disabled=false}
      });
      actions.append(save,info);
      article.append(actions);list.append(article);
    }
  }

  function reset(){
    taskId=null;documents=[];reportBaseline=null;
    $('document-title').value='';$('document-content').value='';
    $('document-type').value='post';
    docStatus('');
    $('documents-list').replaceChildren();
    $('documents-history').replaceChildren();
    $('execution-list').replaceChildren();
    $('execution-summary').textContent='Nenhum cenário carregado.';
    setDirty(false);
  }

  function documentCard(item){
    const article=create('article','qa-document-row');
    const summary=create('div');
    const typeName=item.tipo==='post'?'Post técnico':'Relatório de execução';
    summary.append(create('strong','',item.titulo),
      create('small','',typeName+' · v'+item.versao+' · '+new Date(item.created_at).toLocaleString('pt-BR')));
    const open=create('button','btn soft','Abrir versão');
    open.type='button';open.dataset.qaDocumentId=item.id;
    article.append(summary,open);
    return article;
  }

  function renderDocuments(){
    const latest=$('documents-list'),history=$('documents-history');
    latest.replaceChildren();history.replaceChildren();
    const order=[...documents].sort((a,b)=>b.versao-a.versao||
      String(b.created_at).localeCompare(String(a.created_at)));
    const seen=new Set();
    for(const item of order){
      if(!seen.has(item.tipo)){latest.append(documentCard(item));seen.add(item.tipo)}
      history.append(documentCard(item));
    }
    if(!documents.length){
      latest.append(create('div','empty','Nenhum documento salvo nesta TF.'));
      history.append(create('div','empty','O histórico será formado quando você salvar posts e relatórios.'));
    }
  }

  async function loadDocuments(id){
    if(!id){reset();return}
    const changed=taskId!==id;
    if(changed){
      taskId=id;documents=[];reportBaseline=null;
      $('document-title').value='';$('document-content').value='';
      $('document-type').value='post';setDirty(false);
    }
    const {data,error}=await db.from('qa_documentos').select('*')
      .eq('tarefa_id',id).order('created_at',{ascending:false}).limit(200);
    if(error)throw error;
    if(taskId!==id||getTaskId()!==id)return;
    documents=data||[];
    renderDocuments();
  }

  function openVersion(id){
    const entry=documents.find(doc=>doc.id===id);
    if(!entry||getTaskId()!==entry.tarefa_id)return;
    if($('document-content').value.trim() && $('document-content').value!==entry.conteudo &&
       !confirm('Substituir o rascunho atual por esta versão?'))return;
    $('document-type').value=entry.tipo;
    $('document-title').value=entry.titulo;
    $('document-content').value=entry.conteudo;
    reportBaseline=null;
    docStatus('Versão '+entry.versao+' carregada. Alterações serão salvas como uma nova versão.');
    setDirty(false);
    onOpenDocuments();
    $('document-content').focus();
  }

  for(const list of [$('documents-list'),$('documents-history')]){
    list.addEventListener('click',event=>{
      const button=event.target.closest('[data-qa-document-id]');
      if(button)openVersion(button.dataset.qaDocumentId);
    });
  }
  $('document-generate-report').addEventListener('click',()=>{
    const task=getTask();
    if(!task||getTaskId()!==task.id)return toast('Abra uma TF primeiro.',true);
    if(!getScenarios().length)return toast('Cadastre cenários antes de gerar o relatório.',true);
    if($('document-content').value.trim() &&
       !confirm('Substituir o rascunho atual pelo relatório dos resultados salvos?'))return;
    $('document-type').value='relatorio';
    $('document-title').value='Relatório de execução — '+(task.codigo||task.titulo).slice(0,200);
    reportBaseline=buildExecutionReport(task,getScenarios());
    $('document-content').value=reportBaseline;
    docStatus('Prévia criada com resultados persistidos. Revise e clique em Salvar versão.');
    setDirty(true);
    $('document-content').focus();
  });
  for(const id of ['document-title','document-type','document-content']){
    $(id).addEventListener('input',()=>setDirty(true));
    $(id).addEventListener('change',()=>setDirty(true));
  }
  $('document-save').addEventListener('click',async()=>{
    const id=getTaskId(),task=getTask();
    if(working||!id||!task)return;
    const content=$('document-content').value,title=$('document-title').value,type=$('document-type').value;
    const source=type==='relatorio'&&reportBaseline===content?'execucao':'manual';
    const button=$('document-save');working=true;button.disabled=true;docStatus('Salvando versão…');
    try{
      const doc=await saveTfDocument(db,{taskId:id,type,title,content,source});
      if(getTaskId()!==id)return;
      setDirty(false);docStatus('Documento salvo na TF · versão '+doc.versao+'.');
      await loadDocuments(id);
      toast('Documento v'+doc.versao+' salvo com histórico.');
    }catch(error){docStatus('Falha ao salvar: '+(error.message||String(error)));toast(error.message||String(error),true)}
    finally{working=false;button.disabled=false}
  });
  $('document-copy').addEventListener('click',async()=>{
    const content=$('document-content').value;
    if(!content.trim())return docStatus('Não há texto para copiar.');
    try{await navigator.clipboard.writeText(content);docStatus('Texto copiado.')}
    catch{docStatus('A cópia automática não está disponível neste navegador. Selecione o texto no editor.')}
  });
  $('document-download').addEventListener('click',()=>{
    const content=$('document-content').value;
    if(!content.trim())return docStatus('Não há texto para exportar.');
    const name=cleanDocumentName($('document-title').value||'relatorio-tf');
    const blob=new Blob([content],{type:'text/markdown;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=create('a');a.href=url;a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),500);
    docStatus('Arquivo '+name+' preparado.');
  });

  return {renderExecution,loadDocuments,renderDocuments,reset};
}
