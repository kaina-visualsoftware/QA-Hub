import {useState} from 'react';
import {Download,Minus,Plus,RotateCcw} from 'lucide-react';
import {QAModal} from '../../components/ui/QAModal';
import type {DocFile} from './documentation-data';

export default function DocumentationPreview({file,url,text,onClose}:{
 file:Pick<DocFile,'nome'|'mime'>;url:string;text?:string;onClose:()=>void
}){
 const [zoom,setZoom]=useState(1);
 function download(){
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download=file.nome;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
 }
 return <QAModal open title={'Visualizar anexo — '+file.nome} size="full" onClose={onClose}>
   <div className="qa-doc-preview-toolbar">
    <span className="qa-doc-preview-filename">{file.nome}</span>
    {file.mime.startsWith('image/')&&<div className="qa-doc-zoom-controls" role="group" aria-label="Zoom da imagem">
      <button type="button" onClick={()=>setZoom(x=>Math.max(.5,Math.round((x-.25)*100)/100))} disabled={zoom<=.5} aria-label="Diminuir zoom"><Minus size={17}/></button>
      <output aria-label="Nível de zoom">{Math.round(zoom*100)}%</output>
      <button type="button" onClick={()=>setZoom(x=>Math.min(5,Math.round((x+.25)*100)/100))} disabled={zoom>=5} aria-label="Aumentar zoom"><Plus size={17}/></button>
      <button type="button" onClick={()=>setZoom(1)} aria-label="Redefinir zoom"><RotateCcw size={16}/></button>
    </div>}
    <button type="button" className="qa-doc-preview-download" onClick={download}><Download size={16}/> Baixar</button>
   </div>
   {file.mime.startsWith('image/')&&<div className="qa-doc-zoom-viewport" role="region" aria-label="Imagem ampliável" tabIndex={0}>
     <img className="qa-resource-preview-image" src={url} alt={file.nome}
       style={{width:zoom*100+'%',maxWidth:'none',height:'auto'}}/>
   </div>}
   {file.mime.startsWith('video/')&&<video className="qa-doc-video" controls preload="metadata" src={url} aria-label={file.nome}><track kind="captions"/></video>}
   {file.mime==='application/pdf'&&<iframe className="qa-doc-pdf" sandbox="" referrerPolicy="no-referrer" src={url} title={file.nome}/>}
   {text!==undefined&&<pre className="qa-resource-text qa-doc-source-preview"><code>{text}</code></pre>}
   {!file.mime.startsWith('image/')&&!file.mime.startsWith('video/')&&file.mime!=='application/pdf'&&text===undefined&&
     <p className="qa-doc-muted">Este formato pode ser baixado para consulta no programa apropriado.</p>}
 </QAModal>;
}
