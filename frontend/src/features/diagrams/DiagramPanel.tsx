import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranchPlus, Eye, Pencil, Trash2 } from "lucide-react";
import type { Scenario, Task } from "../../lib/contracts";
import { DiagramAiPanel } from "./DiagramAiPanel";
import { ensureMermaidSyntax, mermaidErrorMessage } from "./mermaid-validation";
import {
  diagramDraftSchema, listDiagrams, removeDiagram, saveDiagram
} from "../../lib/data";
import type { Diagram } from "../../lib/data";

export default function DiagramPanel({ task, scenarios, userId, focusAi = false }: {
  task:Task; scenarios:Scenario[]; userId:string; focusAi?:boolean
}) {
  const taskId=task.id;
  const own=task.user_id===userId;
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | undefined>();
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
      setEditingId(undefined); setMessage("Diagrama salvo."); await invalidate();
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeDiagram(taskId, id),
    onSuccess: async () => { setMessage("Diagrama excluído."); await invalidate(); }
  });

  // Generated Mermaid is only a local draft until the human explicitly saves it.
  function applyAiDraft(generated:string){
    if ((editingId || title.trim() || code !== "flowchart LR\n  A[Início] --> B[Processo] --> C[Fim]") &&
      !window.confirm("Substituir o texto atual do editor por este fluxograma sugerido pela IA?")) return false;
    setEditingId(undefined);
    setTitle("Fluxo — " + task.titulo.slice(0,130));
    setCode(generated);setSvg(null);setMessage("");setPreviewError("");setRepairRequest(null);
    void preview(generated);
    requestAnimationFrame(() => {
      document.getElementById("diagram-code-editor")?.scrollIntoView({
        behavior:"auto",block:"center"
      });
      document.getElementById("diagram-code-editor")?.focus({preventScroll:true});
    });
    return true;
  }

  function edit(record: Diagram) {
    setEditingId(record.id);
    setTitle(record.titulo); setCode(record.conteudo); setSvg(null); setPreviewError("");setRepairRequest(null);
  }

  function showMermaidError(value:string,reason:unknown){
    const diagnosis=mermaidErrorMessage(reason);
    setPreviewError("Mermaid inválido: "+diagnosis);
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

  return <section className="panel mt-5 qa-workflow-anchor" aria-labelledby="diagram-heading">
    <div className="section-heading"><div><p className="eyebrow">DOCUMENTAÇÃO VISUAL</p>
      <h2 id="diagram-heading">Diagramas Mermaid</h2>
      <p className="text-muted">Edite o código e visualize sem executar scripts não confiáveis.</p></div>
      <span className="count-pill">{diagrams.data?.length ?? 0} diagrama(s)</span>
    </div>
    <div className={focusAi ? "qa-diagram-ai-focus" : ""}>
      <DiagramAiPanel task={task} scenarios={scenarios} userId={userId}
        repairRequest={repairRequest} onRepairHandled={()=>setRepairRequest(null)}
        onDraft={applyAiDraft}/>
    </div>
    <div className="diagram-layout mt-5" id="diagram-editor">
      <form className="stack" onSubmit={(event)=>{
        event.preventDefault();
        void validateAndSave();
      }}>
        <label className="field">Título<input maxLength={160} value={title}
          onChange={(e) => setTitle(e.target.value)} placeholder="Fluxo de validação" /></label>
        <label className="field">Código Mermaid<textarea id="diagram-code-editor" rows={12} maxLength={16000}
          value={code} onChange={(e) => {
            setCode(e.target.value);setSvg(null);setPreviewError("");setRepairRequest(null);
          }} /></label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" isDisabled={busyPreview} onPress={() => void preview(code)}>
            <Eye size={16} /> {busyPreview ? "Validando…" : "Prévia"}
          </Button>
          <Button type="submit" isDisabled={save.isPending || busyPreview || !own}>Salvar diagrama</Button>
          {editingId && <Button type="button" variant="secondary" onPress={() => {
            setEditingId(undefined); setTitle(""); setSvg(null); setMessage("");
          }}>Novo diagrama</Button>}
        </div>
        {previewError && <div className="qa-diagram-error-details" role="group" aria-label="Erro de sintaxe Mermaid">
          <p role="alert" className="notice error">{previewError}</p>
          {repairRequest && own && <button className="secondary-link mt-3" type="button"
            onClick={()=>{
              const heading=document.getElementById("diagram-ai-heading");
              heading?.scrollIntoView({behavior:"auto",block:"start"});
              heading?.focus({preventScroll:true});
            }}>
            Ir para Corrigir com IA
          </button>}
        </div>}
        {save.isError && <p role="alert" className="notice error">{save.error.message}</p>}
        {message && <p role="status" className="notice">{message}</p>}
      </form>
      <div>
        <p className="field mb-3">Prévia isolada</p>
        {svg ? <iframe title="Visualização do diagrama Mermaid" className="diagram-preview"
          sandbox="" referrerPolicy="no-referrer" srcDoc={svg} /> :
          <div className="diagram-preview-placeholder">Clique em Prévia para renderizar o fluxo.</div>}
        <p className="text-muted text-xs mt-2">A prévia usa sandbox restritivo. O código só é salvo após sua confirmação.</p>
      </div>
    </div>
    <div className="mt-6">
      <h3 className="font-semibold mb-3">Diagramas cadastrados</h3>
      {diagrams.isPending && <p role="status">Carregando diagramas…</p>}
      {diagrams.isError && <p className="notice error" role="alert">{diagrams.error.message}</p>}
      {diagrams.isSuccess && diagrams.data.length === 0 &&
        <p className="text-muted text-sm">Nenhum diagrama cadastrado nesta TF.</p>}
      {diagrams.data?.map((diagram) => <div className="diagram-item" key={diagram.id}>
        <strong>{diagram.titulo}</strong>
        <div className="diagram-item-actions">
          <button className="secondary-link" onClick={() => void preview(diagram.conteudo)}><Eye size={15} /> Visualizar</button>
          {own && <button className="secondary-link" onClick={() => edit(diagram)}><Pencil size={15} /> Editar</button>}
          {own && <button className="secondary-link" disabled={remove.isPending} onClick={() => {
            if (window.confirm("Excluir este diagrama?")) remove.mutate(diagram.id);
          }}><Trash2 size={15} /> Excluir</button>}
        </div>
      </div>)}
      {remove.isError && <p role="alert" className="notice error">{remove.error.message}</p>}
    </div>
    <p className="text-muted mt-4 text-xs flex gap-2 items-center">
      <GitBranchPlus size={16} /> O fluxograma gerado pela IA é editável. Só é gravado ao clicar em Salvar diagrama.
    </p>
  </section>;
}
