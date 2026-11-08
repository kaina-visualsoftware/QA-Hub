import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@heroui/react";
import { Check, GitBranchPlus, WandSparkles } from "lucide-react";
import type { Scenario, Task } from "../../lib/contracts";
import { supabase } from "../../lib/supabase";
import { loadApprovedRequirements } from "../../lib/legacy/qa-requirements-context.mjs";
import { requestAiDiagram, cleanMermaid } from "../../lib/legacy/qa-mermaid-ai.mjs";
import { buildDiagramPrompt } from "./diagram-context";
import type { DiagramInputMode } from "./diagram-context";

type Props = {
  task:Task;
  scenarios:Scenario[];
  userId:string;
  onDraft:(code:string,mode:DiagramInputMode)=>void;
};
const errorMessage=(reason:unknown)=>reason instanceof Error ? reason.message : "Não foi possível gerar o diagrama.";

export function DiagramAiPanel({task,scenarios,userId,onDraft}:Props){
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
    setConsent(false);setMessage("");
  },[proposal.text]);
  const canGenerate=own&&!busy&&consent&&!proposal.error&&
    (!requirements.isPending||mode==="text")&&!requirements.isError;

  async function generate(){
    if(!canGenerate)return;
    setBusy(true);setError("");setMessage("");
    try {
      const result=await requestAiDiagram({db:supabase,text:proposal.text});
      // The model output is untrusted data, never JavaScript or HTML.
      const code=cleanMermaid(result.code);
      onDraft(code,mode);
      setMessage(result.fallback
        ? "A NVIDIA não retornou um fluxo utilizável. Um fluxograma local foi preparado. Revise e salve manualmente."
        : "Fluxograma gerado. Confira a prévia e revise o código antes de salvar na TF.");
    } catch(cause){
      setError(errorMessage(cause));
    } finally {setBusy(false);}
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
      <span>Autorizo enviar este texto à NVIDIA para gerar um fluxograma. Identificadores comuns são mascarados automaticamente; revise o conteúdo antes de confirmar.</span>
    </label>
    <div className="flex flex-wrap gap-3 items-center mt-4">
      <Button isDisabled={!canGenerate} onPress={()=>void generate()}>
        <WandSparkles size={16}/> {busy?"Gerando diagrama…":"Gerar fluxograma com IA"}
      </Button>
      <span className="text-muted text-xs"><GitBranchPlus size={14} className="inline-block"/> Gerar não grava a TF</span>
    </div>
    {busy && <p role="status" className="mt-3 text-muted text-sm">Consultando a IA. O diagrama será preparado no editor, sem salvar automaticamente.</p>}
    {error && <p role="alert" className="notice error mt-3">{error}</p>}
    {message && <p role="status" className="notice mt-3 flex gap-2"><Check size={16}/>{message}</p>}
  </section>;
}
