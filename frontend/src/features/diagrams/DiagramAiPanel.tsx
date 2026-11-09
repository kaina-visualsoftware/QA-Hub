import { useEffect, useMemo, useState } from "react";
import {ToastNotice} from "../../components/ui/Toasts";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@heroui/react";
import { Check, WandSparkles, Wrench } from "lucide-react";
import { diagramPresets, diagramPresetInstruction } from "../generators/ai-presets";
import type { Scenario, Task } from "../../lib/contracts";
import { supabase } from "../../lib/supabase";
import { loadApprovedRequirements } from "../../lib/legacy/qa-requirements-context.mjs";
import { requestAiDiagram, cleanMermaid } from "../../lib/legacy/qa-mermaid-ai.mjs";
import { buildDiagramPrompt } from "./diagram-context";
import type { DiagramInputMode } from "./diagram-context";
import { ensureMermaidSyntax, mermaidErrorMessage } from "./mermaid-validation";

type Props = {
  task:Task;
  scenarios:Scenario[];
  userId:string;
  onDraft:(code:string,mode:DiagramInputMode)=>boolean;
  repairRequest?:{code:string;error:string}|null;
  onRepairHandled?:()=>void;
};
const errorMessage=(reason:unknown)=>reason instanceof Error ? reason.message : "Não foi possível gerar o diagrama.";

export function DiagramAiPanel({task,scenarios,userId,onDraft,repairRequest,onRepairHandled}:Props){
  const own=task.user_id===userId;
  const [mode,setMode]=useState<DiagramInputMode>("task");
  const [preset,setPreset]=useState("processo");
  const [manual,setManual]=useState("");
  const [scenarioIds,setScenarioIds]=useState<string[]>(()=>
    scenarios.filter(s=>s.tarefa_id===task.id).slice(0,18).map(s=>s.id));
  const [requirementIds,setRequirementIds]=useState<string[]>([]);
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [attempts,setAttempts]=useState(0);
  const [invalidGenerated,setInvalidGenerated]=useState<{code:string;error:string}|null>(null);
  const requirements=useQuery({
    queryKey:["diagram-approved-requirements",userId,task.id],
    queryFn:()=>loadApprovedRequirements(supabase,task,userId),
    enabled:own
  });
  useEffect(()=>{
    if(requirements.data)setRequirementIds(requirements.data.map(r=>r.id));
  },[requirements.data]);
  const proposal=useMemo(()=>{
    try {
      return {text:buildDiagramPrompt({
        mode,task,scenarios,selectedScenarioIds:scenarioIds,
        requirements:requirements.data ?? [],
        selectedRequirementIds:requirementIds,manual,
        styleInstruction:diagramPresetInstruction(preset)
      }),error:""};
    } catch(e){
      return {text:"",error:errorMessage(e)};
    }
  },[mode,task,scenarios,scenarioIds,requirements.data,requirementIds,manual,preset]);
  useEffect(()=>{
    setConsent(false);setMessage("");setInvalidGenerated(null);setAttempts(0);
  },[proposal.text]);
  // Requirements are optional context; a temporary lookup failure must
  // not block a diagram based on the TF and its scenarios.
  const canGenerate=own&&!busy&&consent&&!proposal.error;

  const repairCandidate=repairRequest ?? invalidGenerated;
  async function generate(repair=false){
    if(!canGenerate || (repair&&!repairCandidate))return;
    setBusy(true);setError("");setMessage("");
    setAttempts(current=>current+1);
    try {
      const result=await requestAiDiagram({
        db:supabase,text:proposal.text,
        ...(repair&&repairCandidate
          ? {repair:{mermaid:repairCandidate.code,syntaxError:repairCandidate.error}}
          : {})
      });
      // Clean the model response, then check it with the REAL Mermaid parser.
      // Invalid responses remain visible for retry or manual editing and are
      // never silently accepted as stored diagrams.
      const code=cleanMermaid(result.code);
      try {
        await ensureMermaidSyntax(code);
      } catch(reason){
        const diagnosis=mermaidErrorMessage(reason);
        setInvalidGenerated({code,error:diagnosis});
        setError("A IA retornou um diagrama inválido. Você pode corrigir ou gerar novamente.");
        return;
      }
      if(!onDraft(code,mode)){
        setMessage("Geração concluída; a edição atual foi mantida.");
        return;
      }
      setInvalidGenerated(null);
      onRepairHandled?.();
      setMessage(result.fallback
        ? "A IA não retornou um resultado utilizável; foi criada uma sugestão local."
        : repair ? "Diagrama corrigido." : "Diagrama pronto para revisão.");
    } catch(cause){
      setError(errorMessage(cause));
    } finally{setBusy(false);}
  }

  const selected=new Set(scenarioIds);
  const selectedRequirements=new Set(requirementIds);
  const taskScenarios=scenarios.filter(s=>s.tarefa_id===task.id);
  return <section className="qa-diagram-ai qa-diagram-quick" aria-labelledby="diagram-ai-heading">
    <div className="qa-diagram-quick-heading">
      <span className="qa-diagram-quick-icon"><WandSparkles size={20} aria-hidden="true"/></span>
      <div>
        <h3 id="diagram-ai-heading" tabIndex={-1}>Criar diagrama com IA</h3>
        <p className="text-muted text-sm">Escolha a origem e gere o fluxo.</p>
      </div>
    </div>
    {!own&&<p role="alert" className="notice error">Somente o autor da TF pode gerar diagramas.</p>}
    <fieldset className="qa-diagram-mode qa-diagram-quick-modes" disabled={!own||busy}>
      <legend className="sr-only">Origem do fluxograma</legend>
      <label><input type="radio" name="diagram-input-mode" checked={mode==="task"}
        onChange={()=>setMode("task")}/> Dados da TF</label>
      <label><input type="radio" name="diagram-input-mode" checked={mode==="text"}
        onChange={()=>setMode("text")}/> Texto livre</label>
    </fieldset>
    <label className="field qa-ai-diagram-model">Modelo do diagrama
      <select value={preset} disabled={!own||busy}
        onChange={event=>setPreset(event.target.value)}>
        {diagramPresets.map(option=>
          <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
    {mode==="text"?
      <label className="field qa-diagram-description">Descreva o processo
        <textarea rows={4} value={manual} maxLength={20000} disabled={!own||busy}
          placeholder="Ex.: Receber pedido, validar valores e emitir nota"
          onChange={e=>setManual(e.target.value)}/>
      </label>
      :<details className="qa-diagram-options">
        <summary>Personalizar conteúdo <span>Opcional</span></summary>
        <div className="stack qa-diagram-options-content">
          <label className="field">Instruções adicionais
            <textarea rows={2} value={manual} maxLength={20000} disabled={!own||busy}
              placeholder="Ex.: destacar a etapa de aprovação"
              onChange={e=>setManual(e.target.value)}/>
          </label>
          {taskScenarios.length>0&&<details className="qa-diagram-nested">
            <summary>Cenários ({scenarioIds.length} selecionados)</summary>
            <div className="qa-diagram-picks">
              {taskScenarios.map(s=><label key={s.id}>
                <input type="checkbox" checked={selected.has(s.id)} disabled={!own||busy}
                  onChange={e=>setScenarioIds(curr=>e.target.checked?
                    [...curr,s.id]:curr.filter(id=>id!==s.id))}/>
                {s.titulo}
              </label>)}
            </div>
          </details>}
          {(requirements.data?.length??0)>0&&<details className="qa-diagram-nested">
            <summary>Requisitos ({requirementIds.length} selecionados)</summary>
            <div className="qa-diagram-picks">
              {requirements.data?.map(req=><label key={req.id}>
                <input type="checkbox" checked={selectedRequirements.has(req.id)}
                  disabled={!own||busy} onChange={e=>setRequirementIds(curr=>
                    e.target.checked?[...curr,req.id]:curr.filter(id=>id!==req.id))}/>
                {req.codigo} — {req.titulo}
              </label>)}
            </div>
          </details>}
          {requirements.isError&&<p className="text-muted text-sm" role="status">
            Requisitos indisponíveis. A TF e os cenários ainda podem ser usados.
          </p>}
        </div>
      </details>}
    {proposal.error&&<p role="alert" className="notice error">{proposal.error}</p>}
    <div className="qa-diagram-privacy">
      <label className="qa-diagram-consent">
        <input type="checkbox" checked={consent} disabled={!own||busy||!proposal.text}
          onChange={e=>setConsent(e.target.checked)}/>
        <span>Autorizo enviar este conteúdo à NVIDIA.</span>
      </label>
      <details className="qa-diagram-payload">
        <summary>Ver dados enviados</summary>
        <p className="text-muted text-xs">A IA recebe o contexto abaixo. Ao corrigir um erro,
          também recebe o Mermaid rejeitado e o diagnóstico do parser.</p>
        <textarea readOnly aria-label="Contexto enviado à IA" rows={5}
          value={proposal.text}/>
      </details>
    </div>
    <div className="qa-diagram-quick-actions">
      <Button isDisabled={!canGenerate} onPress={()=>void generate(false)}>
        <WandSparkles size={17} aria-hidden="true"/>
        {busy?"Gerando…":attempts?"Gerar novamente":"Gerar fluxograma com IA"}
      </Button>
      {repairCandidate&&<Button variant="secondary" isDisabled={!canGenerate}
        onPress={()=>void generate(true)}>
        <Wrench size={16}/> Corrigir com IA
      </Button>}
    </div>
    {invalidGenerated&&<div className="qa-diagram-error-details">
      <details className="qa-diagram-options">
        <summary>Detalhes do erro de sintaxe</summary>
        <pre className="qa-mermaid-diagnostic">{invalidGenerated.error}</pre>
        <textarea rows={5} readOnly value={invalidGenerated.code}
          aria-label="Código Mermaid inválido"/>
      </details>
      <button type="button" className="secondary-link"
        disabled={!own||busy} onClick={()=>{
          if(onDraft(invalidGenerated.code,mode))
            setMessage("Código transferido ao editor para ajuste.");
        }}>Editar código manualmente</button>
    </div>}
    {repairRequest&&!invalidGenerated&&<p role="status" className="text-muted text-sm">
      Código com erro. Use Corrigir com IA ou ajuste manualmente.
    </p>}
    <ToastNotice message={error} tone="error"/>
    <ToastNotice message={message} tone="success"/>
  </section>;
}
