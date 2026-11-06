import {organizeRelease,reviewRelease,compareTextLines,compareXmlDocuments} from './qa-release-core.mjs';
import {linkTaskRelease,recordComparison,exactTaskCodePresent} from './qa-phase3.mjs';

const el=(tag,attrs={},text='')=>{
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)){
    if(key==='class')node.className=value;
    else if(key==='type')node.type=value;
    else node.setAttribute(key,String(value));
  }
  if(text)node.textContent=text;
  return node;
};
const field=(title,type='textarea',rows=5)=>{
  const outer=el('label',{class:'qa-native-field'});
  outer.append(el('span',{},title));
  const control=el(type);
  if(type==='textarea')control.rows=rows;
  outer.append(control);
  return [outer,control];
};

export function createNativeTools({root,db,getTask,getUserId,toast,onSaved}){
  const panels=new Map(),state=new Map();
  let currentMode='',lastContext=null;
  function box(mode){
    if(panels.has(mode))return panels.get(mode);
    const node=el('section',{class:'panel qa-native-panel',id:'native-'+mode});
    node.hidden=true;root.append(node);panels.set(mode,node);
    return node;
  }
  function actions(node){const r=el('div',{class:'qa-native-actions'});node.append(r);return r}
  function button(label,callback,cls='btn primary'){
    const b=el('button',{type:'button',class:cls},label);
    b.onclick=callback;return b;
  }
  function summary(rootNode,title,result){
    rootNode.replaceChildren();
    if(!result)return;
    rootNode.append(el('h3',{},title));
    const pre=el('pre',{class:'qa-native-result'});
    pre.textContent=result;rootNode.append(pre);
    const row=actions(rootNode);
    row.append(button('Copiar resultado',async()=>{
      try{await navigator.clipboard.writeText(result);toast('Resultado copiado.')}
      catch{toast('Não foi possível copiar automaticamente; selecione o texto exibido.',true)}
    },'btn soft'));
  }
  async function saveEvidence(mode,result){
    const task=getTask(),userId=getUserId();
    if(!task||task.user_id!==userId)return toast('Selecione uma TF da sua conta.',true);
    const type=mode==='diff'?'diff_texto':'diff_xml';
    if(!window.confirm('Salvar somente as contagens na TF '+(task.codigo||task.titulo)+'? Textos e XML originais não serão armazenados.'))return;
    try{
      await recordComparison(db,{taskId:task.id,userId,type,
        values:{adicionados:result.added,removidos:result.removed,alterados:result.changed}});
      toast('Indicadores vinculados à TF; conteúdo original não enviado.');
      onSaved(task.id);
    }catch(e){toast(e.message||String(e),true)}
  }
  function makeDiff(mode){
    const node=box(mode);
    node.append(el('p',{class:'muted'},mode==='diff'
      ?'Compare localmente duas versões de texto. Apenas contagens podem ser vinculadas à TF, após confirmação.'
      :'Compare localmente XML, atributos, valores e namespaces. Nenhum XML é salvo automaticamente.'));
    const layout=el('div',{class:'qa-native-grid'});node.append(layout);
    const [aLabel,a]=field(mode==='diff'?'Texto A (original)':'XML A (original)', 'textarea',10);
    const [bLabel,b]=field(mode==='diff'?'Texto B (novo)':'XML B (novo)','textarea',10);
    layout.append(aLabel,bLabel);
    const options=el('label',{class:'qa-native-checkbox'});
    const trim=el('input',{type:'checkbox'});
    trim.checked=true;
    if(mode==='xml'){options.append(trim,el('span',{},'Ignorar espaços nas pontas dos valores XML'));node.append(options)}
    const resultBox=el('div',{class:'qa-native-output'});
    let last=null;
    const buttons=actions(node);
    const save=button('Salvar contagens na TF',()=>saveEvidence(mode,last),'btn soft');
    save.disabled=true;
    const run=button('Comparar',()=>{
      try{
        if(mode==='diff'){
          last=compareTextLines(a.value,b.value);
          summary(resultBox,'Resumo: '+last.added+' adicionada(s), '+last.removed+' removida(s)',
            last.changes.slice(0,500).map(([tag,line])=>tag+' '+line).join('\n')+
            (last.changes.length>500?'\n\n[Prévia limitada a 500 linhas; contagens completas acima]':''));
        }else{
          last=compareXmlDocuments(a.value,b.value,trim.checked);
          summary(resultBox,last.total?last.total+' diferença(s) XML':'Nenhuma diferença encontrada',
            last.lines.slice(0,500).join('\n')+(last.lines.length>500?'\n[Prévia limitada]':'')||'Estruturas equivalentes.');
        }
        save.disabled=!getTask()||getTask().user_id!==getUserId();
      }catch(e){last=null;save.disabled=true;summary(resultBox,'Erro na comparação',e.message||String(e))}
    });
    buttons.append(run,save);node.append(resultBox);
    for(const input of [a,b,trim]) input.addEventListener('input',()=>{
      last=null;save.disabled=true;
    });
    state.set(mode,{refresh:()=>{save.disabled=!last||!getTask()||getTask().user_id!==getUserId()},
      invalidate:()=>{last=null;save.disabled=true}});
  }
  function makeRelease(){
    const mode='release',node=box(mode);
    node.append(el('p',{class:'muted'},'Organização e conferência de releases diretamente no QA Hub. A associação à TF é sempre confirmada.'));
    const fields=el('div',{class:'qa-native-grid qa-native-release-grid'});node.append(fields);
    const [verLabel,version]=field('Versão (12.10.06.0000)','input');
    version.placeholder='12.10.06.0000';version.maxLength=40;
    const [stLabel,st]=field('Status padrão','select');
    st.add(new Option('12 — Já em build','12'));st.add(new Option('11 — Aguardando versão','11'));
    const [teamLabel,team]=field('Equipe (um nome por linha)','textarea',4);
    const [taskLabel,tasks]=field('Lista autorizada de TFs (SIA)','textarea',10);
    const [noteLabel,notice]=field('Comunicado para comparação','textarea',10);
    const [compatLabel,compat]=field('Compatibilidades','textarea',3);
    const [signatureLabel,signature]=field('Assinatura','input');
    fields.append(verLabel,stLabel,teamLabel,taskLabel,noteLabel,compatLabel,signatureLabel);
    const results=el('div',{class:'qa-native-output'});
    const buttons=actions(node),link=button('Associar TF em foco à release',async()=>{
      const t=getTask();
      if(!t||t.user_id!==getUserId()||!last||!exactTaskCodePresent(t.codigo,last.numbers))return;
      if(!window.confirm('Confirmar a associação da TF #'+t.codigo+' à release '+version.value+'?'))return;
      try{
        await linkTaskRelease(db,{taskId:t.id,version:version.value});
        toast('Release associada à TF.');onSaved(t.id);
      }catch(e){toast(e.message||String(e),true)}
    },'btn soft');
    let last=null;
    const organize=button('Organizar lista',()=>{
      try{
        last=organizeRelease({version:version.value,raw:tasks.value,team:team.value,defaultStatus:st.value});
        summary(results,'Lista organizada',last.text+
          (last.warnings.length?'\n\n--- Conferir ---\n'+last.warnings.join('\n'):''));
        link.disabled=!getTask()||getTask().user_id!==getUserId()||
          !exactTaskCodePresent(getTask().codigo,last.numbers);
      }catch(e){last=null;link.disabled=true;summary(results,'Erro',e.message||String(e))}
    });
    const review=button('Comparar comunicado',()=>{
      try{
        const r=reviewRelease({raw:tasks.value,announcement:notice.value,
          version:version.value,compat:compat.value,signature:signature.value});
        summary(results,'Comunicado BBCode para revisão',r.bbcode+
          '\n\n--- Conferência interna ---\n'+r.report+
          (r.removed?'\n\n--- Itens removidos ---\n'+r.removed:''));
      }catch(e){summary(results,'Erro',e.message||String(e))}
    },'btn soft');
    link.disabled=true;
    buttons.append(organize,review,link);node.append(results);
    for(const input of [version,tasks,st,team])input.addEventListener('input',()=>{
      last=null;link.disabled=true;
    });
    state.set(mode,{refresh:()=>{link.disabled=!last||!getTask()||getTask().user_id!==getUserId()||
      !exactTaskCodePresent(getTask().codigo,last.numbers)},
      invalidate:()=>{last=null;link.disabled=true}});
  }
  makeDiff('diff');makeDiff('xml');makeRelease();
  function open(mode){
    const focused=getTask()?.id||'';
    if(lastContext!==focused){
      for(const controller of state.values())controller.invalidate();
      lastContext=focused;
    }
    currentMode=mode;
    root.hidden=false;
    for(const [name,panel] of panels)panel.hidden=name!==mode;
    state.get(mode)?.refresh();
  }
  function hide(){
    currentMode='';root.hidden=true;
    for(const panel of panels.values())panel.hidden=true;
  }
  function reset(){
    hide();lastContext=null;
    for(const panel of panels.values()){
      for(const control of panel.querySelectorAll('input,textarea')){
        if(control.type==='checkbox')control.checked=true;
        else control.value='';
      }
      panel.querySelector('.qa-native-output')?.replaceChildren();
    }
    for(const controller of state.values())controller.invalidate();
  }
  return {open,hide,reset,refresh:()=>state.get(currentMode)?.refresh()};
}
