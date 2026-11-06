import {
  loadApprovedRequirements,composeRequirementContext,requireAuthorizedTask,
  REQUIREMENT_CONTEXT_LIMIT
} from './qa-requirements-context.mjs';

// Same selection/preview behavior in the legacy post/test generator and the
// native Mermaid editor. The caller owns the "Generate" action.
export function createRequirementPicker({root,db,getUserId,limit=REQUIREMENT_CONTEXT_LIMIT}){
  if(!root)throw Error('Painel de requisitos indisponível.');
  let task=null,rows=[],selected=new Set(),busy=false,error=null,bypass=false,version=0,extraText='';
  const mk=(tag,cls='',value='')=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    el.textContent=value;
    return el;
  };
  root.replaceChildren();
  root.classList.add('qa-r3-context');
  const header=mk('div','qa-r3-heading');
  const title=mk('strong','','Requisitos aprovados da TF');
  const count=mk('span','qa-r3-count','');
  header.append(title,count);
  const help=mk('p','qa-r3-help','Apenas os itens selecionados serão incluídos quando você clicar em Gerar. Arquivos originais não são enviados.');
  const actions=mk('div','qa-r3-actions');
  const selectAll=mk('button','btn soft','Selecionar todos');
  const clear=mk('button','btn soft','Desmarcar');
  const refresh=mk('button','btn soft','Atualizar');
  const skip=mk('button','btn soft','Continuar sem requisitos');
  for(const b of [selectAll,clear,refresh,skip])b.type='button';
  actions.append(selectAll,clear,refresh,skip);
  const status=mk('p','qa-r3-status','');
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const list=mk('div','qa-r3-list');
  const previewBox=mk('details','qa-r3-preview');
  const summary=mk('summary','','Visualizar o contexto exato da IA');
  const preview=mk('pre','qa-r3-preview-text','');
  previewBox.append(summary,preview);
  root.append(header,help,actions,status,list,previewBox);

  function compose(){
    return composeRequirementContext(rows,[...selected],extraText,{limit,taskId:task?.id});
  }
  function render(){
    root.hidden=!task;
    if(!task)return;
    const included=rows.filter(x=>selected.has(x.id)).length;
    count.textContent=rows.length?included+' de '+rows.length+' incluído(s)':'Nenhum requisito aprovado';
    selectAll.disabled=busy||!!error;
    clear.disabled=busy||!!error;
    refresh.disabled=busy;
    skip.hidden=!error||bypass;
    skip.disabled=busy;
    list.replaceChildren();
    if(busy){
      status.textContent='Carregando requisitos privados desta TF…';
      preview.textContent='Carregando…';
      return;
    }
    if(error&&!bypass){
      status.textContent='Falha ao consultar requisitos: '+(error.message||String(error))+
        '. Por segurança, a geração com requisitos está bloqueada. Atualize ou escolha explicitamente continuar sem requisitos.';
      status.dataset.level='error';
      preview.textContent='';
      return;
    }
    for(const row of rows){
      const item=mk('details','qa-r3-item');
      const heading=mk('summary','qa-r3-item-heading');
      const label=mk('label','qa-r3-choice');
      const input=document.createElement('input');
      input.type='checkbox';input.checked=selected.has(row.id);
      input.setAttribute('aria-label','Incluir '+row.codigo+' no contexto');
      input.onchange=event=>{
        selected.has(row.id)?selected.delete(row.id):selected.add(row.id);
        event.stopPropagation();render();
      };
      const name=mk('span','',row.codigo+' · '+row.titulo);
      label.append(input,name);
      // Clicking the checkbox does not expand/collapse the details.
      label.addEventListener('click',e=>e.stopPropagation());
      heading.append(label);item.append(heading,
        mk('p','',row.descricao));
      if(row.criterios_aceite)item.append(mk('p','', 'Critérios de aceite: '+row.criterios_aceite));
      list.append(item);
    }
    if(!rows.length)list.append(mk('p','qa-r3-empty',
      bypass?'Geração sem os requisitos da TF autorizada por você.':
      'Esta TF não possui requisitos aprovados. Você ainda pode gerar com o complemento opcional.'));
    try{
      const context=compose();
      status.textContent=context.selectedCount+
        ' requisito(s) selecionado(s) · '+context.length+'/'+limit+
        ' caracteres, incluindo o complemento opcional. O envio ocorre apenas ao gerar.';
      status.dataset.level='ok';
      preview.textContent=context.text||'Nenhum requisito ou complemento selecionado.';
    }catch(e){
      status.textContent=e.message;
      status.dataset.level='error';
      preview.textContent='Contexto acima do limite. Desmarque itens ou reduza o complemento.';
    }
  }
  async function load(nextTask){
    const seq=++version;
    rows=[];selected.clear();error=null;bypass=false;busy=false;
    task=null;extraText='';
    if(!nextTask){render();return;}
    try{
      requireAuthorizedTask(nextTask,getUserId());
      task=nextTask;busy=true;render();
      const result=await loadApprovedRequirements(db,nextTask,getUserId());
      if(seq!==version)return;
      rows=result;selected=new Set(result.map(x=>x.id));busy=false;render();
    }catch(e){
      if(seq!==version)return;
      task=nextTask;rows=[];selected.clear();error=e;busy=false;render();
    }
  }
  selectAll.onclick=()=>{selected=new Set(rows.map(x=>x.id));render()};
  clear.onclick=()=>{selected.clear();render()};
  refresh.onclick=()=>{if(task)load(task)};
  skip.onclick=()=>{
    if(!error)return;
    bypass=true;error=null;rows=[];selected.clear();render();
  };
  function updateExtra(text){extraText=String(text||'');render()}
  function getContext(text=extraText){
    if(!task)return {text:String(text||'').trim(),selectedIds:[],snapshots:[],selectedCount:0,length:String(text||'').trim().length};
    if(busy)throw Error('Os requisitos ainda estão carregando. Aguarde a conclusão.');
    if(error&&!bypass)throw Error('Requisitos não carregados. Atualize ou selecione continuar sem requisitos.');
    return composeRequirementContext(rows,[...selected],text,{limit,taskId:task.id});
  }
  return {
    load,reset:()=>load(null),updateExtra,getContext,
    get selectedCount(){return rows.filter(x=>selected.has(x.id)).length},
    get taskId(){return task?.id||null}
  };
}
