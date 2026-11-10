import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Button} from '@heroui/react';
import {Paperclip,Save} from 'lucide-react';
import {QAModal} from '../../components/ui/QAModal';
import {supabase} from '../../lib/supabase';
import {docTypes,docFileAccept,documentationDraftSchema,documentationFileFormat,saveDocumentation,uploadDocFile} from './documentation-data';
import type {Documentation,DocDraft} from './documentation-data';
import DocumentationFiles from './DocumentationFiles';
export default function DocumentationEditor({initial,userId,onSaved,onClose}:{initial?:Documentation;userId:string;onSaved:(doc:Documentation)=>void;onClose:()=>void}){
 const [draft,setDraft]=useState<DocDraft>({titulo:initial?.titulo??'',conteudo:initial?.conteudo??'',tipo_documentacao:initial?.tipo_documentacao??'nota',publica:initial?.publica??false,tarefa_id:initial?.tarefa_id??null});
 const [files,setFiles]=useState<File[]>([]),[workingId,setWorkingId]=useState(initial?.id),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const baseline=JSON.stringify({titulo:initial?.titulo??'',conteudo:initial?.conteudo??'',tipo_documentacao:initial?.tipo_documentacao??'nota',publica:initial?.publica??false,tarefa_id:initial?.tarefa_id??null});
 const dirty=files.length>0||JSON.stringify(draft)!==baseline;
 const tasks=useQuery({queryKey:['documentation-task-options',userId],queryFn:async()=>{
  const {data,error}=await supabase.from('qa_tarefas').select('id,titulo,codigo').eq('user_id',userId).order('titulo');if(error)throw error;return data??[];
 }});
 function close(){if(!busy&&(!dirty||window.confirm('Descartar as alterações não salvas desta documentação?')))onClose();}
 async function save(event:React.FormEvent){
  event.preventDefault();if(busy)return;setError('');setBusy(true);
  let saved:Documentation|undefined;
  try{
   const valid=documentationDraftSchema.parse(draft);
   saved=await saveDocumentation(valid,userId,workingId);setWorkingId(saved.id);
   for(const file of files){await uploadDocFile(file,saved.id,userId);setFiles(current=>current.filter(item=>item!==file));}
   onSaved(saved);
  }catch(reason){setError((saved?'O texto foi salvo. Alguns anexos não foram enviados; tente salvar novamente. ':'')+(reason as Error).message);}
  finally{setBusy(false);}
 }
 return <QAModal open title={initial?'Editar documentação':'Nova documentação'} size="lg" busy={busy} onClose={close} initialFocus="input[name='doc-title']">
  <form className="qa-doc-form" onSubmit={event=>void save(event)}>
   <fieldset disabled={busy}><legend>Sobre a documentação</legend>
    <label className="field">Título<input name="doc-title" required minLength={3} maxLength={160} value={draft.titulo} placeholder="Ex.: Como resolver uma falha na emissão de notas" onChange={e=>setDraft({...draft,titulo:e.target.value})}/></label>
    <div className="qa-doc-form-grid">
     <label className="field">Tipo<select value={draft.tipo_documentacao} onChange={e=>setDraft({...draft,tipo_documentacao:e.target.value as DocDraft['tipo_documentacao']})}>
      {Object.entries(docTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}
     </select></label>
     <label className="field">TF vinculada (opcional)<select disabled={tasks.isPending||tasks.isError} value={draft.tarefa_id??''} onChange={e=>setDraft({...draft,tarefa_id:e.target.value||null})}>
      <option value="">Sem vínculo com TF</option>{tasks.data?.map(task=><option key={task.id} value={task.id}>{task.codigo?task.codigo+' · ':''}{task.titulo}</option>)}
     </select></label>
    </div>
    {tasks.isError&&<p role="alert" className="notice error">Não foi possível carregar suas TFs. <button type="button" onClick={()=>void tasks.refetch()}>Tentar novamente</button></p>}
   </fieldset>
   <fieldset disabled={busy}><legend>Conteúdo</legend>
    <p>Descreva o contexto, os passos e a solução. O texto mantém parágrafos e quebras de linha.</p>
    <label className="field">Texto da documentação<textarea required minLength={3} rows={12} maxLength={80000} value={draft.conteudo} placeholder={'Contexto\nQual problema esta documentação resolve?\n\nPasso a passo\n1. ...\n\nResultado esperado\nComo conferir que funcionou?'} onChange={e=>setDraft({...draft,conteudo:e.target.value})}/></label>
   </fieldset>
   <fieldset disabled={busy}><legend>Visibilidade e anexos</legend>
    <label className="field">Quem pode consultar?<select value={draft.publica?'public':'private'} onChange={e=>setDraft({...draft,publica:e.target.value==='public'})}>
     <option value="private">Privada — somente você</option><option value="public">Pública — qualquer pessoa com o link</option>
    </select></label>
    <p>Todos os anexos acompanham esta configuração. Vincular uma TF não altera a visibilidade de nenhum dos dois registros.</p>
    <label className="field qa-doc-upload"><span><Paperclip size={17} aria-hidden="true"/> Adicionar arquivos, imagens ou vídeos</span>
     <input type="file" multiple accept={docFileAccept} onChange={e=>{
      const chosen=Array.from(e.target.files??[]);try{chosen.forEach(documentationFileFormat);setFiles(current=>[...current,...chosen]);setError('');}catch(reason){setError((reason as Error).message);}e.target.value='';
     }}/></label><p>Até 50 MB por arquivo. Os anexos serão enviados ao salvar.</p>
    {!!files.length&&<ul className="qa-doc-pending">{files.map((file,index)=><li key={index}><span>{file.name}</span><button type="button" aria-label={'Remover '+file.name+' da seleção'} onClick={()=>setFiles(items=>items.filter((_,i)=>i!==index))}>Remover</button></li>)}</ul>}
   </fieldset>
   {workingId&&<DocumentationFiles docId={workingId} owner/>}
   {error&&<p className="notice error" role="alert">{error}</p>}
   <div className="qa-modal-actions"><Button variant="secondary" type="button" isDisabled={busy} onPress={close}>Cancelar</Button>
    <Button type="submit" isDisabled={busy||!dirty||draft.titulo.trim().length<3||draft.conteudo.trim().length<3}><Save size={17}/>{busy?'Salvando…':'Salvar documentação'}</Button></div>
  </form>
 </QAModal>;
}
