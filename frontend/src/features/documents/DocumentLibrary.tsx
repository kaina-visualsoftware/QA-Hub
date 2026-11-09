import {useMemo,useState} from "react";
import {notify} from "../../components/ui/Toasts";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {ClipboardCopy,Download,Eye,FileText} from "lucide-react";
import {supabase} from "../../lib/supabase";
import {cleanDocumentName} from "../../lib/legacy/qa-phase2.mjs";
import type {TfDocument} from "../../lib/legacy/qa-phase2.mjs";

export function DocumentLibrary({taskId,userId,owner,onCreate,showCreate=true}:{
  taskId:string;userId:string;owner:boolean;onCreate:()=>void;showCreate?:boolean;
}){
  const [selectedId,setSelectedId]=useState<string|null>(null);
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
  function download(text:string,name:string){
    const blob=new Blob([text],{type:"text/markdown;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;anchor.download=cleanDocumentName(name);
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
        <p>Documentos já salvos, separados do editor e do gerador.</p>
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
    {!!query.data?.length&&<div className="qa-diagram-library-layout">
      <div className="qa-diagram-library-list" aria-label="Documentos existentes">
        {query.data.map(item=><article key={item.id}
          className={"qa-diagram-library-row"+(item.id===selectedId?" selected":"")}>
          <div className="qa-diagram-library-title">
            <strong>{item.titulo}</strong>
            <small>{item.tipo==="post"?"Post":"Relatório"} · versão {item.versao} ·
              {" "+new Date(item.created_at).toLocaleDateString("pt-BR")}</small>
          </div>
          <div className="qa-diagram-library-actions">
            <button type="button" aria-pressed={selectedId===item.id}
              onClick={()=>setSelectedId(id=>id===item.id?null:item.id)}>
              <Eye size={15} aria-hidden="true"/>
              {selectedId===item.id?"Ocultar":"Visualizar"}
            </button>
          </div>
        </article>)}
      </div>
      {selected&&<div className="qa-document-library-preview"
        aria-label={"Visualização: "+selected.titulo}>
        <h4>{selected.titulo}</h4>
        <pre>{selected.conteudo}</pre>
        <div className="qa-document-library-actions">
          <Button size="sm" variant="secondary" onPress={()=>{
            void navigator.clipboard.writeText(selected.conteudo)
              .then(()=>notify.success("Documento copiado."))
              .catch(()=>notify.error("Não foi possível copiar; selecione o texto."));
          }}><ClipboardCopy size={15} aria-hidden="true"/> Copiar</Button>
          <Button size="sm" variant="secondary" onPress={()=>
            download(selected.conteudo,selected.titulo)}>
            <Download size={15} aria-hidden="true"/> Markdown
          </Button>
        </div>
      </div>}
    </div>}
  </section>;
}
