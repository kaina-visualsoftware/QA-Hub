import {useMemo,useState} from "react";
import {QAModal} from "../../components/ui/QAModal";
import {notify} from "../../components/ui/Toasts";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {ClipboardCopy,Download,Eye,FileText,Pencil,Trash2} from "lucide-react";
import {supabase} from "../../lib/supabase";
import {cleanDocumentName,saveTfDocument} from "../../lib/legacy/qa-phase2.mjs";
import type {TfDocument} from "../../lib/legacy/qa-phase2.mjs";

export function DocumentLibrary({taskId,userId,owner,onCreate,showCreate=true}:{
  taskId:string;userId:string;owner:boolean;onCreate:()=>void;showCreate?:boolean;
}){
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [editingDocument,setEditingDocument]=useState<TfDocument|null>(null);
  const [draftTitle,setDraftTitle]=useState("");
  const [draftContent,setDraftContent]=useState("");
  const [busy,setBusy]=useState(false);
  const client=useQueryClient();
  const query=useQuery({
    queryKey:["documents",userId,taskId],
    queryFn:async()=>{
      const {data,error}=await supabase.from("qa_documentos")
        .select("id,tarefa_id,tipo,titulo,conteudo,versao,created_at")
        .eq("tarefa_id",taskId).order("created_at",{ascending:false}).limit(100);
      if(error)throw error;
      return (data??[]) as TfDocument[];
    }
  });
  const selected=useMemo(()=>query.data?.find(item=>item.id===selectedId),
    [query.data,selectedId]);
  function startEdit(item:TfDocument){
    setEditingDocument(item);setDraftTitle(item.titulo);
    setDraftContent(item.conteudo);setSelectedId(item.id);
  }
  async function saveNewVersion(){
    if(!editingDocument||!owner||busy)return;
    setBusy(true);
    try{
      const saved=await saveTfDocument(supabase,{
        taskId,type:editingDocument.tipo,title:draftTitle,content:draftContent,source:"manual"
      });
      setEditingDocument(null);
      await client.invalidateQueries({queryKey:["documents",userId,taskId]});
      notify.success("Nova versão "+saved.versao+" salva. A versão original foi preservada.");
    }catch(reason){notify.error(reason instanceof Error?reason.message:"Falha ao salvar versão.");}
    finally{setBusy(false);}
  }
  async function deleteVersion(item:TfDocument){
    if(!owner||busy||!window.confirm(
      "Excluir permanentemente a versão "+item.versao+" de '"+item.titulo+
      "'? As outras versões serão preservadas. Esta ação não pode ser desfeita."
    ))return;
    setBusy(true);
    try{
      const {data,error}=await supabase.from("qa_documentos").delete()
        .eq("id",item.id).eq("tarefa_id",taskId).eq("user_id",userId)
        .select("id").maybeSingle();
      if(error)throw error;
      if(data?.id!==item.id)throw Error("Documento não encontrado ou sem permissão.");
      if(selectedId===item.id)setSelectedId(null);
      if(editingDocument?.id===item.id)setEditingDocument(null);
      await client.invalidateQueries({queryKey:["documents",userId,taskId]});
      notify.success("Versão excluída.");
    }catch(reason){notify.error(reason instanceof Error?reason.message:"Falha ao excluir versão.");}
    finally{setBusy(false);}
  }
  function download(text:string,name:string){
    const blob=new Blob([text],{type:"text/markdown;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;anchor.download=cleanDocumentName(name,
      /^\[size=\d+\]/.test(text.trim())?"txt":"md");
    anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="qa-artifact-browser" aria-labelledby="qa-documents-library-heading">
    <header className="qa-artifact-browser-head">
      <div>
        <h3 id="qa-documents-library-heading">
          <FileText size={18} aria-hidden="true"/> Posts e relatórios
          <span className="qa-artifact-counter">{query.data?.length??0}</span>
        </h3>
        <p>Consulte posts e relatórios salvos nesta TF.</p>
      </div>
      {owner&&showCreate&&<Button variant="secondary" size="sm" onPress={onCreate}>
        <FileText size={16} aria-hidden="true"/> Criar relatório
      </Button>}
    </header>
    {query.isPending&&<p role="status" className="text-muted text-sm">Carregando documentos…</p>}
    {query.isError&&<div role="alert" className="notice error">
      {query.error.message}
      <Button size="sm" variant="secondary" onPress={()=>void query.refetch()}>
        Tentar novamente
      </Button>
    </div>}
    {query.isSuccess&&query.data.length===0&&<p className="qa-artifact-empty">
      Ainda não existem posts ou relatórios salvos nesta TF.
    </p>}
    {!!query.data?.length&&<div className="qa-diagram-library-layout qa-diagram-catalog">
      <div className="qa-diagram-library-list qa-resource-list" aria-label="Documentos existentes">
        {query.data.map(item=><article key={item.id}
          className={"qa-diagram-library-row qa-resource-row"+(item.id===selectedId?" selected":"")}>
          <div className="qa-diagram-library-title qa-resource-copy">
            <strong>{item.titulo}</strong>
            <small>{item.tipo==="post"?"Post":"Relatório"} · versão {item.versao} ·
              {" "+new Date(item.created_at).toLocaleDateString("pt-BR")}</small>
          </div>
          <div className="qa-diagram-library-actions qa-resource-actions">
            <button type="button" aria-label={"Visualizar documento "+item.titulo}
              onClick={()=>setSelectedId(item.id)}>
              <Eye size={15} aria-hidden="true"/>
              Visualizar
            </button>
            {owner&&<button type="button" disabled={busy} onClick={()=>startEdit(item)}>
              <Pencil size={15} aria-hidden="true"/> Editar nova versão
            </button>}
            {owner&&<button type="button" disabled={busy}
              className="qa-scenario-crud-danger" onClick={()=>void deleteVersion(item)}>
              <Trash2 size={15} aria-hidden="true"/> Excluir versão
            </button>}
          </div>
        </article>)}
      </div>
      {selected&&<QAModal open title={(editingDocument?"Editar documento — ":"Visualizar documento — ")+selected.titulo}
        size="lg" busy={busy} onClose={()=>{setSelectedId(null);setEditingDocument(null);}}>
        <div className="qa-document-library-preview">
        {editingDocument?.id===selected.id?
          <form className="qa-crud-inline-form" onSubmit={event=>{
            event.preventDefault();void saveNewVersion();
          }}>
            <p>Uma edição cria uma nova versão. A anterior permanece disponível.</p>
            <label className="field">Título
              <input value={draftTitle} maxLength={240} required
                onChange={event=>setDraftTitle(event.target.value)}/>
            </label>
            <label className="field">Conteúdo
              <textarea rows={18} maxLength={80000} required
                value={draftContent}
                onChange={event=>setDraftContent(event.target.value)}/>
            </label>
            <div className="qa-crud-form-actions">
              <Button type="submit" isDisabled={busy||draftTitle.trim().length<3||!draftContent.trim()}>
                {busy?"Salvando…":"Salvar nova versão"}
              </Button>
              <Button type="button" variant="secondary" isDisabled={busy}
                onPress={()=>setEditingDocument(null)}>Cancelar</Button>
            </div>
          </form>
          :<pre>{selected.conteudo}</pre>}
        <div className="qa-document-library-actions">
          <Button size="sm" variant="secondary" onPress={()=>{
            void navigator.clipboard.writeText(selected.conteudo)
              .then(()=>notify.success("Documento copiado."))
              .catch(()=>notify.error("Não foi possível copiar; selecione o texto."));
          }}><ClipboardCopy size={15} aria-hidden="true"/> Copiar</Button>
          <Button size="sm" variant="secondary" onPress={()=>
            download(selected.conteudo,selected.titulo)}>
            <Download size={15} aria-hidden="true"/>
            {/^\[size=\d+\]/.test(selected.conteudo.trim())?"BBCode":"Markdown"}
          </Button>
        </div>
      </div></QAModal>}
    </div>}
  </section>;
}
