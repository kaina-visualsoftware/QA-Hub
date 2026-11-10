import {linkTaskRelease,createReference} from './qa-phase3.mjs';
import {normalizeTaskVersion,wireTaskVersionInput} from './qa-version.mjs';

export function createPhase3Ui({db,getTask,getTaskId,getUserId,toast,onDocuments,markDirty}){
 const $=id=>document.getElementById(id),create=(tag,cls='',label='')=>{
   const element=document.createElement(tag);
   if(cls)element.className=cls;
   if(label)element.textContent=label;
   return element;
 };
 wireTaskVersionInput($('links-release-version'));
 let loadedFor=null,links=[],releases=[],comparisons=[],references=[],saving=false,request=0;
 const clear=id=>$(id).replaceChildren();
 const status=(id,message)=>{$(id).textContent=message};
 const date=iso=>iso?new Date(iso).toLocaleString('pt-BR'):'—';
 const empty=(id,message)=>{
   $(id).append(create('p','muted fine',message));
 };
 function reset(){
   request++;loadedFor=null;links=[];releases=[];comparisons=[];references=[];
   for(const id of ['links-release-list','links-comparison-list','links-reference-list'])clear(id);
   for(const id of ['links-release-status','links-reference-status'])status(id,'');
   $('links-reference-safe').checked=false;
 }
 function render(){
   clear('links-release-list');clear('links-comparison-list');clear('links-reference-list');
   const task=getTask(),userId=getUserId();
   const owns=Boolean(task&&task.user_id===userId);
   $('links-release-save').disabled=!owns||saving;
   $('links-reference-save').disabled=!userId||saving;
   if(!owns)status('links-release-status','Somente o proprietário da TF pode associar releases a ela.');
   const byId=new Map(releases.map(r=>[r.id,r]));
   const related=links.map(l=>byId.get(l.release_id)).filter(Boolean)
     .sort((a,b)=>b.versao.localeCompare(a.versao));
   if(!related.length)empty('links-release-list','Esta TF ainda não está associada a uma release.');
   for(const release of related){
     const row=create('article','qa-phase3-item');
     row.append(create('strong','',normalizeTaskVersion(release.versao)),create('small','',date(release.created_at)));
     $('links-release-list').append(row);
   }
   if(!comparisons.length)empty('links-comparison-list','Ainda não há indicadores de comparação salvos nesta TF.');
   for(const result of comparisons){
     const row=create('article','qa-phase3-item');
     row.append(create('strong','',result.tipo==='diff_xml'?'Comparação de XML':'Comparação de textos'),
       create('span','','Adicionados: '+result.adicionados+' · Removidos: '+result.removidos+' · Alterados: '+result.alterados),
       create('small','',date(result.created_at)));
     $('links-comparison-list').append(row);
   }
   if(!references.length)empty('links-reference-list','Nenhuma referência privada cadastrada. Crie um checklist ou regra para reutilizar em outras TFs.');
   for(const reference of references){
     const card=create('article','qa-phase3-item qa-phase3-reference');
     card.append(create('strong','',reference.titulo),
       create('small','',({checklist:'Checklist',regra:'Regra',nota:'Nota'}[reference.categoria]||'Referência')),
       create('p','',reference.conteudo));
     const actions=create('div','qa-phase3-actions');
     const copy=create('button','btn soft','Copiar');
     copy.type='button';copy.onclick=async()=>{
       try{await navigator.clipboard.writeText(reference.conteudo);toast('Referência copiada.')}
       catch{toast('Não foi possível copiar; selecione o texto da referência.',true)}
     };
     const insert=create('button','btn soft','Inserir no documento');
     insert.type='button';insert.disabled=!getTaskId();
     insert.onclick=()=>{
       const box=$('document-content');
       const added='## '+reference.titulo+'\n'+reference.conteudo;
       const existing=box.value.trim();
       if(existing&&!confirm('Acrescentar a referência ao documento em edição?'))return;
       box.value=existing?existing+'\n\n'+added:added;
       markDirty('document-form',true);
       onDocuments();
       toast('Referência adicionada ao rascunho do documento. Revise antes de salvar.');
       box.focus();
     };
     const remove=create('button','btn soft','Excluir');
     remove.type='button';remove.onclick=async()=>{
       if(!confirm('Excluir esta referência de todas as TFs? Documentos já salvos não serão alterados.'))return;
       const {error}=await db.from('qa_referencias').delete()
         .eq('id',reference.id).eq('user_id',userId);
       if(error)return toast(error.message||String(error),true);
       references=references.filter(x=>x.id!==reference.id);render();
       toast('Referência excluída.');
     };
     actions.append(copy,insert,remove);card.append(actions);
     $('links-reference-list').append(card);
   }
 }

 async function load(taskId){
   if(!taskId||!getUserId()){reset();return}
   const token=++request;loadedFor=taskId;
   const [rl,rs,c,r]=await Promise.all([
     db.from('qa_release_tarefas').select('release_id,tarefa_id')
       .eq('tarefa_id',taskId).limit(300),
     db.from('qa_releases').select('id,versao,created_at')
       .eq('user_id',getUserId()).limit(400),
     db.from('qa_artefatos').select('id,tipo,adicionados,removidos,alterados,created_at')
       .eq('tarefa_id',taskId).order('created_at',{ascending:false}).limit(100),
     db.from('qa_referencias').select('id,categoria,titulo,conteudo,created_at')
       .eq('user_id',getUserId()).order('created_at',{ascending:false}).limit(100)
   ]);
   for(const result of [rl,rs,c,r])if(result.error)throw result.error;
   if(token!==request||taskId!==getTaskId())return;
   links=rl.data||[];releases=rs.data||[];comparisons=c.data||[];references=r.data||[];
   render();
 }
 $('links-release-save').addEventListener('click',async()=>{
   const task=getTask();
   if(!task||saving)return;
   if(task.user_id!==getUserId())return toast('A associação exige a propriedade da TF.',true);
   const version=normalizeTaskVersion($('links-release-version').value);
   if(!confirm('Confirmar que a TF '+(task.codigo||task.titulo)+' pertence à release '+version+'?'))return;
   saving=true;$('links-release-save').disabled=true;
   status('links-release-status','Associando à release...');
   try{
     await linkTaskRelease(db,{taskId:task.id,version});
     status('links-release-status','TF associada. A operação não modificou a tarefa.');
     await load(task.id);
     toast('Release vinculada à TF.');
   }catch(error){status('links-release-status',error.message||String(error));toast(error.message||String(error),true)}
   finally{saving=false;render()}
 });
 $('links-reference-save').addEventListener('click',async()=>{
   if(saving)return;
   if(!$('links-reference-safe').checked){
     status('links-reference-status','Confirme que o conteúdo não contém credenciais nem dados pessoais.');
     return;
   }
   saving=true;render();status('links-reference-status','Salvando referência privada...');
   try{
     await createReference(db,{userId:getUserId(),
       categoria:$('links-reference-category').value,
       titulo:$('links-reference-title').value,
       conteudo:$('links-reference-content').value
     });
     $('links-reference-title').value='';$('links-reference-content').value='';
     $('links-reference-safe').checked=false;
     const current=getTaskId();
     await load(current);
     status('links-reference-status','Referência salva na sua conta.');
     toast('Referência disponível para reutilização.');
   }catch(error){status('links-reference-status',error.message||String(error));toast(error.message||String(error),true)}
   finally{saving=false;render()}
 });
 return {load,reset,render};
}
