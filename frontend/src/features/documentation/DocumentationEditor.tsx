import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Button} from '@heroui/react';
import {Eye,FileCode2,Paperclip,Save} from 'lucide-react';
import {QAModal} from '../../components/ui/QAModal';
import {supabase} from '../../lib/supabase';
import {
 docAttachmentToken,docTypes,docFileAccept,documentationDraftSchema,
 documentationFileFormat,looksLikeSql,saveDocumentation,uploadDocFile
} from './documentation-data';
import type {Documentation,DocDraft,PendingDocFile} from './documentation-data';
import DocumentationFiles from './DocumentationFiles';
import DocumentationMarkdown from './DocumentationMarkdown';

export default function DocumentationEditor({initial,userId,onSaved,onClose}:{
 initial?:Documentation;userId:string;onSaved:(doc:Documentation)=>void;onClose:()=>void
}){
 const [draft,setDraft]=useState<DocDraft>({
  titulo:initial?.titulo??'',conteudo:initial?.conteudo??'',
  tipo_documentacao:initial?.tipo_documentacao??'nota',
  publica:initial?.publica??false,tarefa_id:initial?.tarefa_id??null
 });
 const [files,setFiles]=useState<PendingDocFile[]>([]);
 const [workingId,setWorkingId]=useState(initial?.id);
 const [preview,setPreview]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const input=useRef<HTMLTextAreaElement|null>(null),client=useQueryClient();
 const baseline=JSON.stringify({
  titulo:initial?.titulo??'',conteudo:initial?.conteudo??'',
  tipo_documentacao:initial?.tipo_documentacao??'nota',
  publica:initial?.publica??false,tarefa_id:initial?.tarefa_id??null
 });
 const dirty=files.length>0||JSON.stringify(draft)!==baseline;
 const tasks=useQuery({queryKey:['documentation-task-options',userId],queryFn:async()=>{
  const {data,error}=await supabase.from('qa_tarefas')
   .select('id,titulo,codigo').eq('user_id',userId).order('titulo');
  if(error)throw error;return data??[];
 }});
 function close(){
  if(!busy&&(!dirty||window.confirm('Descartar as alterações não salvas desta documentação?')))onClose();
 }
 function insertSource(source:string){
  setDraft(current=>{
   const text=current.conteudo,position=input.current?.selectionStart??text.length;
   const start=text.slice(0,position),end=text.slice(position);
   const insert=(start&&!start.endsWith('\n')?'\n':'')+source.trimEnd()+'\n'+(end&&!end.startsWith('\n')?'\n':'');
   return {...current,conteudo:start+insert+end};
  });
 }
 function chooseFiles(chosen:File[]){
  if(!chosen.length)return;
  try{
   chosen.forEach(documentationFileFormat);
   const next=chosen.map(file=>({id:crypto.randomUUID(),file}));
   setFiles(current=>[...current,...next]);
   insertSource(next.map(item=>docAttachmentToken(item.id)).join('\n\n'));
   setError('');
  }catch(reason){setError((reason as Error).message);}
 }
 function paste(event:React.ClipboardEvent<HTMLTextAreaElement>){
  const image=Array.from(event.clipboardData.items)
   .find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile();
  if(image){
   event.preventDefault();
   const type=image.type.split('/').pop()??'png';
   chooseFiles([new File([image],'captura-'+Date.now()+'.'+type,{type:image.type})]);
   return;
  }
  const plain=event.clipboardData.getData('text/plain');
  if(looksLikeSql(plain)&&!plain.includes('```')){
   event.preventDefault();
   insertSource('```sql\n'+plain.trim()+'\n```');
  }
 }
 async function save(event:React.FormEvent){
  event.preventDefault();if(busy)return;setError('');setBusy(true);
  let saved:Documentation|undefined;
  try{
   const valid=documentationDraftSchema.parse(draft);
   saved=await saveDocumentation(valid,userId,workingId);
   setWorkingId(saved.id);
   for(const attachment of files){
    await uploadDocFile(attachment.file,saved.id,userId,attachment.id);
    setFiles(current=>current.filter(item=>item.id!==attachment.id));
   }
   await client.invalidateQueries({queryKey:['documentation-files',saved.id]});
   onSaved(saved);
  }catch(reason){
   setError((saved?'O texto foi salvo. Alguns anexos não foram enviados; tente salvar novamente. ':'')+
    (reason as Error).message);
  }finally{setBusy(false);}
 }
 return <QAModal open title={initial?'Editar documentação':'Nova documentação'}
  size="lg" busy={busy} onClose={close} initialFocus="input[name='doc-title']">
  <form className="qa-doc-form" onSubmit={event=>void save(event)}>
   <fieldset disabled={busy}><legend>Sobre a documentação</legend>
    <label className="field">Título
     <input name="doc-title" required minLength={3} maxLength={160} value={draft.titulo}
      placeholder="Ex.: Como configurar e validar a API" onChange={e=>setDraft({...draft,titulo:e.target.value})}/>
    </label>
    <div className="qa-doc-form-grid">
     <label className="field">Tipo<select value={draft.tipo_documentacao}
       onChange={e=>setDraft({...draft,tipo_documentacao:e.target.value as DocDraft['tipo_documentacao']})}>
       {Object.entries(docTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
     <label className="field">TF vinculada (opcional)
      <select disabled={tasks.isPending||tasks.isError} value={draft.tarefa_id??''}
       onChange={e=>setDraft({...draft,tarefa_id:e.target.value||null})}>
       <option value="">Sem vínculo com TF</option>
       {tasks.data?.map(task=><option key={task.id} value={task.id}>
        {task.codigo?task.codigo+' · ':''}{task.titulo}</option>)}
      </select>
     </label>
    </div>
    {tasks.isError&&<p role="alert" className="notice error">
     Não foi possível carregar suas TFs. <button type="button" onClick={()=>void tasks.refetch()}>Tentar novamente</button>
    </p>}
   </fieldset>
   <fieldset disabled={busy}><legend>Conteúdo da página</legend>
    <p>Escreva em Markdown: títulos com #, listas, tabelas e blocos de código entre três crases.
     Cole SQL para criar um bloco de código, ou cole uma imagem para inseri-la na posição do cursor.</p>
    <div className="qa-doc-editor-tabs" role="group" aria-label="Modo de edição">
     <button type="button" aria-pressed={!preview} onClick={()=>setPreview(false)}><FileCode2 size={16}/> Escrever</button>
     <button type="button" aria-pressed={preview} onClick={()=>setPreview(true)}><Eye size={16}/> Visualizar</button>
    </div>
    {!preview?<label className="field">Texto da documentação
      <textarea ref={input} required minLength={3} rows={15} maxLength={80000}
       spellCheck={false} value={draft.conteudo}
       placeholder={'# Título da página\n\nDescreva o objetivo e o procedimento.\n\n## Exemplo SQL\n\nCole o SQL aqui.\n\n## Evidências\n\nSelecione um arquivo ou cole uma imagem.'}
       onChange={e=>setDraft({...draft,conteudo:e.target.value})}
       onPaste={paste}
       onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}}
       onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();chooseFiles(Array.from(e.dataTransfer.files));}}}/>
     </label>:
     <div className="qa-doc-editor-preview" aria-label="Prévia da página Markdown">
      <DocumentationMarkdown markdown={draft.conteudo} docId={workingId} pending={files}/>
     </div>}
   </fieldset>
   <fieldset disabled={busy}><legend>Visibilidade e arquivos</legend>
    <label className="field">Quem pode consultar?
     <select value={draft.publica?'public':'private'}
      onChange={e=>setDraft({...draft,publica:e.target.value==='public'})}>
      <option value="private">Privada — somente você</option>
      <option value="public">Pública — qualquer visitante da biblioteca</option>
     </select></label>
    <p>Uma página pública e os arquivos vinculados podem ser acessados sem login.
     Não publique senhas, tokens ou dados sensíveis. Vincular uma TF não a publica.</p>
    <label className="field qa-doc-upload">
     <span><Paperclip size={17} aria-hidden="true"/> Inserir imagem, SQL, ZIP ou outro arquivo no texto</span>
     <input type="file" multiple accept={docFileAccept} onChange={e=>{
      chooseFiles(Array.from(e.target.files??[]));e.target.value='';
     }}/>
    </label>
    <p>Até 50 MB por arquivo. A referência é inserida no ponto do cursor;
     o upload ocorre ao salvar. Você também pode arrastar um arquivo para o editor.</p>
    {!!files.length&&<ul className="qa-doc-pending">{files.map(attachment=><li key={attachment.id}>
     <span>{attachment.file.name}</span>
     <button type="button" aria-label={'Remover '+attachment.file.name+' da seleção'}
      onClick={()=>setFiles(current=>current.filter(item=>item.id!==attachment.id))}>Remover</button>
    </li>)}</ul>}
   </fieldset>
   {workingId&&<DocumentationFiles docId={workingId} owner onInsert={file=>{setPreview(false);insertSource(docAttachmentToken(file.id));}}/>}
   {error&&<p className="notice error" role="alert">{error}</p>}
   <div className="qa-modal-actions">
    <Button variant="secondary" type="button" isDisabled={busy} onPress={close}>Cancelar</Button>
    <Button type="submit" isDisabled={busy||!dirty||draft.titulo.trim().length<3||draft.conteudo.trim().length<3}>
     <Save size={17}/>{busy?'Salvando…':'Salvar documentação'}
    </Button>
   </div>
  </form>
 </QAModal>;
}
