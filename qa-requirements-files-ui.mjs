import {
  extractRequirementFile,validateRequirementFile,storagePathForFile,FILE_BUCKET
} from './qa-requirements-files.mjs';

export function createRequirementsFilesUi({
  db,getTask,getTaskId,getUserId,toast,onSourceReady
}){
  const $=id=>document.getElementById(id);
  const make=(tag,cls='',value='')=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    el.textContent=value;return el;
  };
  const feedback=text=>{$('requirements-file-feedback').textContent=text};
  const message=e=>e?.message||String(e);
  let activeTaskId=null,items=[],pending=null,loading=false,taskVersion=0;

  function ownsTask(){
    return Boolean(activeTaskId&&getTaskId()===activeTaskId&&
      getTask()?.user_id===getUserId());
  }
  function updateFileState(){
    $('requirements-file').disabled=!ownsTask()||loading;
    $('requirements-file-save').disabled=!pending||!ownsTask()||loading;
    $('requirements-file-save').textContent=loading?'Processando arquivo…':'Anexar arquivo à TF';
  }
  function reset(){
    taskVersion++;activeTaskId=null;pending=null;items=[];loading=false;
    $('requirements-file').value='';
    $('requirements-file-preview').value='';
    $('requirements-file-preview-wrap').hidden=true;
    $('requirements-file-list').replaceChildren();
    feedback('');
    updateFileState();
  }
  function fileEntry(file){
    const row=make('article','qa-req-attachment-row');
    const description=make('div','qa-req-attachment-info');
    description.append(
      make('strong','',file.nome_arquivo+' · v'+file.versao),
      make('small','',[(file.tamanho_arquivo/1024).toFixed(1)+' KB',
        file.created_at?new Date(file.created_at).toLocaleDateString('pt-BR'):''].filter(Boolean).join(' · '))
    );
    const actions=make('div','qa-req-actions');
    const use=make('button','btn soft','Revisar texto');
    use.type='button';
    use.disabled=!ownsTask();
    use.addEventListener('click',()=>{
      if(!ownsTask())return toast('Esta TF não está mais em foco.',true);
      const extracted=file.texto_extraido||'';
      onSourceReady?.({id:file.id,taskId:file.tarefa_id,text:extracted,filename:file.nome_arquivo});
      if(!extracted)toast('O arquivo foi anexado sem texto extraível. Insira manualmente os requisitos para revisão.');
      else toast('Texto do anexo carregado para revisão. Clique em Organizar requisitos.');
    });
    const download=make('button','btn soft','Baixar original');
    download.type='button';
    download.addEventListener('click',async()=>{
      if(!ownsTask())return toast('TF sem permissão para baixar este documento.',true);
      download.disabled=true;
      try{
        const {data,error}=await db.storage.from(FILE_BUCKET).download(file.storage_path);
        if(error)throw error;
        if(!data)throw Error('Não foi possível recuperar o arquivo.');
        const href=URL.createObjectURL(data);
        const anchor=document.createElement('a');
        anchor.href=href;anchor.download=file.nome_arquivo;
        document.body.append(anchor);anchor.click();anchor.remove();
        setTimeout(()=>URL.revokeObjectURL(href),1000);
      }catch(error){toast('Não foi possível baixar o original: '+message(error),true);}
      finally{download.disabled=false;}
    });
    actions.append(use,download);row.append(description,actions);
    return row;
  }
  function render(){
    const list=$('requirements-file-list');list.replaceChildren();
    $('requirements-file-count').textContent=items.length?
      items.length+' arquivo(s) / versões privadas':'Nenhum arquivo anexado';
    if(!items.length){
      list.append(make('p','qa-req-empty','O original será armazenado de forma privada e permanecerá disponível nesta TF.'));
    }else{
      for(const item of items)list.append(fileEntry(item));
    }
    updateFileState();
  }
  async function load(taskId){
    const version=++taskVersion;
    activeTaskId=taskId||null;
    pending=null;items=[];
    $('requirements-file').value='';
    $('requirements-file-preview').value='';
    $('requirements-file-preview-wrap').hidden=true;
    if(!taskId){
      feedback('Salve a TF antes de anexar um arquivo.');
      render();return;
    }
    feedback('');
    loading=true;updateFileState();
    try{
      const {data,error}=await db.from('qa_requisito_fontes')
        .select('id,tarefa_id,user_id,nome_arquivo,mime,hash,versao,storage_path,tamanho_arquivo,texto_extraido,created_at')
        .eq('tarefa_id',taskId).eq('tipo_fonte','arquivo')
        .order('created_at',{ascending:false}).limit(200);
      if(error)throw error;
      if(version!==taskVersion)return;
      items=data||[];
    }catch(error){
      if(version===taskVersion){
        feedback('Não foi possível carregar anexos: '+message(error));
        toast('Erro ao consultar arquivos privados da TF.',true);
      }
    }finally{
      if(version===taskVersion){loading=false;render();}
    }
  }
  $('requirements-file').addEventListener('change',async event=>{
    const file=event.currentTarget.files?.[0];
    pending=null;
    $('requirements-file-preview').value='';
    $('requirements-file-preview-wrap').hidden=true;
    if(!file){updateFileState();return;}
    if(!ownsTask()){
      feedback('Salve a TF antes de selecionar arquivos.');updateFileState();return;
    }
    const version=taskVersion;
    loading=true;updateFileState();
    try{
      // Validate extension/size first to reject huge or unsuitable files
      // without allocating the entire file.
      validateRequirementFile(file);
      feedback('Lendo arquivo localmente e verificando sua integridade…');
      const result=await extractRequirementFile(file);
      if(version!==taskVersion||!ownsTask())return;
      if(items.some(item=>item.hash===result.hash)){
        throw Error('Este arquivo já está anexado à TF. Use “Revisar texto” na versão existente.');
      }
      pending=result;
      const variants=items.filter(item=>item.nome_arquivo.toLowerCase()===file.name.toLowerCase());
      const nextVersion=Math.max(0,...variants.map(item=>Number(item.versao)||0))+1;
      $('requirements-file-preview-wrap').hidden=!result.text;
      $('requirements-file-preview').value=result.text;
      feedback(
        'Pronto para anexar '+file.name+' (versão '+nextVersion+'). '+
        (result.text?'Texto extraído para revisão. ':'Nenhum requisito foi identificado automaticamente. ')+
        (result.warning||'O original será mantido integralmente e não será enviado à IA.')
      );
    }catch(error){
      pending=null;feedback(message(error));toast(message(error),true);
    }finally{
      if(version===taskVersion){loading=false;updateFileState();}
    }
  });
  $('requirements-file-save').addEventListener('click',async()=>{
    if(!pending||loading||!ownsTask())return;
    const taskId=activeTaskId,userId=getUserId(),payload=pending;
    if(items.some(item=>item.hash===payload.hash)){
      feedback('Arquivo idêntico já anexado à TF.');return;
    }
    const version=taskVersion;
    const path=storagePathForFile(userId,taskId,crypto.randomUUID(),payload.extension);
    loading=true;updateFileState();
    let uploaded=false;
    try{
      feedback('Enviando documento para o armazenamento privado da TF…');
      const {error:uploadError}=await db.storage.from(FILE_BUCKET).upload(path,payload.file,{
        contentType:payload.mime,upsert:false,cacheControl:'3600'
      });
      if(uploadError)throw uploadError;
      uploaded=true;
      // Another TF may have been opened while the upload was in flight. Do
      // not register this object under a new task.
      if(taskVersion!==version||getTaskId()!==taskId)
        throw Error('A TF foi alterada durante o upload. O arquivo não foi registrado.');
      const {data,error}=await db.rpc('qa_register_requirement_file',{
        p_tarefa_id:taskId,p_path:path,p_nome:payload.file.name,
        p_mime:payload.mime,p_sha256:payload.hash,p_tamanho:payload.size,
        p_texto_extraido:payload.text
      });
      if(error)throw error;
      if(!data?.id||data.tarefa_id!==taskId)
        throw Error('O banco não confirmou o anexo na TF selecionada.');
      uploaded=false; // registered files are immutable; never clean them up
      await load(taskId);
      feedback('Arquivo salvo na TF · versão '+data.versao+
        '. '+(payload.warning||'Original armazenado de forma privada.'));
      if(payload.text)onSourceReady?.({id:data.id,taskId,text:payload.text,filename:payload.file.name});
      else toast('Arquivo anexado. Sem texto extraível — use a entrada manual ou outra fonte.');
      toast('Arquivo de requisitos anexado à TF.');
    }catch(error){
      feedback('Falha ao anexar: '+message(error));
      toast('Não foi possível anexar o arquivo: '+message(error),true);
      if(uploaded){
        // Cleanup is permitted only for an object without a source row.
        try{
          const result=await db.storage.from(FILE_BUCKET).remove([path]);
          if(result.error)throw result.error;
        }catch{
          feedback('Upload não registrado. Um objeto temporário pode precisar de limpeza administrativa.');
        }
      }
    }finally{
      if(version===taskVersion){loading=false;updateFileState();}
    }
  });
  return {load,reset,refresh:()=>load(activeTaskId),get files(){return [...items]}};
}
