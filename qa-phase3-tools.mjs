import {
  linkTaskRelease,recordComparison,exactTaskCodePresent
} from './qa-phase3.mjs';

// Explicit, contextual save actions in release/text/XML tools.
// The standalone tools remain local by default: only counts or a confirmed
// TF→release link are written after the operator presses the save button.
export function createPhase3GeneratorTools({client,getTask,getUserId,embedded}){
  const panel=document.getElementById('qa-phase3-tool');
  const heading=document.getElementById('qa-phase3-tool-title');
  const message=document.getElementById('qa-phase3-tool-note');
  const status=document.getElementById('qa-phase3-tool-status');
  const action=document.getElementById('qa-phase3-tool-action');
  let entry=null,saving=false;
  const task=()=>getTask();
  function clear(){
    entry=null;panel.hidden=true;status.textContent='';
  }
  function display(){
    if(!entry){panel.hidden=true;return}
    const selected=task(),userId=getUserId();
    panel.hidden=false;
    const isOwned=Boolean(selected&&userId&&selected.user_id===userId);
    action.disabled=saving||!isOwned;
    status.textContent='';
    if(entry.kind==='release'){
      heading.textContent='Vincular TF à release';
      const present=Boolean(selected&&exactTaskCodePresent(selected.codigo,entry.numbers));
      message.textContent=isOwned
        ? present
          ? 'TF #'+selected.codigo+' encontrada na lista. Confirme a associação com a release '+entry.version+'.'
          : 'A TF em foco não aparece na lista fornecida. Use a aba Vínculos da TF para associar manualmente, após conferir o pertencimento.'
        : 'Selecione uma TF da sua conta para vincular a release. Não é feito vínculo automático por número.';
      action.textContent='Confirmar associação à release';
      action.disabled=!isOwned||!present||saving;
    }else{
      heading.textContent='Registrar comparação na TF';
      const typeName=entry.type==='diff_xml'?'XML':'texto';
      message.textContent='Resumo do '+typeName+': '+entry.values.adicionados+' adições, '+
        entry.values.removidos+' remoções e '+entry.values.alterados+
        ' alterações. Somente essas contagens serão enviadas ao banco, nunca os valores ou arquivos originais.'+
        (isOwned?'':' Selecione uma TF da sua conta.');
      action.textContent='Salvar indicadores na TF';
    }
  }
  function showRelease({version,numbers}){
    entry={kind:'release',version,numbers:Array.isArray(numbers)?numbers:[]};
    display();
  }
  function showComparison(type,values){
    entry={kind:'comparison',type,values};display();
  }
  action.addEventListener('click',async()=>{
    if(saving||!entry)return;
    const selected=task(),userId=getUserId();
    if(!selected||selected.user_id!==userId)return;
    const current=entry,taskId=selected.id;
    const label=current.kind==='release'
      ? 'Vincular a TF #'+(selected.codigo||selected.titulo)+' à release '+current.version+'?'
      : 'Salvar apenas as contagens de diferenças nesta TF? Nenhum texto ou XML será armazenado.';
    if(!confirm(label))return;
    saving=true;action.disabled=true;status.textContent='Registrando na TF...';
    try{
      if(current.kind==='release'){
        await linkTaskRelease(client,{taskId,version:current.version});
        status.textContent='Release associada à TF existente.';
      }else{
        await recordComparison(client,{taskId,userId,type:current.type,values:current.values});
        status.textContent='Indicadores de comparação salvos na TF sem conteúdo bruto.';
      }
      if(embedded)parent.postMessage({type:'qa-hub:phase3-changed',taskId},location.origin);
    }catch(error){status.textContent='Não foi possível registrar: '+(error.message||String(error))}
    finally{saving=false;action.disabled=false}
  });
  return {clear,showRelease,showComparison};
}
