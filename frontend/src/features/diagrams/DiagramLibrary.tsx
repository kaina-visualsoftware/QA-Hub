import {useEffect,useMemo,useState} from "react";
import {notify,ToastNotice} from "../../components/ui/Toasts";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {Eye,GitBranchPlus,Pencil,Trash2,Workflow} from "lucide-react";
import {listDiagrams,removeDiagram} from "../../lib/data";
import {ensureMermaidSyntax,isMissingModuleChunk,mermaidErrorMessage} from "./mermaid-validation";
import {DiagramViewer} from "./DiagramViewer";
import {QAModal} from "../../components/ui/QAModal";

export function DiagramLibrary({taskId,userId,owner,onCreate,onEdit,showCreate=true}:{
  taskId:string;userId:string;owner:boolean;showCreate?:boolean;
  onCreate:()=>void;onEdit:(id:string)=>void;
}){
  const queryClient=useQueryClient();
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [svg,setSvg]=useState<string|null>(null);
  const [previewError,setPreviewError]=useState<"stale"|"invalid"|null>(null);
  const [retry,setRetry]=useState(0);
  const [rendering,setRendering]=useState(false);
  const diagrams=useQuery({
    queryKey:["diagrams",userId,taskId],
    queryFn:()=>listDiagrams(taskId)
  });
  const selected=useMemo(()=>diagrams.data?.find(item=>item.id===selectedId),
    [diagrams.data,selectedId]);
  useEffect(()=>{
    let cancelled=false;
    setSvg(null);setPreviewError(null);
    if(!selected){setRendering(false);return;}
    setRendering(true);
    async function renderDiagram(){
      try{
        await ensureMermaidSyntax(selected!.conteudo);
        const {default:mermaid}=await import("mermaid");
        const result=await mermaid.render("qa-view-"+crypto.randomUUID().replaceAll("-",""),
          selected!.conteudo);
        if(!cancelled)setSvg(result.svg);
      }catch(reason){
        if(!cancelled){
          const stale=isMissingModuleChunk(reason);
          setPreviewError(stale?"stale":"invalid");
          notify.error(stale
            ? "O QA Hub foi atualizado. Recarregue a página para visualizar este diagrama."
            : "Não foi possível visualizar este diagrama: "+mermaidErrorMessage(reason));
        }
      }finally{if(!cancelled)setRendering(false);}
    }
    void renderDiagram();
    return ()=>{cancelled=true;};
  },[selected?.id,selected?.conteudo,retry]);
  const remove=useMutation({
    mutationFn:(id:string)=>removeDiagram(taskId,id),
    onSuccess:async()=>{
      setSelectedId(null);notify.success("Diagrama excluído.");
      await queryClient.invalidateQueries({queryKey:["diagrams",userId,taskId]});
    }
  });
  return <section className="qa-artifact-browser" aria-labelledby="qa-diagrams-library-heading">
    <header className="qa-artifact-browser-head">
      <div>
        <h3 id="qa-diagrams-library-heading">
          <Workflow size={19} aria-hidden="true"/> Diagramas
          <span className="qa-artifact-counter">{diagrams.data?.length??0}</span>
        </h3>
        <p>Consulte e gerencie os diagramas salvos nesta TF.</p>
      </div>
      {owner&&showCreate&&<Button size="sm" onPress={onCreate}>
        <GitBranchPlus size={16} aria-hidden="true"/> Novo diagrama
      </Button>}
    </header>
    {diagrams.isPending&&<p className="text-muted text-sm" role="status">Carregando diagramas…</p>}
    {diagrams.isError&&<div role="alert" className="notice error">
      {diagrams.error.message}
      <Button variant="secondary" size="sm" onPress={()=>void diagrams.refetch()}>
        Tentar novamente
      </Button>
    </div>}
    {diagrams.isSuccess&&diagrams.data.length===0&&
      <p className="qa-artifact-empty">Nenhum diagrama salvo nesta TF.
        {owner?" Use a ação Criar diagrama acima.":""}
      </p>}
    {!!diagrams.data?.length&&<div className="qa-diagram-library-layout qa-diagram-catalog">
      <div className="qa-diagram-library-list qa-resource-list" aria-label="Diagramas existentes">
        {diagrams.data.map(item=><article key={item.id}
          className="qa-diagram-library-row qa-resource-row">
          <div className="qa-diagram-library-title qa-resource-copy">
            <strong>{item.titulo}</strong>
          </div>
          <div className="qa-diagram-library-actions qa-resource-actions">
            <button type="button"
              aria-label={"Visualizar diagrama "+item.titulo}
              onClick={()=>setSelectedId(item.id)}>
              <Eye size={15} aria-hidden="true"/>
              Visualizar
            </button>
            {owner&&<button type="button" onClick={()=>onEdit(item.id)}>
              <Pencil size={15} aria-hidden="true"/> Editar
            </button>}
            {owner&&<button type="button" disabled={remove.isPending}
              onClick={()=>{
                if(window.confirm("Excluir o diagrama '"+item.titulo+"'?"))
                  remove.mutate(item.id);
              }}>
              <Trash2 size={15} aria-hidden="true"/> Excluir
            </button>}
          </div>
        </article>)}
      </div>
    </div>}
    {selected&&<QAModal open title={"Visualizar diagrama — "+selected.titulo}
      eyebrow="DIAGRAMA SALVO" size="full"
      description="Visualização centralizada em 100%. Utilize os controles para aproximar ou afastar."
      initialFocus=".qa-diagram-viewer .qa-diagram-stage"
      onClose={()=>setSelectedId(null)}>
      {rendering&&<p role="status" className="qa-diagram-loading">Preparando diagrama…</p>}
      {previewError&&<div className="qa-diagram-unavailable">
        <strong>Prévia indisponível</strong>
        <Button variant="secondary" size="sm" onPress={()=>{
          if(previewError==="stale")window.location.reload();
          else setRetry(current=>current+1);
        }}>{previewError==="stale"?"Atualizar QA Hub":"Tentar novamente"}</Button>
      </div>}
      {svg&&<DiagramViewer key={selected.id} svg={svg} title={selected.titulo}/>}
    </QAModal>}
    <ToastNotice message={remove.isError?remove.error.message:null} tone="error"/>
  </section>;
}
