import {useEffect,useRef,useState} from "react";
import {ToastNotice} from "../../components/ui/Toasts";
import {Button} from "@heroui/react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Download,Eye,FilePlus2,FileText,Image as ImageIcon,X} from "lucide-react";
import type {Scenario,Task} from "../../lib/contracts";
import {supabase} from "../../lib/supabase";
import {
  ACCEPT_EVIDENCE,MAX_EVIDENCE_BYTES, listEvidenceFiles,readPrivateEvidence,
  uploadEvidenceFile
} from "./evidence-files";
import type {EvidenceFile} from "./evidence-files";

function formatBytes(value:number){
  return value<1024 ? value+" B" : value<1048576
    ? (value/1024).toFixed(1)+" KB" : (value/1048576).toFixed(1)+" MB";
}
function saveBlob(blob:Blob,name:string) {
  const objectUrl=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=objectUrl;anchor.download=name;anchor.style.display="none";
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),15000);
}
type Preview={file:EvidenceFile;url:string;text?:string};

export function EvidenceFilesPanel({task,userId,scenarios,scenarioId,readOnly=false}:{
  task:Task;userId:string;scenarios:Scenario[];scenarioId:string|null;readOnly?:boolean;
}) {
  const client=useQueryClient();
  const [file,setFile]=useState<File|null>(null);
  const [description,setDescription]=useState("");
  const [busy,setBusy]=useState(false);
  const [previewBusy,setPreviewBusy]=useState(false);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const fileInput=useRef<HTMLInputElement|null>(null);
  const files=useQuery({
    queryKey:["evidence-files",userId,task.id],
    queryFn:()=>listEvidenceFiles(supabase,task.id)
  });
  useEffect(()=>{
    const url=preview?.url;
    return ()=>{if(url)URL.revokeObjectURL(url);};
  },[preview?.url]);
  async function upload(event:React.FormEvent){
    event.preventDefault();
    if(!file||busy)return;
    setError("");setMessage("");setBusy(true);
    try{
      const item=await uploadEvidenceFile(supabase,{
        file,userId,taskId:task.id,scenarioId:scenarioId||null,
        scenarioIds:scenarios.map(s=>s.id),description
      });
      setMessage("Anexo privado registrado: "+item.nome_original);
      setFile(null);setDescription("");
      if(fileInput.current)fileInput.current.value="";
      await Promise.all([
        client.invalidateQueries({queryKey:["evidence-files",userId,task.id]}),
        client.invalidateQueries({queryKey:["audit",userId,task.id]}),
        client.invalidateQueries({queryKey:["gen-support",userId,task.id]})
      ]);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Não foi possível anexar o arquivo.");
    }finally{setBusy(false);}
  }
  async function view(item:EvidenceFile){
    if(previewBusy)return;
    setError("");setPreviewBusy(true);
    try{
      const blob=await readPrivateEvidence(supabase,item,userId,task.id);
      const url=URL.createObjectURL(blob);
      const text=item.mime_type==="text/plain"
        ? (await blob.text()).slice(0,20000):undefined;
      setPreview({file:item,url,text});
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Falha ao abrir anexo.");
    }finally{setPreviewBusy(false);}
  }
  async function download(item:EvidenceFile){
    setError("");setPreviewBusy(true);
    try {
      const blob=await readPrivateEvidence(supabase,item,userId,task.id);
      saveBlob(blob,item.nome_original);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Falha no download.");
    }finally{setPreviewBusy(false);}
  }
  return <section className="qa-files" aria-labelledby="qa-files-title">
    <header className="qa-files-head">
      <div>
        <h3 id="qa-files-title">Arquivos da TF</h3>
        <p>Imagens, PDF ou texto. Até 10 MB por arquivo.</p>
      </div>
      <span className="count-pill">{files.data?.length??0} arquivo(s)</span>
    </header>
    {!readOnly&&<form className="qa-files-upload" onSubmit={event=>void upload(event)}>
      <label className="field qa-files-picker-field">Selecionar arquivo
        <span className="qa-files-picker">
          <span className="qa-files-picker-button">Escolher arquivo</span>
          <span className="qa-files-picker-name">{file?.name||"Nenhum arquivo selecionado"}</span>
        </span>
        <input ref={fileInput} type="file" className="qa-files-hidden-input"
          accept={ACCEPT_EVIDENCE} disabled={busy}
          onChange={event=>{setError("");setMessage("");setFile(event.target.files?.[0]??null);}}/>
      </label>
      <label className="field">Descrição (opcional)
        <input value={description} maxLength={1000} disabled={busy}
          placeholder="Ex.: total do pedido antes da correção"
          onChange={event=>setDescription(event.target.value)}/>
      </label>
      <div className="qa-files-upload-actions">
        {file&&<span className="qa-files-chosen" title={file.name}>
          {file.name} · {formatBytes(file.size)}
        </span>}
        <Button type="submit" isDisabled={!file||busy||
          (file?.size??0)>MAX_EVIDENCE_BYTES}>
          <FilePlus2 size={16} aria-hidden="true"/>
          {busy?"Enviando…":"Anexar arquivo"}
        </Button>
      </div>
      <p className="qa-files-privacy">Privado para a conta proprietária.
        Remova dados sensíveis antes de enviar; arquivos não passam por antivírus.</p>
      <ToastNotice message={message} tone="success"/>
      <ToastNotice message={error} tone="error"/>
    </form>}
    {files.isPending&&<p className="text-muted text-sm" role="status">Carregando arquivos…</p>}
    {files.isError&&<p className="notice error" role="alert">
      Não foi possível carregar os anexos: {files.error.message}
    </p>}
    {files.isSuccess&&files.data.length===0&&<p className="qa-files-empty">
      Nenhum arquivo anexado. Adicione uma captura ou um documento do teste.</p>}
    {files.data&&files.data.length>0&&<div className="qa-files-list">
      {files.data.map(item=><article className="qa-file-item" key={item.id}>
        <span className="qa-file-icon">{item.mime_type.startsWith("image/")
          ?<ImageIcon size={19} aria-hidden="true"/>:<FileText size={19} aria-hidden="true"/>}</span>
        <div className="qa-file-meta">
          <strong title={item.nome_original}>{item.nome_original}</strong>
          <small>{formatBytes(item.tamanho_bytes)} · {new Date(item.created_at).toLocaleDateString("pt-BR")}
            {" · "}{scenarios.find(s=>s.id===item.cenario_id)?.titulo||"TF geral"}</small>
          {item.descricao&&<p>{item.descricao}</p>}
        </div>
        <div className="qa-file-actions">
          <button type="button" disabled={previewBusy} onClick={()=>void view(item)}>
            <Eye size={16} aria-hidden="true"/> Visualizar</button>
          <button type="button" disabled={previewBusy} onClick={()=>void download(item)}>
            <Download size={16} aria-hidden="true"/> Baixar</button>
        </div>
      </article>)}
    </div>}
    {preview&&<section className="qa-file-preview" aria-label="Prévia do anexo privado">
      <header>
        <strong>{preview.file.nome_original}</strong>
        <button type="button" onClick={()=>setPreview(null)}
          aria-label="Fechar prévia do arquivo"><X size={18} aria-hidden="true"/></button>
      </header>
      {preview.file.mime_type.startsWith("image/")&&
        <img src={preview.url} alt={"Evidência: "+preview.file.nome_original}/>}
      {preview.file.mime_type==="application/pdf"&&
        <iframe title={"Prévia PDF: "+preview.file.nome_original}
          sandbox="" referrerPolicy="no-referrer" src={preview.url}/>}
      {preview.file.mime_type==="text/plain"&&
        <pre>{preview.text}</pre>}
      <div className="qa-file-preview-actions">
        {preview.file.mime_type==="text/plain"&&(preview.text?.length??0)>=20000&&
          <span className="text-muted text-sm">Prévia limitada aos primeiros 20.000 caracteres.</span>}
        <Button variant="secondary" onPress={()=>void download(preview.file)}>
          <Download size={16} aria-hidden="true"/> Baixar original
        </Button>
      </div>
    </section>}
  </section>;
}
