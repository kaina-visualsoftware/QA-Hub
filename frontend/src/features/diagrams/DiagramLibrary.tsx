import {useEffect,useMemo,useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {Eye,GitBranchPlus,Pencil,Trash2,Workflow} from "lucide-react";
import {listDiagrams,removeDiagram} from "../../lib/data";
import {ensureMermaidSyntax,mermaidErrorMessage} from "./mermaid-validation";
import {DiagramViewer} from "./DiagramViewer";

export function DiagramLibrary({taskId,userId,owner,onCreate,onEdit}:{
  taskId:string;userId:string;owner:boolean;
  onCreate:()=>void;onEdit:(id:string)=>void;
}){
  const queryClient=useQueryClient();
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [svg,setSvg]=useState<string|null>(null);
  const [previewError,setPreviewError]=useState("");
  const [rendering,setRendering]=useState(false);
  const [notice,setNotice]=useState("");
  const diagrams=useQuery({
    queryKey:["diagrams",userId,taskId],
    queryFn:()=>listDiagrams(taskId)
  });
  const selected=useMemo(()=>diagrams.data?.find(item=>item.id===selectedId)??diagrams.data?.[0],
    [diagrams.data,selectedId]);
  useEffect(()=>{
    let cancelled=false;
    setSvg(null);setPreviewError("");
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
        if(!cancelled)setPreviewError("Não foi possível visualizar este diagrama: "+
          mermaidErrorMessage(reason));
      }finally{if(!cancelled)setRendering(false);}
    }
    void renderDiagram();
    return ()=>{cancelled=true;};
  },[selected?.id,selected?.conteudo]);
  const remove=useMutation({
    mutationFn:(id:string)=>removeDiagram(taskId,id),
    onSuccess:async()=>{
      setSelectedId(null);setNotice("Diagrama excluído.");
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
        <p>Consulte os fluxos salvos aqui. A criação e a edição abrem um modal separado.</p>
      </div>
      {owner&&<Button size="sm" onPress={onCreate}>
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
        {owner?" Crie o primeiro usando o botão acima.":""}
      </p>}
    {!!diagrams.data?.length&&<div className="qa-diagram-library-layout">
      <div className="qa-diagram-library-list" aria-label="Diagramas existentes">
        {diagrams.data.map(item=><article key={item.id}
          className={"qa-diagram-library-row"+(selected?.id===item.id?" selected":"")}>
          <div className="qa-diagram-library-title">
            <strong>{item.titulo}</strong>
          </div>
          <div className="qa-diagram-library-actions">
            <button type="button" aria-pressed={selected?.id===item.id}
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
      {selected&&<div className="qa-diagram-library-preview"
        aria-label={"Visualização: "+selected.titulo}>
        <strong>{selected.titulo}</strong>
        {rendering&&<p role="status" className="text-muted text-sm">Preparando visualização…</p>}
        {previewError&&<p role="alert" className="notice error">{previewError}</p>}
        {svg&&<DiagramViewer key={selected.id} svg={svg} title={selected.titulo}/>}
      </div>}
    </div>}
    {remove.isError&&<p role="alert" className="notice error">{remove.error.message}</p>}
    {notice&&<p role="status" className="notice">{notice}</p>}
  </section>;
}
