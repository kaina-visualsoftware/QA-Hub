import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, WandSparkles } from "lucide-react";
import type { Scenario, Task } from "../../lib/contracts";
import { DiagramAiPanel } from "./DiagramAiPanel";
import { ensureMermaidSyntax, mermaidErrorMessage } from "./mermaid-validation";
import {
  diagramDraftSchema, listDiagrams, saveDiagram
} from "../../lib/data";

export default function DiagramPanel({ task, scenarios, userId, focusAi = false, editDiagramId }: {
  task:Task; scenarios:Scenario[]; userId:string; focusAi?:boolean; editDiagramId?:string|null
}) {
  const taskId=task.id;
  const own=task.user_id===userId;
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | undefined>();
  const initializedEditId=useRef<string|null>(null);
  const [showEditor,setShowEditor]=useState(false);
  const [showComposer,setShowComposer]=useState(!editDiagramId);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("flowchart LR\n  A[Início] --> B[Processo] --> C[Fim]");
  const [svg, setSvg] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [repairRequest,setRepairRequest]=useState<{code:string;error:string}|null>(null);
  const [busyPreview, setBusyPreview] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!focusAi) return;
    const frame=requestAnimationFrame(() => {
      const heading=document.getElementById("diagram-ai-heading");
      heading?.scrollIntoView({behavior:"auto",block:"start"});
      heading?.focus({preventScroll:true});
    });
    return () => cancelAnimationFrame(frame);
  },[focusAi]);

  const diagrams = useQuery({
    queryKey: ["diagrams", userId, taskId], queryFn: () => listDiagrams(taskId)
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["diagrams", userId, taskId] });
  const save = useMutation({
    mutationFn: () => saveDiagram(taskId, userId, { titulo: title, conteudo: code }, editingId),
    onSuccess: async () => {
      setEditingId(undefined);setShowEditor(false);
      setMessage("Diagrama salvo."); await invalidate();
    }
  });
  // Editing opens independently from the read-only library. The task and the
  // selected record are scoped by the existing RLS-aware list query.
  useEffect(()=>{
    if(!editDiagramId||!diagrams.data||initializedEditId.current===editDiagramId)return;
    const record=diagrams.data.find(item=>item.id===editDiagramId);
    if(!record)return;
    initializedEditId.current=editDiagramId;
    setEditingId(record.id);setTitle(record.titulo);setCode(record.conteudo);
    setSvg(null);setShowEditor(true);setShowComposer(false);
    setPreviewError("");setRepairRequest(null);
    void preview(record.conteudo);
  // Deliberately initialize once per editor mount, not for every edit keystroke.
  },[editDiagramId,diagrams.data]);

  // Generated Mermaid is only a local draft until the human explicitly saves it.
  function applyAiDraft(generated:string){
    if ((editingId || title.trim() || code !== "flowchart LR\n  A[Início] --> B[Processo] --> C[Fim]") &&
      !window.confirm("Substituir o texto atual do editor por este fluxograma sugerido pela IA?")) return false;
    setEditingId(undefined);
    setTitle("Fluxo — " + task.titulo.slice(0,130));
    setCode(generated);setSvg(null);setMessage("");setPreviewError("");setRepairRequest(null);
    setShowEditor(false);setShowComposer(false);
    void preview(generated);
    requestAnimationFrame(()=>{
      document.getElementById("diagram-save-action")?.focus({preventScroll:true});
    });
    return true;
  }

  function showMermaidError(value:string,reason:unknown){
    const diagnosis=mermaidErrorMessage(reason);
    setPreviewError("Mermaid inválido: "+diagnosis);
    setShowEditor(true);setShowComposer(true);
    setRepairRequest(value.trim()?{code:value,error:diagnosis}:null);
  }
  async function preview(value:string){
    setPreviewError("");setSvg(null);
    setBusyPreview(true);
    try {
      await ensureMermaidSyntax(value);
      const {default:mermaid}=await import("mermaid");
      const {svg:rendered}=await mermaid.render(
        "qa-diagram-"+crypto.randomUUID().replaceAll("-",""),value
      );
      // Do not inject the untrusted SVG into the application DOM.
      setSvg(rendered);setRepairRequest(null);
    } catch(reason){
      showMermaidError(value,reason);
    } finally{setBusyPreview(false);}
  }
  async function validateAndSave(){
    if(!own || save.isPending || busyPreview)return;
    const draft=diagramDraftSchema.safeParse({titulo:title,conteudo:code});
    if(!draft.success){
      setPreviewError(draft.error.issues[0]?.message||"Revise os campos.");
      return;
    }
    setBusyPreview(true);
    try{
      // Do not store syntactically invalid Mermaid. The backend persists
      // documents, but only the browser can run the Mermaid parser.
      await ensureMermaidSyntax(code);
      setPreviewError("");setRepairRequest(null);
      save.mutate();
    } catch(reason){
      showMermaidError(code,reason);
    } finally{setBusyPreview(false);}
  }

  return <section className="qa-diagram-workspace" aria-labelledby="diagram-heading">
    <h2 id="diagram-heading" className="sr-only">Diagramas Mermaid</h2>
    <div className="qa-diagram-composer" hidden={!showComposer}>
      <DiagramAiPanel task={task} scenarios={scenarios} userId={userId}
        repairRequest={repairRequest} onRepairHandled={()=>setRepairRequest(null)}
        onDraft={applyAiDraft}/>
    </div>
    {!showComposer&&own&&<button type="button" className="qa-diagram-regenerate"
      onClick={()=>{setShowComposer(true);requestAnimationFrame(()=>
        document.getElementById("diagram-ai-heading")?.focus({preventScroll:true}));}}>
      <WandSparkles size={16} aria-hidden="true"/> Alterar ou gerar novamente
    </button>}
    {(title.trim()||svg||showEditor) ?
    <form className="qa-diagram-result" id="diagram-editor"
      onSubmit={event=>{event.preventDefault();void validateAndSave();}}>
      {svg&&<div className="qa-diagram-rendered">
        <div className="qa-diagram-result-label">Prévia do diagrama</div>
        <iframe title="Visualização do diagrama Mermaid"
          className="diagram-preview" sandbox="" referrerPolicy="no-referrer" srcDoc={svg}/>
      </div>}
      <details className="qa-diagram-code-options" open={showEditor}
        onToggle={event=>setShowEditor(event.currentTarget.open)}>
        <summary>Editar título ou código Mermaid</summary>
        <div className="stack qa-diagram-code-fields">
          <label className="field">Título do diagrama
            <input maxLength={160} value={title}
              onChange={event=>setTitle(event.target.value)}
              placeholder="Fluxo de validação"/>
          </label>
          <label className="field">Código Mermaid
            <textarea id="diagram-code-editor" rows={9} maxLength={16000}
              value={code} onChange={event=>{
                setCode(event.target.value);setSvg(null);
                setPreviewError("");setRepairRequest(null);
              }}/>
          </label>
        </div>
      </details>
      {previewError&&<div className="qa-diagram-error-details"
        role="group" aria-label="Erro de sintaxe Mermaid">
        <p role="alert" className="notice error">{previewError}</p>
        {repairRequest&&own&&<button className="secondary-link" type="button"
          onClick={()=>{
            setShowComposer(true);
            requestAnimationFrame(()=>{
              document.getElementById("diagram-ai-heading")?.focus({preventScroll:true});
              document.getElementById("diagram-ai-heading")?.scrollIntoView({block:"start"});
            });
          }}>Ir para Corrigir com IA</button>}
      </div>}
      <div className="qa-diagram-savebar">
        <Button type="submit" id="diagram-save-action"
          isDisabled={save.isPending||busyPreview||!own||!title.trim()}>
          {save.isPending?"Salvando…":"Salvar diagrama"}
        </Button>
        <Button type="button" variant="secondary" isDisabled={busyPreview}
          onPress={()=>void preview(code)}>
          <Eye size={16} aria-hidden="true"/>
          {busyPreview?"Gerando prévia…":"Atualizar prévia"}
        </Button>
        {editingId&&<Button type="button" variant="secondary"
          onPress={()=>{
            setEditingId(undefined);setTitle("");setSvg(null);setMessage("");
            setCode("flowchart LR\n  A[Início] --> B[Processo] --> C[Fim]");
            setShowEditor(false);
          }}>Novo diagrama</Button>}
      </div>
      {save.isError&&<p role="alert" className="notice error">{save.error.message}</p>}
      {message&&<p role="status" className="qa-diagram-success">{message}</p>}
    </form> :
    <button type="button" className="qa-diagram-manual-toggle"
      onClick={()=>setShowEditor(true)}>Criar manualmente com Mermaid</button>}
    {editDiagramId&&diagrams.isPending&&<p role="status">Carregando diagrama para edição…</p>}
    {editDiagramId&&diagrams.isError&&<p role="alert" className="notice error">{diagrams.error.message}</p>}
    {editDiagramId&&diagrams.isSuccess&&
      !diagrams.data.some(item=>item.id===editDiagramId)&&
      <p role="alert" className="notice error">Diagrama não encontrado ou sem acesso.</p>}
  </section>;
}
