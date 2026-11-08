import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@heroui/react";
import { Check, GitBranchPlus, WandSparkles, Wrench } from "lucide-react";
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
        selectedRequirementIds:requirementIds,manual
      }),error:""};
    } catch(e){
      return {text:"",error:errorMessage(e)};
    }
  },[mode,task,scenarios,scenarioIds,requirements.data,requirementIds,manual]);
  useEffect(()=>{
    setConsent(false);setMessage("");setInvalidGenerated(null);setAttempts(0);
  },[proposal.text]);
  const canGenerate=own&&!busy&&consent&&!proposal.error&&
    (mode==="text"||(!requirements.isPending&&!requirements.isError));

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
        setError("O fluxograma retornou com erro de sintaxe. Escolha Corrigir com IA ou Gerar novamente.");
        return;
      }
      if(!onDraft(code,mode)){
        setMessage("Geração concluída; a edição atual foi mantida.");
        return;
      }
      setInvalidGenerated(null);
      onRepairHandled?.();
      setMessage(result.fallback
        ? "A NVIDIA não retornou um fluxo utilizável. Fluxograma local validado: revise antes de salvar."
        : repair
          ? "Sintaxe corrigida e validada. Confira a prévia e salve o diagrama quando estiver correto."
          : "Fluxograma validado pelo Mermaid. Confira a prévia antes de salvar na TF.");
    } catch(cause){
      setError(errorMessage(cause));
    } finally{setBusy(false);}
  }
  const selected=new Set(scenarioIds);
  const selectedRequirements=new Set(requirementIds);
  return <section className="qa-diagram-ai" aria-labelledby="diagram-ai-heading">
    <div className="section-heading">
      <div>
        <p className="eyebrow">ASSISTENTE DE FLUXOGRAMAS</p>
        <h3 id="diagram-ai-heading" tabIndex={-1} className="font-semibold">Criar diagrama com IA</h3>
        <p className="text-muted text-sm">Use a TF ou descreva o processo. Revise o Mermaid antes de salvar.</p>
      </div>
      <WandSparkles size={21} aria-hidden="true" />
    </div>
    {!own && <p role="alert" className="notice error mt-3">A geração com IA é restrita ao autor da TF. A consulta administrativa permanece somente leitura.</p>}
    <fieldset className="qa-diagram-mode mt-4" disabled={!own||busy}>
      <legend>Origem do fluxograma</legend>
      <label><input type="radio" name="diagram-input-mode" checked={mode==="task"}
        onChange={()=>setMode("task")} /> Dados da TF</label>
      <label><input type="radio" name="diagram-input-mode" checked={mode==="text"}
        onChange={()=>setMode("text")} /> Texto livre</label>
    </fieldset>
    {mode==="task" && <>
      <details className="generator-context mt-3" open={false}>
        <summary>Cenários incluídos ({scenarioIds.length})</summary>
        <div className="qa-diagram-picks mt-3">
          {scenarios.filter(s=>s.tarefa_id===task.id).map(s=>
            <label key={s.id}><input type="checkbox" checked={selected.has(s.id)} disabled={!own||busy}
              onChange={e=>setScenarioIds(curr=>e.target.checked
                ? [...curr,s.id] : curr.filter(id=>id!==s.id))}/>
              {s.titulo}</label>)}
          {!scenarios.length && <p className="text-muted text-sm">Sem cenários cadastrados; a IA utilizará os campos da TF.</p>}
        </div>
        <p className="text-muted text-xs mt-2">Máximo de 18 cenários por diagrama. Desmarque os que não fazem parte do fluxo.</p>
      </details>
      {requirements.isError && <p className="notice error mt-3" role="alert">Não foi possível carregar requisitos. Verifique o acesso antes de gerar.</p>}
      {(requirements.data?.length ?? 0)>0 && <details className="generator-context mt-3">
        <summary>Requisitos aprovados incluídos ({requirementIds.length})</summary>
        <div className="qa-diagram-picks mt-3">
          {requirements.data?.map(r=><label key={r.id}>
            <input type="checkbox" checked={selectedRequirements.has(r.id)} disabled={!own||busy}
              onChange={e=>setRequirementIds(curr=>e.target.checked
                ? [...curr,r.id]:curr.filter(id=>id!==r.id))}/>
            {r.codigo} — {r.titulo}</label>)}
        </div>
      </details>}
    </>}
    <label className="field mt-4">{mode==="task" ? "Complemento opcional" : "Descreva o processo"}
      <textarea rows={4} value={manual} maxLength={20000} disabled={!own||busy}
        placeholder={mode==="task"?"Detalhes adicionais do fluxo que deseja representar…":"Descreva as etapas, decisões e caminhos alternativos…"}
        onChange={e=>setManual(e.target.value)}/>
    </label>
    {proposal.error && <p role="alert" className="notice error mt-3">{proposal.error}</p>}
    {proposal.text && <details className="generator-context mt-3">
      <summary>Conferir o texto que será enviado à IA ({proposal.text.length} caracteres)</summary>
      <textarea readOnly className="w-full mt-3" rows={7} value={proposal.text}/>
    </details>}
    <label className="qa-diagram-consent mt-3">
      <input type="checkbox" checked={consent} disabled={!own||busy||!proposal.text}
        onChange={e=>setConsent(e.target.checked)}/>
      <span>Autorizo enviar o texto exibido à NVIDIA. Ao solicitar correção, o código Mermaid e o diagnóstico de sintaxe também serão enviados. Revise os dados antes de confirmar.</span>
    </label>
    <div className="flex flex-wrap gap-3 items-center mt-4">
      <Button isDisabled={!canGenerate} onPress={()=>void generate(false)}>
        <WandSparkles size={16}/>
        {busy?"Consultando a IA…":attempts?"Gerar novamente":"Gerar fluxograma com IA"}
      </Button>
      {repairCandidate && <Button variant="secondary" isDisabled={!canGenerate}
        onPress={()=>void generate(true)}>
        <Wrench size={16}/> Corrigir com IA
      </Button>}
      <span className="text-muted text-xs"><GitBranchPlus size={14} className="inline-block"/> Só salva após sua confirmação</span>
    </div>
    {invalidGenerated && <div className="qa-diagram-error-details mt-4">
      <p className="font-semibold">Código recebido com erro de sintaxe</p>
      <p className="text-muted text-sm mt-2">Use Corrigir com IA, Gerar novamente ou abra o código para ajustes manuais. Nada foi salvo.</p>
      <pre className="qa-mermaid-diagnostic mt-3">{invalidGenerated.error}</pre>
      <details className="generator-context mt-3">
        <summary>Consultar código Mermaid com erro</summary>
        <textarea className="w-full mt-3" rows={8} readOnly value={invalidGenerated.code}/>
      </details>
      <button className="secondary-link mt-3" type="button" disabled={!own||busy}
        onClick={()=>{if(onDraft(invalidGenerated.code,mode)){
          setMessage("Código transferido para o editor. Corrija a sintaxe antes de salvar.");
        }}}>
        Editar código manualmente
      </button>
    </div>}
    {repairRequest && !invalidGenerated && <p className="text-muted text-sm mt-3" role="status">
      O editor identificou um erro de sintaxe. Autorize o envio para corrigi-lo com IA ou altere o Mermaid manualmente.
    </p>}
    {busy && <p role="status" className="mt-3 text-muted text-sm">Consultando a IA. O diagrama será preparado no editor, sem salvar automaticamente.</p>}
    {error && <p role="alert" className="notice error mt-3">{error}</p>}
    {message && <p role="status" className="notice mt-3 flex gap-2"><Check size={16}/>{message}</p>}
  </section>;
}
