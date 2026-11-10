import {useEffect,useRef,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {ClipboardPaste,ImagePlus,Image as ImageIcon,Eye} from "lucide-react";
import type {Scenario,Task} from "../../lib/contracts";
import {supabase} from "../../lib/supabase";
import {listEvidenceFiles,readPrivateEvidence,uploadEvidenceFile,
  updateEvidenceDescription,removeEvidenceFile} from "./evidence-files";
import type {EvidenceFile} from "./evidence-files";
import "./scenario-evidence.css";
import {QAModal} from "../../components/ui/QAModal";

const images=["image/png","image/jpeg","image/webp"];
export function imageFromClipboard(event:React.ClipboardEvent):File|null {
  const source=Array.from(event.clipboardData.items).find(item=>
    item.kind==="file"&&images.includes(item.type));
  const file=source?.getAsFile();
  if(!file)return null;
  const extension=file.type==="image/jpeg"?"jpg":file.type==="image/webp"?"webp":"png";
  return new File([file],"captura-"+Date.now()+"."+extension,{type:file.type});
}
export function ScenarioEvidencePanel({task,userId,scenario}:{
 task:Task;userId:string;scenario:Scenario
}) {
  const queryClient=useQueryClient();
  const [selected,setSelected]=useState<File|null>(null);
  const [description,setDescription]=useState("");
  const [busy,setBusy]=useState(false);
  const [editingFile,setEditingFile]=useState<string|null>(null);
  const [editedDescription,setEditedDescription]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [openPreview,setOpenPreview]=useState<{file:EvidenceFile;url:string}|null>(null);
  const input=useRef<HTMLInputElement>(null);
  const privateOwner=task.user_id===userId;
  const files=useQuery({
    queryKey:["evidence-files",userId,task.id],
    queryFn:()=>listEvidenceFiles(supabase,task.id),
    enabled:privateOwner
  });
  const current=(files.data??[]).filter(f=>f.cenario_id===scenario.id&&images.includes(f.mime_type));
  const [fileUrl,setFileUrl]=useState("");
  useEffect(()=>{
    if(!selected){setFileUrl("");return;}
    const url=URL.createObjectURL(selected);
    setFileUrl(url);
    return()=>URL.revokeObjectURL(url);
  },[selected]);
  useEffect(()=>{
    const url=openPreview?.url;
    return()=>{if(url)URL.revokeObjectURL(url);};
  },[openPreview]);
  function pick(file:File|null) {
    if(file&&!images.includes(file.type)){
      setError("Cole ou selecione uma imagem PNG, JPG ou WEBP.");return;
    }
    setError("");setMessage("");setSelected(file);
  }
  async function upload(){
    if(!selected||busy||!privateOwner)return;
    setBusy(true);setError("");setMessage("");
    try{
      await uploadEvidenceFile(supabase,{
        file:selected,userId,taskId:task.id,scenarioId:scenario.id,
        scenarioIds:[scenario.id],description
      });
      await queryClient.invalidateQueries({queryKey:["evidence-files",userId,task.id]});
      setMessage("Captura vinculada ao cenário "+scenario.titulo+".");
      setSelected(null);setDescription("");
      if(input.current)input.current.value="";
    }catch(reason){setError(reason instanceof Error?reason.message:"Falha no envio.");}
    finally{setBusy(false);}
  }
  async function preview(file:EvidenceFile){
    setError("");
    try {
      const blob=await readPrivateEvidence(supabase,file,userId,task.id);
      setOpenPreview({file,url:URL.createObjectURL(blob)});
    }catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível abrir a imagem.");}
  }
  async function saveEdited(file:EvidenceFile){
    setBusy(true);setError("");setMessage("");
    try{
      await updateEvidenceDescription(supabase,file,userId,task.id,editedDescription);
      setEditingFile(null);
      await queryClient.invalidateQueries({queryKey:["evidence-files",userId,task.id]});
      setMessage("Observação da imagem atualizada.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Falha ao editar a imagem.");}
    finally{setBusy(false);}
  }
  async function deleteImage(file:EvidenceFile){
    if(!window.confirm("Excluir a imagem '"+file.nome_original+"' definitivamente?"+
      (task.publica?" Ela deixará de aparecer na página pública imediatamente.":"")+
      " Esta ação não pode ser desfeita."))return;
    setBusy(true);setError("");setMessage("");
    try{
      await removeEvidenceFile(supabase,file,userId,task.id);
      if(openPreview?.file.id===file.id)setOpenPreview(null);
      setEditingFile(null);
      await queryClient.invalidateQueries({queryKey:["evidence-files",userId,task.id]});
      setMessage("Imagem excluída.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível excluir a imagem.");}
    finally{setBusy(false);}
  }
  if(!privateOwner)return null;
  return <section className="qa-scenario-evidence" aria-label={"Imagens do cenário "+scenario.titulo}>
    <h5><ImageIcon size={16} aria-hidden="true"/> Imagens deste teste
      <span>{current.length}</span></h5>
    {current.length>0&&<div className="qa-scenario-image-list">
      {current.map(file=><article key={file.id} className="qa-scenario-image-entry">
        <div><strong>{file.nome_original}</strong>
          {file.descricao&&<p>{file.descricao}</p>}
          <small>{task.publica?"Pública — acompanha a TF":"Privada — acompanha a TF"}</small>
        </div>
        <div className="qa-scenario-image-actions">
          <button type="button" disabled={busy} onClick={()=>void preview(file)}>
            <Eye size={15}/> Visualizar</button>
          <button type="button" disabled={busy} onClick={()=>{
            setEditingFile(file.id);setEditedDescription(file.descricao);
          }}>Editar observação</button>
          <button type="button" className="qa-scenario-crud-danger" disabled={busy}
            onClick={()=>void deleteImage(file)}>Excluir imagem</button>
        </div>
        {editingFile===file.id&&<QAModal open title="Editar observação da imagem" size="md" busy={busy} onClose={()=>setEditingFile(null)}><form className="qa-crud-inline-form"
          onSubmit={event=>{event.preventDefault();void saveEdited(file);}}>
          <label className="field">Observação da imagem
            <input maxLength={1000} value={editedDescription}
              onChange={e=>setEditedDescription(e.target.value)}/>
          </label>
          <div className="qa-crud-form-actions">
            <Button size="sm" type="submit" isDisabled={busy}>Salvar observação</Button>
            <Button size="sm" variant="secondary" type="button"
              onPress={()=>setEditingFile(null)}>Cancelar</Button>
          </div>
        </form></QAModal>}
      </article>)}
    </div>}
    <div tabIndex={0} role="group"
      className="qa-scenario-paste"
      aria-label={"Colar captura de tela no teste "+scenario.titulo}
      onPaste={event=>{
        const image=imageFromClipboard(event);
        if(image){event.preventDefault();pick(image);}
      }}>
      <ClipboardPaste size={19} aria-hidden="true"/>
      <span><strong>Cole uma captura aqui com Ctrl+V</strong>
        <small>Ou escolha uma imagem; máximo 10 MB.</small></span>
      <label className="qa-scenario-file-button">
        <ImagePlus size={16} aria-hidden="true"/> Escolher imagem
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp"
          disabled={busy} onChange={e=>pick(e.target.files?.[0]??null)}/>
      </label>
    </div>
    {selected&&<div className="qa-scenario-pending">
      {fileUrl&&<img src={fileUrl} alt="Prévia da captura ainda não salva"/>}
      <div>
        <strong>{selected.name}</strong>
        <label>Observação da captura
          <input maxLength={1000} value={description}
            onChange={e=>setDescription(e.target.value)}
            placeholder="Ex.: situação encontrada após executar o cenário"/>
        </label>
        <p className="text-muted text-sm">A visibilidade da captura acompanha a configuração geral da TF.</p>
        <div className="qa-scenario-save-actions">
          <Button size="sm" onPress={()=>void upload()} isDisabled={busy}>
            {busy?"Enviando…":"Vincular ao teste"}
          </Button>
          <Button size="sm" variant="secondary" onPress={()=>pick(null)} isDisabled={busy}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>}
    {openPreview&&<QAModal open title={"Visualizar arquivo — "+openPreview.file.nome_original}
      size="lg" onClose={()=>setOpenPreview(null)}>
      <img className="qa-resource-preview-image" src={openPreview.url}
        alt={openPreview.file.descricao||openPreview.file.nome_original}/>
    </QAModal>}
    {error&&<p role="alert" className="notice error">{error}</p>}
    {message&&<p role="status" className="qa-scenario-evidence-message">{message}</p>}
    {files.isError&&<p role="alert" className="notice error">{files.error.message}</p>}
  </section>;
}

/** Lazy companion: never query all evidence when the test list is simply opened. */
export function ScenarioEvidenceToggle({task,userId,scenario}:{
  task:Task;userId:string;scenario:Scenario
}){
  const [expanded,setExpanded]=useState(false);
  return <>
    <button type="button" className="secondary-link qa-scenario-evidence-toggle"
      onClick={()=>setExpanded(true)}>Colar captura ou visualizar imagens deste teste</button>
    <QAModal open={expanded} title={"Imagens do cenário — "+scenario.titulo}
      size="lg" onClose={()=>setExpanded(false)}>
      {expanded&&<ScenarioEvidencePanel task={task} userId={userId} scenario={scenario}/>}
    </QAModal>
  </>;
}
