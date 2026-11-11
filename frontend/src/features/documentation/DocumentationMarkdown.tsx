import {useEffect,useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import {Download,Eye,FileArchive,FileCode2,FileText,Image as ImageIcon} from 'lucide-react';
import type {DocFile,PendingDocFile} from './documentation-data';
import {listDocFiles,readDocFile} from './documentation-data';
import DocumentationPreview from './DocumentationPreview';

type Section={kind:'markdown';source:string}|{kind:'attachment';id:string};
const marker=/^\s*\{\{arquivo:([0-9a-f-]{36})\}\}\s*$/i;

/** Standalone markers are embedded in place. Markers inside code fences remain literal. */
export function splitDocumentMarkdown(markdown:string):Section[]{
 const sections:Section[]=[],buffer:string[]=[];
 let fenced=false;
 const flush=()=>{if(buffer.length){sections.push({kind:'markdown',source:buffer.join('\n')});buffer.length=0;}};
 for(const line of markdown.replace(/\r\n?/g,'\n').split('\n')){
  if(/^\s*```/.test(line)){fenced=!fenced;buffer.push(line);continue;}
  const file=!fenced?marker.exec(line):null;
  if(file){flush();sections.push({kind:'attachment',id:file[1].toLowerCase()});}
  else buffer.push(line);
 }
 flush();return sections;
}

/** GitHub-flavoured Markdown, cleaned before being inserted into the DOM.
 * Never interpret file data as HTML, JSX or executable SQL. */
function SafeMarkdown({source}:{source:string}){
 const html=useMemo(()=>{
  const parsed=marked.parse(source,{gfm:true,breaks:true,async:false});
  return DOMPurify.sanitize(String(parsed),{
   USE_PROFILES:{html:true},
   FORBID_TAGS:['script','style','iframe','object','embed','form','input','button','svg'],
   FORBID_ATTR:['style','srcdoc']
  });
 },[source]);
 return <div className="qa-doc-markdown-content" dangerouslySetInnerHTML={{__html:html}}/>;
}

function InlineDocumentAttachment({file,pending}:{file?:DocFile;pending?:PendingDocFile}){
 const name=file?.nome??pending?.file.name??'Anexo';
 const mime=file?.mime??pending?.file.type??'application/octet-stream';
 const size=file?.tamanho??pending?.file.size??0;
 const isImage=mime.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/i.test(name);
 const isVideo=mime.startsWith('video/');
 const isText=/\.(sql|txt|log|json|xml|csv|md)$/i.test(name);
 const isZip=/\.(zip)$/i.test(name);
 const [url,setUrl]=useState('');
 const [lazyUrl,setLazyUrl]=useState('');
 const [source,setSource]=useState<string|undefined>(undefined);
 const [preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(!isImage&&!(isText&&size<=512000))return;
  let closed=false,objectUrl='';
  void (async()=>{
   try{
    const blob=pending?.file??(file?await readDocFile(file):null);
    if(!blob||closed)return;
    objectUrl=URL.createObjectURL(blob);
    if(isText){const value=(await blob.text()).slice(0,200000);if(!closed)setSource(value);}
    if(!closed)setUrl(objectUrl);
   }catch(reason){if(!closed)setError((reason as Error).message);}
  })();
  return ()=>{closed=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[file?.path,pending?.id,isImage,isText,size]);
 useEffect(()=>()=>{if(lazyUrl)URL.revokeObjectURL(lazyUrl);},[lazyUrl]);
 async function load(){
  if(url||lazyUrl)return {url:url||lazyUrl,text:source};
  const blob=pending?.file??(file?await readDocFile(file):null);
  if(!blob)throw Error('Anexo indisponível ou sem permissão de leitura.');
  const nextUrl=URL.createObjectURL(blob);setLazyUrl(nextUrl);
  const text=isText?(await blob.text()).slice(0,200000):undefined;
  if(text!==undefined)setSource(text);
  return {url:nextUrl,text};
 }
 async function show(){setBusy(true);setError('');
  try{await load();setPreview(true);}catch(reason){setError((reason as Error).message);}
  finally{setBusy(false);}
 }
 async function download(){setBusy(true);setError('');
  try{
   const result=await load(),a=document.createElement('a');
   a.href=result.url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  }catch(reason){setError((reason as Error).message);}
  finally{setBusy(false);}
 }
 return <figure className="qa-doc-embed" aria-label={'Anexo: '+name}>
  {isImage&&url&&<button className="qa-doc-embed-image" type="button" onClick={()=>void show()} aria-label={'Ampliar imagem '+name}>
    <img src={url} alt={name} loading="lazy"/>
  </button>}
  {isText&&source!==undefined&&<pre className="qa-doc-embed-code"><code>{source}</code></pre>}
  {!((isImage&&url)||(isText&&source!==undefined))&&
   <div className="qa-doc-embed-file-icon" aria-hidden="true">
    {isZip?<FileArchive size={22}/>:isImage?<ImageIcon size={22}/>:isText?<FileCode2 size={22}/>:<FileText size={22}/>}
   </div>}
  <figcaption className="qa-doc-embed-bar">
   <span className="qa-doc-embed-name">{name}<small>{Math.max(.01,size/1024/1024).toLocaleString('pt-BR',{maximumFractionDigits:2})} MB</small></span>
   <span className="qa-doc-embed-actions">
    {(isImage||isVideo||isText||mime==='application/pdf')&&<button type="button" disabled={busy} onClick={()=>void show()}><Eye size={16}/> Visualizar</button>}
    <button type="button" disabled={busy} onClick={()=>void download()}><Download size={16}/> Baixar</button>
   </span>
  </figcaption>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {preview&&(url||lazyUrl)&&<DocumentationPreview file={{nome:name,mime}} url={url||lazyUrl} text={source} onClose={()=>setPreview(false)}/>}
 </figure>;
}
export default function DocumentationMarkdown({markdown,files=[],pending=[],docId}:{
 markdown:string;files?:DocFile[];pending?:PendingDocFile[];docId?:string
}){
 const loaded=useQuery({queryKey:['documentation-files',docId],queryFn:()=>listDocFiles(docId!),enabled:!!docId});
 const visibleFiles=docId?(loaded.data??files):files;
 const parts=useMemo(()=>splitDocumentMarkdown(markdown),[markdown]);
 const existing=useMemo(()=>new Map(visibleFiles.map(file=>[file.id.toLowerCase(),file])),[visibleFiles]);
 const waiting=useMemo(()=>new Map(pending.map(file=>[file.id.toLowerCase(),file])),[pending]);
 return <article className="qa-doc-prose qa-doc-markdown" aria-label="Documentação renderizada">
  {parts.map((part,index)=>part.kind==='markdown'
   ?<SafeMarkdown key={'text-'+index} source={part.source}/>
   :existing.has(part.id)||waiting.has(part.id)
    ?<InlineDocumentAttachment key={'file-'+part.id} file={existing.get(part.id)} pending={waiting.get(part.id)}/>
    :<p className="qa-doc-missing-file" key={'missing-'+index}>Anexo indisponível ou não autorizado.</p>)}
 </article>;
}
