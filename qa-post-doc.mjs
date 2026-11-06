import {saveTfDocument} from './qa-phase2.mjs';

// Explicitly save a reviewed generator post as an immutable version attached to a TF.
// The generator's legacy history remains separate and is never erased or rewritten.
export function createPostDocumentUi({client,getMode,getUserId,state,getTask,embedded}) {
  const $=id=>document.getElementById(id);
  let saving=false;
  const info=message=>{$('qa-post-status').textContent=message};
  function render(){
    const source=state.post,task=getTask();
    const panel=$('qa-post-document');
    panel.hidden=getMode()!=='post'||!source.md;
    if(panel.hidden)return;
    if(source.editorSource!==source.md){
      source.editorSource=source.md;
      source.editorContent=source.md;
      source.editorTitle=(source.md.match(/^#\s+(.+)$/m)||[])[1]||'Post técnico';
    }
    $('qa-post-title').value=source.editorTitle||'Post técnico';
    $('qa-post-content').value=source.editorContent||'';
    $('qa-post-target').textContent=task
      ? 'TF '+(task.codigo||task.titulo)+' · Revise e salve uma versão privada. O histórico original do gerador não será alterado.'
      : 'Escolha uma TF no seletor do QA Hub para salvar este post como documento. O histórico do gerador continua disponível.';
    $('qa-post-save').disabled=saving||!task||!getUserId();
    $('qa-post-open').hidden=!task;
    if(task)$('qa-post-open').href='./qa.html#/tarefa/'+encodeURIComponent(task.id)+'?tab=documentos';
  }
  $('qa-post-title').addEventListener('input',event=>{state.post.editorTitle=event.target.value});
  $('qa-post-content').addEventListener('input',event=>{state.post.editorContent=event.target.value});
  $('qa-post-save').addEventListener('click',async()=>{
    const task=getTask();
    if(saving||!task||!getUserId())return info('Selecione uma TF válida antes de salvar.');
    const source=state.post,content=$('qa-post-content').value,title=$('qa-post-title').value;
    saving=true;$('qa-post-save').disabled=true;info('Salvando a versão na TF...');
    try{
      const record=await saveTfDocument(client,{
        taskId:task.id,type:'post',title,content,
        source:content.trim()===source.md.trim()?'gerado':'manual'
      });
      info('Post salvo na TF · versão '+record.versao+'. Você pode recuperar a versão em Documentos.');
      if(embedded)parent.postMessage({
        type:'qa-hub:document-saved',taskId:task.id,version:record.versao
      },location.origin);
    }catch(error){
      info('Não foi possível salvar o post: '+(error?.message||String(error)));
    }finally{saving=false;render()}
  });
  $('qa-post-open').addEventListener('click',event=>{
    const task=getTask();
    if(!task||!embedded)return;
    event.preventDefault();
    parent.postMessage({type:'qa-hub:open-documents',taskId:task.id},location.origin);
  });
  return {render};
}
