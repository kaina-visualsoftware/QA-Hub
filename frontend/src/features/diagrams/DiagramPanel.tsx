import { useEffect, useRef, useState } from "react";
import {ToastNotice} from "../../components/ui/Toasts";
import { Button } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, WandSparkles, LoaderCircle, FileCheck2, Code2 } from "lucide-react";
import type { Scenario, Task } from "../../lib/contracts";
import { DiagramAiPanel } from "./DiagramAiPanel";
import { AiStepFlow } from "../../components/ui/AiStepFlow";
import { ensureMermaidSyntax, isMissingModuleChunk, mermaidErrorMessage } from "./mermaid-validation";
import {
  diagramDraftSchema, listDiagrams, saveDiagram
} from "../../lib/data";

export default function DiagramPanel({ task, scenarios, userId, focusAi = false, editDiagramId, onBusyChange }: {
  task:Task; scenarios:Scenario[]; userId:string; focusAi?:boolean; editDiagramId?:string|null;
  onBusyChange?:(busy:boolean)=>void
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
  const [aiBusy, setAiBusy] = useState(false);
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
  // The outer modal must remain open until both the NVIDIA call and the
  // preview/save operations finish; prevent losing confirmation feedback.
  useEffect(()=>{
    onBusyChange?.(aiBusy||busyPreview||save.isPending);
  },[aiBusy,busyPreview,save.isPending,onBusyChange]);
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
    save.reset();
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
    if(isMissingModuleChunk(reason)){
      setPreviewError("A versão do QA Hub mudou. Recarregue a página para carregar o Mermaid.");
      setShowEditor(true);setRepairRequest(null);
      return;
    }
    const diagnosis=mermaidErrorMessage(reason);
    setPreviewError("Mermaid inválido: "+diagnosis);
    setShowEditor(true);setShowComposer(false);
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
    if(!own || save.isPending || save.isSuccess || busyPreview)return;
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
    <AiStepFlow step={showComposer?"prepare":save.isSuccess?"complete":"review"}
      label="Etapas da criação de diagrama com IA"
      labels={["Configurar e gerar","Revisar o diagrama","Salvar na TF"]}/>
    <div className="qa-diagram-composer" hidden={!showComposer}>
      <DiagramAiPanel task={task} scenarios={scenarios} userId={userId}
        repairRequest={repairRequest} onRepairHandled={()=>setRepairRequest(null)}
        onBusyChange={setAiBusy} onDraft={applyAiDraft}/>
    </div>
    {!showComposer&&own&&!save.isPending&&<button type="button" className="qa-diagram-regenerate"
      onClick={()=>{save.reset();setShowComposer(true);requestAnimationFrame(() =>
        document.getElementById("diagram-ai-heading")?.focus({preventScroll:true}));}}>
      <WandSparkles size={16} aria-hidden="true"/> Alterar ou gerar novamente
    </button>}
    {!showComposer && (title.trim()||svg||showEditor) ?
    <form className="qa-diagram-result" id="diagram-editor"
      aria-label="Revisar e salvar diagrama"
      onSubmit={event=>{event.preventDefault();void validateAndSave();}}>
      <div className="qa-diagram-editor-heading">
        <div><span className="qa-generator-eyebrow">REVISÃO FINAL</span>
          <h3>{editingId?"Editar diagrama salvo":"Prévia do diagrama"}</h3>
          <p>Confira a representação antes de gravar o resultado na tarefa.</p>
        </div>
      </div>
      {busyPreview&&<div role="status" className="qa-diagram-processing">
        <LoaderCircle size={18} className="qa-ai-spinner" aria-hidden="true"/>
        <div><strong>Validando diagrama</strong>
          <p>Verificando o código Mermaid e preparando a visualização.</p></div>
      </div>}
      {svg&&<div className="qa-diagram-rendered">
        <div className="qa-diagram-result-label">Visualização</div>
        <iframe title="Visualização do diagrama Mermaid"
          className="diagram-preview" sandbox="" referrerPolicy="no-referrer" srcDoc={svg}/>
      </div>}
      <details className="qa-diagram-code-options" open={showEditor}
        onToggle={event=>setShowEditor(event.currentTarget.open)}>
        <summary><Code2 size={16} aria-hidden="true"/> Editar título ou código Mermaid</summary>
        <div className="stack qa-diagram-code-fields">
          <label className="field">Título do diagrama
            <input maxLength={160} value={title}
              onChange={event=>{setTitle(event.target.value);save.reset();setMessage("");}}
              placeholder="Fluxo de validação"/>
          </label>
          <label className="field">Código Mermaid
            <textarea id="diagram-code-editor" rows={9} maxLength={16000}
              value={code} onChange={event=>{
                setCode(event.target.value);setSvg(null);save.reset();setMessage("");
                setPreviewError("");setRepairRequest(null);
              }}/>
          </label>
        </div>
      </details>
      <ToastNotice message={previewError} tone="error"/>
      {repairRequest&&own&&<div className="qa-diagram-error-details"
        role="group" aria-label="Opção para corrigir diagrama">
        <button className="secondary-link" type="button"
          onClick={()=>{
            setShowComposer(true);
            requestAnimationFrame(()=>{
              document.getElementById("diagram-ai-heading")?.focus({preventScroll:true});
              document.getElementById("diagram-ai-heading")?.scrollIntoView({block:"start"});
            });
          }}>Ir para Corrigir com IA</button>
      </div>}
      <div className="qa-diagram-savebar">
        <Button type="submit" id="diagram-save-action"
          isDisabled={save.isPending||save.isSuccess||busyPreview||!own||!title.trim()}>
          {save.isPending?<LoaderCircle size={16} className="qa-ai-spinner" aria-hidden="true"/>:
            <FileCheck2 size={16} aria-hidden="true"/>}
          {save.isPending?"Salvando diagrama…":save.isSuccess?"Diagrama salvo":"Salvar diagrama"}
        </Button>
        <Button type="button" variant="secondary" isDisabled={busyPreview}
          onPress={()=>void preview(code)}>
          <Eye size={16} aria-hidden="true"/>
          {busyPreview?"Gerando prévia…":"Atualizar prévia"}
        </Button>
        {editingId&&<Button type="button" variant="secondary"
          onPress={()=>{
            setEditingId(undefined);setTitle("");setSvg(null);setMessage("");save.reset();
            setCode("flowchart LR\n  A[Início] --> B[Processo] --> C[Fim]");
            setShowEditor(false);
          }}>Novo diagrama</Button>}
      </div>
      <ToastNotice message={save.isError?save.error.message:null} tone="error"/>
      <ToastNotice message={message} tone="success"/>
    </form> :
    <button type="button" className="qa-diagram-manual-toggle"
      onClick={()=>{setShowComposer(false);setShowEditor(true);}}>Criar manualmente com Mermaid</button>}
    {editDiagramId&&diagrams.isPending&&<p role="status">Carregando diagrama para edição…</p>}
    {editDiagramId&&diagrams.isError&&<p role="alert" className="notice error">{diagrams.error.message}</p>}
    {editDiagramId&&diagrams.isSuccess&&
      !diagrams.data.some(item=>item.id===editDiagramId)&&
      <p role="alert" className="notice error">Diagrama não encontrado ou sem acesso.</p>}
  </section>;
}
