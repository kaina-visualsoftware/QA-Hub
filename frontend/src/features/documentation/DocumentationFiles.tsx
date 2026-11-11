import {useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Download,Eye,Paperclip,Trash2} from 'lucide-react';
import DocumentationPreview from './DocumentationPreview';
import {ToastNotice} from '../../components/ui/Toasts';
import {listDocFiles,readDocFile,removeDocFile} from './documentation-data';
import type {DocFile} from './documentation-data';
export default function DocumentationFiles({docId,owner,onInsert}:{docId:string;owner:boolean;onInsert?:(file:DocFile)=>void}){
 const client=useQueryClient(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [preview,setPreview]=useState<{file:DocFile;url:string;text?:string}|null>(null);
 const files=useQuery({queryKey:['documentation-files',docId],queryFn:()=>listDocFiles(docId)});
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
 async function open(file:DocFile,download=false){
  if(busy)return;setBusy(true);setError('');
  try{
   const blob=await readDocFile(file),url=URL.createObjectURL(blob);
   if(download){const a=document.createElement('a');a.href=url;a.download=file.nome;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
   else setPreview({file,url,text:/^(text\/|application\/json|application\/xml)/.test(file.mime)?(await blob.text()).slice(0,200000):undefined});
  }catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
 }
 async function remove(file:DocFile){
  if(busy||!window.confirm('Excluir o anexo “'+file.nome+'”?'))return;
  setBusy(true);setError('');try{await removeDocFile(file);}
  catch(reason){setError((reason as Error).message);}finally{setBusy(false);await client.invalidateQueries({queryKey:['documentation-files',docId]});}
 }
 return <section className="qa-doc-files" aria-label="Anexos da documentação">
  <h3><Paperclip size={18} aria-hidden="true"/> Anexos</h3>
  <ToastNotice message={error||files.error?.message} tone="error"/>
  {files.isPending&&<p role="status">Carregando anexos…</p>}
  {files.isSuccess&&!files.data.length&&<p className="qa-doc-muted">Nenhum arquivo anexado.</p>}
  <div className="qa-resource-list">{files.data?.map(file=><article className="qa-resource-row" key={file.id}>
   <div className="qa-resource-copy"><strong>{file.nome}</strong><small>{(file.tamanho/1024/1024).toLocaleString('pt-BR',{maximumFractionDigits:2})} MB</small></div>
   <div className="qa-resource-actions">
    {/^(image\/|video\/|text\/)|^application\/(pdf|json|xml)$/.test(file.mime)&&<button type="button" disabled={busy} onClick={()=>void open(file)}><Eye size={16}/> Visualizar</button>}
    <button type="button" disabled={busy} onClick={()=>void open(file,true)}><Download size={16}/> Baixar</button>
    {owner&&onInsert&&<button type="button" disabled={busy} onClick={()=>onInsert(file)}>Inserir no texto</button>}
    {owner&&<button type="button" disabled={busy} onClick={()=>void remove(file)}><Trash2 size={16}/> Excluir anexo</button>}
   </div>
  </article>)}</div>
  {preview&&<DocumentationPreview file={preview.file} url={preview.url} text={preview.text} onClose={()=>setPreview(null)}/>} 
 </section>;
}
