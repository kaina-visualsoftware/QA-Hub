import {parseRequirements,prepareImport,normalizeRequirement,REQUIREMENT_TYPES} from './qa-requirements.mjs';
import {createRequirementsFilesUi} from './qa-requirements-files-ui.mjs';

// Requirement workspace is bound to exactly one TF. A new, unsaved TF can
// prepare an in-memory batch; nothing is persisted until its TF exists.
export function createRequirementsUi({db,getTask,getTaskId,getUserId,toast,onDirty}){
  const $=id=>document.getElementById(id);
  const node=(tag,cls='',value='')=>{
    const el=document.createElement(tag);if(cls)el.className=cls;
    if(value)el.textContent=value;return el;
  };
  const label=(value,control)=>{
    const wrap=node('label','qa-req-field');
    wrap.append(node('span','',value),control);
    return wrap;
  };
  const textInput=(value,maxLength=240)=>{
    const input=document.createElement('input');
    input.type='text';input.value=String(value??'');input.maxLength=maxLength;
    return input;
  };
  const textarea=(value,maxLength=6000,rows=3)=>{
    const input=document.createElement('textarea');input.value=String(value??'');
    input.maxLength=maxLength;input.rows=rows;return input;
  };
  const select=(choices,value)=>{
    const control=document.createElement('select');
    for(const [id,name] of choices){
      control.add(new Option(name,id));
    }
    control.value=value;return control;
  };
  const states=[['rascunho','Rascunho'],['aprovado','Aprovado']];
  const typeOptions=REQUIREMENT_TYPES.map(type=>[type,type]);
  const message=text=>{$('requirements-feedback').textContent=text};
  const errorText=e=>e?.message||String(e);
  const isOwner=()=>!getTaskId()?Boolean(getUserId()):
    Boolean(getUserId()&&getTask()?.user_id===getUserId());
  let activeTaskId=null,saved=[],preview=[],sourceText='',queued=null;
  let token=0,editId=null,saving=false,loadError=false;
  let fileSourceId=null,fileSourceTask=null;
  function clearFileAssociation(){
    fileSourceId=null;fileSourceTask=null;
    $('requirements-active-file').hidden=true;
    $('requirements-active-file-label').textContent='';
  }
  const filesUi=createRequirementsFilesUi({
    db,getTask,getTaskId,getUserId,toast,
    onSourceReady:({id,taskId,text,filename})=>{
      if(taskId!==getTaskId()||!id)return;
      fileSourceId=id;fileSourceTask=taskId;
      $('requirements-active-file').hidden=false;
      $('requirements-active-file-label').textContent=
        'Fonte vinculada: '+filename+'. O texto pode ser revisado; desvincule se usar outro documento.';
      $('requirements-source').value=text||'';
      preview=[];sourceText='';queued=null;
      $('requirements-review').replaceChildren();
      $('requirements-review-section').hidden=true;
      message(text
        ?'Texto extraído pronto para organizar. Revise o conteúdo antes de cadastrar requisitos.'
        :'Arquivo sem texto extraível. Transcreva manualmente os requisitos para associá-los à fonte.');
      onDirty?.(true);
      $('requirements-source').focus();
    }
  });
  $('requirements-unlink-file').addEventListener('click',()=>{
    clearFileAssociation();
    message('Fonte desvinculada. Um novo texto será salvo como fonte independente.');
    onDirty?.(true);
  });

  function markPreviewDirty(){
    queued=null;
    onDirty?.(true);
  }
  function reset(){
    token++;activeTaskId=null;saved=[];preview=[];sourceText='';
    queued=null;editId=null;saving=false;loadError=false;
    clearFileAssociation();filesUi.reset();
    $('requirements-source').value='';
    $('requirements-search').value='';
    $('requirements-filter').value='todos';
    $('requirements-review').replaceChildren();
    $('requirements-list').replaceChildren();
    $('requirements-review-section').hidden=true;
    message('');
    $('requirements-source').disabled=false;
    $('requirements-organize').disabled=false;
    $('requirements-save').disabled=false;
    $('requirements-approve').disabled=false;
  }
  function startNew(){
    reset();
    $('requirements-help').textContent='Você pode preparar e revisar os requisitos agora. Eles só serão gravados após salvar a nova TF na aba Resumo.';
    renderSaved();
  }
  function reviewControls(item){
    const row=node('article','qa-req-preview-card');
    const top=node('div','qa-req-preview-top');
    const check=document.createElement('input');check.type='checkbox';check.checked=Boolean(item.selected);
    const selection=node('label','qa-req-check');selection.append(check,node('span','',item.duplicate?'Possível duplicata — revisar código':'Incluir este requisito'));
    check.onchange=()=>{item.selected=check.checked;markPreviewDirty()};
    const tag=node('span','qa-req-status',item.suggested?'Classificação sugerida':'Identificado no texto');
    top.append(selection,tag);row.append(top);
    const grid=node('div','qa-req-edit-grid');
    const typ=select(typeOptions,item.tipo);
    const code=textInput(item.codigo,10);
    const title=textInput(item.titulo,240);
    const desc=textarea(item.descricao,6000,3);
    const acceptance=textarea(item.criterios_aceite,4000,2);
    const origin=node('p','muted fine qa-req-origin','Origem: '+(item.origem_trecho||item.descricao).slice(0,240));
    typ.onchange=()=>{
      item.tipo=typ.value;
      const match=code.value.match(/^[A-Z]+-(\d{3,4})$/);
      if(match){code.value=typ.value+'-'+match[1];item.codigo=code.value;}
      markPreviewDirty();
    };
    code.oninput=()=>{item.codigo=code.value;markPreviewDirty()};
    title.oninput=()=>{item.titulo=title.value;markPreviewDirty()};
    desc.oninput=()=>{item.descricao=desc.value;markPreviewDirty()};
    acceptance.oninput=()=>{item.criterios_aceite=acceptance.value;markPreviewDirty()};
    const status=select(states,item.estado);
    status.onchange=()=>{item.estado=status.value;markPreviewDirty()};
    grid.append(label('Tipo',typ),label('Código',code),label('Título',title),label('Situação ao salvar',status));
    row.append(grid,label('Descrição',desc),label('Critérios de aceite (quando informados)',acceptance),origin);
    return row;
  }
  function renderPreview(){
    const list=$('requirements-review');list.replaceChildren();
    $('requirements-review-section').hidden=!preview.length;
    $('requirements-preview-count').textContent=preview.length+
      ' item(ns) identificados. Confira os dados, selecione o que deseja salvar e aprove apenas o que estiver correto.';
    for(const item of preview)list.append(reviewControls(item));
    $('requirements-save').disabled=saving||!isOwner()||!preview.length;
  }
  function emptySaved(messageText){
    $('requirements-list').append(node('p','qa-req-empty',messageText));
  }
  function renderSaved(){
    const list=$('requirements-list');list.replaceChildren();
    const approved=saved.filter(x=>x.estado==='aprovado').length,
      draft=saved.filter(x=>x.estado==='rascunho').length;
    $('requirements-number').textContent=saved.length;
    $('requirements-count').textContent=saved.length
      ?approved+' aprovado(s) · '+draft+' rascunho(s) · '+(saved.length-approved-draft)+' arquivado(s)'
      :'Nenhum requisito cadastrado';
    if(loadError){emptySaved('Não foi possível carregar os requisitos desta TF.');return;}
    if(!getTaskId()){emptySaved('Salve a TF para consultar os requisitos cadastrados. A prévia acima pode ser preparada antes disso.');return;}
    const q=$('requirements-search').value.trim().toLowerCase(),
      filter=$('requirements-filter').value;
    const filtered=saved.filter(x=>(filter==='todos'||x.estado===filter)&&
      [x.codigo,x.titulo,x.descricao].join(' ').toLowerCase().includes(q));
    if(!filtered.length){emptySaved(saved.length?'Nenhum requisito corresponde aos filtros.':'Esta TF ainda não possui requisitos. Cole um texto para começar.');return;}
    for(const item of filtered){
      const card=node('article','panel qa-req-saved');
      const head=node('div','qa-req-saved-head');
      const title=node('div');
      title.append(node('strong','',item.codigo+' · '+item.titulo),
        node('small','',item.tipo+' · '+({rascunho:'Rascunho',aprovado:'Aprovado',arquivado:'Arquivado'}[item.estado]||item.estado)));
      head.append(title);
      const actions=node('div','qa-req-actions');
      if(isOwner()){
        if(editId===item.id){
          actions.append(button('Cancelar',()=>{editId=null;renderSaved()},'btn soft'));
        }else{
          actions.append(button('Editar',()=>{editId=item.id;renderSaved()},'btn soft'));
          if(item.estado!=='arquivado')
            actions.append(button('Arquivar',()=>archive(item),'btn soft'));
        }
      }
      head.append(actions);card.append(head);
      if(editId===item.id){
        const form=node('div','qa-req-saved-editor');
        const grid=node('div','qa-req-edit-grid');
        const type=select(typeOptions,item.tipo),code=textInput(item.codigo,10);
        const titleInput=textInput(item.titulo),status=select(states,item.estado==='arquivado'?'rascunho':item.estado);
        const desc=textarea(item.descricao,6000,3),acceptance=textarea(item.criterios_aceite,4000,2);
        grid.append(label('Tipo',type),label('Código',code),label('Título',titleInput),label('Situação',status));
        const save=button('Salvar alterações',async()=>{
          try{
            if(!isOwner())throw Error('TF sem permissão de edição.');
            const updated=normalizeRequirement({
              ...item,tipo:type.value,codigo:code.value,titulo:titleInput.value,
              descricao:desc.value,criterios_aceite:acceptance.value,estado:status.value
            });
            save.disabled=true;
            const {data,error}=await db.from('qa_requisitos')
              .update({...updated,updated_at:new Date().toISOString()})
              .eq('id',item.id).eq('tarefa_id',activeTaskId).select('id').single();
            if(error)throw error;
            if(!data?.id)throw Error('O banco não confirmou a alteração.');
            editId=null;await loadSaved(activeTaskId);toast('Requisito atualizado.');
          }catch(e){toast(errorText(e),true);save.disabled=false;}
        });
        form.append(grid,label('Descrição',desc),label('Critérios de aceite',acceptance),save);
        card.append(form);
      }else{
        card.append(node('p','qa-req-description',item.descricao));
        if(item.criterios_aceite)
          card.append(node('p','qa-req-acceptance','Critérios de aceite: '+item.criterios_aceite));
      }
      list.append(card);
    }
  }
  function button(text,callback,classes){
    const b=node('button',classes,text);b.type='button';b.onclick=callback;return b;
  }
  async function archive(item){
    if(!isOwner()||!confirm('Arquivar '+item.codigo+'? O requisito não será apagado e poderá ser consultado pelo filtro Arquivados.'))return;
    const {data,error}=await db.from('qa_requisitos').update({
      estado:'arquivado',updated_at:new Date().toISOString()
    }).eq('id',item.id).eq('tarefa_id',activeTaskId).select('id').single();
    if(error||!data?.id)return toast(errorText(error||new Error('Registro não atualizado.')),true);
    await loadSaved(activeTaskId);toast('Requisito arquivado.');
  }
  async function loadSaved(taskId){
    const current=++token;
    const {data,error}=await db.from('qa_requisitos')
      .select('id,tarefa_id,user_id,fonte_id,codigo,tipo,titulo,descricao,criterios_aceite,estado,origem_trecho,ordem,created_at,updated_at')
      .eq('tarefa_id',taskId).order('ordem',{ascending:true}).limit(500);
    if(current!==token||taskId!==activeTaskId)return;
    loadError=Boolean(error);
    if(error){toast('Não foi possível carregar requisitos: '+errorText(error),true);return renderSaved();}
    saved=data||[];renderSaved();
  }
  async function load(taskId){
    if(!taskId||!getUserId()){startNew();return;}
    if(taskId!==activeTaskId){
      reset();activeTaskId=taskId;
    }
    $('requirements-help').textContent='Os requisitos são privados e vinculados somente a esta TF. Revise os itens antes de aprová-los.';
    await loadSaved(taskId);
    await filesUi.load(taskId);
  }
  $('requirements-organize').addEventListener('click',()=>{
    try{
      sourceText=$('requirements-source').value.trim();
      preview=parseRequirements(sourceText,{existing:saved});
      queued=null;
      renderPreview();
      message(preview.length+' item(ns) preparados; nenhum dado foi gravado. Revise os códigos, textos e estados.');
      onDirty?.(true);
    }catch(e){message(errorText(e));toast(errorText(e),true);}
  });
  $('requirements-source').addEventListener('input',()=>{
    queued=null;
    if(preview.length)message('Texto alterado. Clique em Organizar novamente para atualizar a prévia.');
    onDirty?.(true);
  });
  $('requirements-approve').addEventListener('click',()=>{
    for(const item of preview)if(item.selected&&!item.duplicate)item.estado='aprovado';
    markPreviewDirty();renderPreview();
    message('Itens selecionados marcados como aprovados. Revise e salve quando estiverem corretos.');
  });
  $('requirements-save').addEventListener('click',async()=>{
    if(saving||!isOwner())return;
    try{
      if($('requirements-source').value.trim()!==sourceText)
        throw Error('O texto mudou. Clique em Organizar novamente antes de salvar.');
      const batch=prepareImport(sourceText,preview);
      if(!getTaskId()){
        queued=batch;
        message(batch.items.length+' requisito(s) preparado(s) em memória. Vá para Resumo e clique Salvar TF para gravá-los.');
        toast('Rascunho preparado. Salve a TF na aba Resumo para gravar os requisitos.');
        return;
      }
      await saveBatch(getTaskId(),batch);
    }catch(e){message(errorText(e));toast(errorText(e),true);}
  });
  async function saveBatch(taskId,batch){
    saving=true;$('requirements-save').disabled=true;
    try{
      if(!taskId||!getUserId())throw Error('Selecione uma TF salva.');
      const usingFile=Boolean(fileSourceId&&fileSourceTask===taskId);
      const {data,error}=usingFile
        ?await db.rpc('qa_import_requisitos_da_fonte',{
          p_tarefa_id:taskId,p_fonte_id:fileSourceId,p_itens:batch.items
        })
        :await db.rpc('qa_import_requisitos',{
          p_tarefa_id:taskId,p_texto:batch.text,p_itens:batch.items
        });
      if(error)throw error;
      if(data?.tarefa_id!==taskId)throw Error('Confirmação do banco incompatível com a TF selecionada.');
      const inserted=Number(data?.inserted)||0,skipped=Number(data?.skipped)||0;
      if(inserted){
        preview=[];sourceText='';queued=null;$('requirements-source').value='';
        clearFileAssociation();
        $('requirements-review-section').hidden=true;
        $('requirements-review').replaceChildren();
        onDirty?.(false);
      }
      message(inserted+' requisito(s) adicionado(s) à TF'+
        (skipped?' · '+skipped+' código(s) já existente(s) ignorados.':'.'));
      await loadSaved(taskId);
      toast(inserted?'Requisitos cadastrados na TF.':'Nenhum requisito novo foi cadastrado.');
      return data;
    }finally{saving=false;$('requirements-save').disabled=false;}
  }
  function attachTask(taskId){if(taskId&&!activeTaskId)activeTaskId=taskId;}
  async function onTaskSaved(taskId){
    if(!queued)return {inserted:0,skipped:0};
    // Keep the pending batch if a network/RLS error prevents import. The
    // caller must never create a second TF to retry this part.
    const result=await saveBatch(taskId,queued);
    queued=null;return result;
  }
  $('requirements-search').addEventListener('input',renderSaved);
  $('requirements-filter').addEventListener('change',renderSaved);
  return {load,startNew,reset,attachTask,onTaskSaved,render:renderSaved,get pending(){return Boolean(queued)}};
}
