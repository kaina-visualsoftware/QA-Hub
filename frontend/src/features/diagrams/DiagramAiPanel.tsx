import {useEffect,useMemo,useRef,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {WandSparkles,Wrench,FileText,CheckCircle2,AlertCircle,LoaderCircle,ShieldCheck} from "lucide-react";
import {ToastNotice} from "../../components/ui/Toasts";
import {diagramPresets,diagramPresetInstruction} from "../generators/ai-presets";
import type {Scenario,Task} from "../../lib/contracts";
import {supabase} from "../../lib/supabase";
import {loadApprovedRequirements} from "../../lib/legacy/qa-requirements-context.mjs";
import {
  requestAiDiagram,requestAiDiagramSummary,cleanMermaid
} from "../../lib/legacy/qa-mermaid-ai.mjs";
import {buildDiagramPrompt} from "./diagram-context";
import type {DiagramInputMode} from "./diagram-context";
import {
  createDiagramEvidence,chunkDiagramEvidence,summaryInput,
  coverageLine,finalDiagramContext,DIAGRAM_SUMMARY_LIMIT
} from "./diagram-summary";
import {ensureMermaidSyntax,mermaidErrorMessage} from "./mermaid-validation";

type Props={
  task:Task;scenarios:Scenario[];userId:string;
  onDraft:(code:string,mode:DiagramInputMode)=>boolean;
  repairRequest?:{code:string;error:string}|null;
  onRepairHandled?:()=>void;
};
const reasonText=(reason:unknown)=>reason instanceof Error?reason.message:"Não foi possível gerar o diagrama.";

export function DiagramAiPanel({task,scenarios,userId,onDraft,repairRequest,onRepairHandled}:Props){
  const own=task.user_id===userId;
  const [mode,setMode]=useState<DiagramInputMode>("task");
  const [preset,setPreset]=useState("processo");
  const [manual,setManual]=useState("");
  const [summary,setSummary]=useState("");
  const [consent,setConsent]=useState(false);
  const [summarizing,setSummarizing]=useState(false);
  const [summaryProgress,setSummaryProgress]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [attempts,setAttempts]=useState(0);
  const [invalidGenerated,setInvalidGenerated]=useState<{code:string;error:string}|null>(null);
  const sourceVersion=useRef("");
  const requirements=useQuery({
    queryKey:["diagram-approved-requirements",userId,task.id],
    queryFn:()=>loadApprovedRequirements(supabase,task,userId),enabled:own
  });

  const evidence=useMemo(()=>{
    try{
      const {source,coverage}=createDiagramEvidence(
        task,scenarios,requirements.data??[],manual
      );
      const chunks=chunkDiagramEvidence(source);
      return {source,chunks,coverage:{...coverage,parts:chunks.length},error:""};
    }catch(reason){
      return {source:"",chunks:[] as string[],coverage:null,error:reasonText(reason)};
    }
  },[task,scenarios,requirements.data,manual]);
  // Never reuse a previous summary after a scenario, result, requirement or source changes.
  const currentSource=mode+"|"+evidence.source;
  sourceVersion.current=currentSource;
  useEffect(()=>{
    setSummary("");setSummaryProgress("");setConsent(false);
    setInvalidGenerated(null);setAttempts(0);
  },[currentSource]);

  const diagramText=useMemo(()=>{
    if(mode==="task"){
      if(!summary.trim()||!evidence.coverage)return {text:"",error:""};
      try {
        return {text:finalDiagramContext(summary,evidence.coverage,
          diagramPresetInstruction(preset)),error:""};
      }catch(reason){return {text:"",error:reasonText(reason)};}
    }
    try{
      return {text:buildDiagramPrompt({
        mode:"text",task,scenarios:[],selectedScenarioIds:[],
        requirements:[],selectedRequirementIds:[],manual,
        styleInstruction:diagramPresetInstruction(preset)
      }),error:""};
    }catch(reason){return {text:"",error:reasonText(reason)};}
  },[mode,summary,evidence.coverage,preset,manual,task]);

  const canSummarize=own&&mode==="task"&&!summarizing&&!busy&&consent&&
    !requirements.isPending&&!requirements.isError&&!evidence.error;
  const canGenerate=own&&!busy&&!summarizing&&consent&&Boolean(diagramText.text)&&
    !diagramText.error&&(mode==="text"||!requirements.isError);
  const repairCandidate=repairRequest??invalidGenerated;

  async function summarize(){
    if(!canSummarize||!evidence.coverage)return;
    const snapshot=currentSource;
    setSummarizing(true);setSummaryProgress("");
    setError("");setMessage("");setSummary("");
    try{
      let chunks=evidence.chunks;
      let round=0;
      let combined="";
      do{
        const partial:string[]=[];
        for(let i=0;i<chunks.length;i++){
          if(sourceVersion.current!==snapshot)
            throw Error("A TF mudou durante a análise. Revise os dados e resuma novamente.");
          setSummaryProgress((round?"Consolidando os resumos":"Analisando a TF")+
            " — parte "+(i+1)+" de "+chunks.length);
          const result=await requestAiDiagramSummary({
            db:supabase,text:summaryInput(chunks[i],i,chunks.length)
          });
          partial.push(result);
        }
        const next=partial.map((s,i)=>"PARTE "+(i+1)+"\n"+s).join("\n\n");
        if(round>0&&next.length>=combined.length)
          throw Error("A NVIDIA não conseguiu reduzir o resumo sem perda verificável. Revise as partes.");
        combined=next;
        if(combined.length<=DIAGRAM_SUMMARY_LIMIT-1000)break;
        chunks=chunkDiagramEvidence(combined,9000);
        round++;
        if(round>=6)throw Error("Os resumos continuam extensos. Revise a descrição da TF antes de gerar.");
      }while(true);
      if(sourceVersion.current!==snapshot)
        throw Error("Os dados da TF mudaram durante a análise. Resuma novamente.");
      setSummary(combined);
      setMessage("Resumo pronto. Confira as funções e os resultados antes de gerar o diagrama.");
    }catch(reason){
      setError(reasonText(reason));
    }finally{
      setSummarizing(false);setSummaryProgress("");
    }
  }

  async function generate(repair=false){
    if(!canGenerate||(repair&&!repairCandidate))return;
    setBusy(true);setError("");setMessage("");
    setAttempts(n=>n+1);
    try{
      const result=await requestAiDiagram({
        db:supabase,text:diagramText.text,strict:mode==="task",
        ...(repair&&repairCandidate?
          {repair:{mermaid:repairCandidate.code,syntaxError:repairCandidate.error}}:{})
      });
      const code=cleanMermaid(result.code);
      try{await ensureMermaidSyntax(code);}
      catch(reason){
        const diagnosis=mermaidErrorMessage(reason);
        setInvalidGenerated({code,error:diagnosis});
        setError("O diagrama apresentou erro de sintaxe. Corrija ou gere novamente.");
        return;
      }
      if(!onDraft(code,mode)){
        setMessage("A geração terminou, mas a edição atual foi preservada.");
        return;
      }
      setInvalidGenerated(null);onRepairHandled?.();
      setMessage(result.fallback?
        "A NVIDIA não retornou um diagrama válido. Revise a sugestão local antes de salvar.":
        repair?"Diagrama corrigido.":"Diagrama pronto para revisão.");
    }catch(reason){setError(reasonText(reason));}
    finally{setBusy(false);}
  }

  const counts=evidence.coverage;
  const contextReady=Boolean(counts)&&!requirements.isPending&&!requirements.isError&&!evidence.error;
  return <section className="qa-diagram-ai qa-diagram-quick" aria-labelledby="diagram-ai-heading"
    aria-busy={busy||summarizing}>
    <div className="qa-diagram-quick-heading">
      <span className="qa-diagram-quick-icon"><WandSparkles size={20} aria-hidden="true"/></span>
      <div>
        <p className="qa-generator-eyebrow">FLUXO DA TAREFA</p>
        <h3 id="diagram-ai-heading" tabIndex={-1}>Criar diagrama com IA</h3>
        <p className="text-muted text-sm">Escolha a origem, revise o contexto e gere um fluxo fiel à TF.</p>
      </div>
    </div>
    {mode==="task"&&<ol className="qa-diagram-stage-track" aria-label="Etapas do diagrama">
      <li className={contextReady?"is-done":""}>
        <span>{contextReady?<CheckCircle2 size={15} aria-hidden="true"/>:"1"}</span>
        Dados da TF
      </li>
      <li className={summary?"is-done":summarizing?"is-active":""}>
        <span>{summary?<CheckCircle2 size={15} aria-hidden="true"/>:"2"}</span> Resumo da TF
      </li>
      <li className={busy||summary?"is-active":""}><span>3</span> Gerar fluxo</li>
    </ol>}
    {!own&&<p role="alert" className="notice error">Somente o autor pode gerar diagramas desta TF.</p>}
    <fieldset className="qa-diagram-mode qa-diagram-quick-modes" disabled={!own||busy||summarizing}>
      <legend className="sr-only">Origem do fluxograma</legend>
      <label><input type="radio" name="diagram-input-mode" checked={mode==="task"}
        onChange={()=>setMode("task")}/> Dados completos da TF</label>
      <label><input type="radio" name="diagram-input-mode" checked={mode==="text"}
        onChange={()=>setMode("text")}/> Texto livre</label>
    </fieldset>
    <label className="field qa-ai-diagram-model">Modelo do diagrama
      <select value={preset} disabled={!own||busy||summarizing}
        onChange={event=>setPreset(event.target.value)}>
        {diagramPresets.map(option=><option key={option.id} value={option.id}>
          {option.label}
        </option>)}
      </select>
    </label>
    {mode==="text"?<label className="field qa-diagram-description">
      Descreva o processo
      <textarea rows={4} value={manual} maxLength={20000} disabled={!own||busy}
        placeholder="Ex.: Receber pedido, conferir valores, emitir nota e verificar falhas"
        onChange={e=>setManual(e.target.value)}/>
    </label>:<>
      <div className="qa-diagram-summary-coverage" aria-label="Cobertura da tarefa">
        <div><strong>{counts?.total??0}</strong><span>Cenários</span></div>
        <div><strong>{counts?.passed??0}</strong><span>Aprovados</span></div>
        <div><strong>{counts?.failed??0}</strong><span>Reprovados</span></div>
        <div><strong>{counts?.blocked??0}</strong><span>Bloqueados</span></div>
        <div><strong>{counts?.pending??0}</strong><span>Pendentes</span></div>
      </div>
      <p className="qa-diagram-summary-explainer">
        A análise considera os <b>{counts?.total??0} cenários</b> e
        <b> {counts?.requirements??0} requisitos aprovados</b>, sem seleção manual.
        Os dados serão organizados em {counts?.parts??0} parte(s), preservando os
        resultados registrados. Pode consumir mais de uma geração NVIDIA.
      </p>
      <details className="qa-diagram-options">
        <summary>Orientações adicionais <span>Opcional</span></summary>
        <div className="qa-diagram-options-content">
          <label className="field">O que destacar no fluxo?
            <textarea rows={2} value={manual} maxLength={20000}
              disabled={!own||busy||summarizing}
              placeholder="Ex.: priorizar a regra corrigida e as regressões"
              onChange={e=>setManual(e.target.value)}/>
          </label>
        </div>
      </details>
      {requirements.isError&&<p role="alert" className="qa-diagram-summary-warning">
        Não foi possível carregar os requisitos aprovados. Atualize a TF antes de resumir,
        para evitar uma análise incompleta.
      </p>}
      {evidence.error&&<p role="alert" className="qa-diagram-summary-warning">{evidence.error}</p>}
      <details className="qa-diagram-payload">
        <summary>Conferir todos os dados utilizados</summary>
        <textarea readOnly aria-label="Contexto completo da TF"
          rows={6} value={evidence.source}/>
      </details>
    </>}
    <div className="qa-diagram-privacy qa-ai-submit-row">
      <label className="qa-diagram-consent qa-ai-consent-compact">
        <input type="checkbox" checked={consent} disabled={!own||busy||summarizing}
          onChange={e=>setConsent(e.target.checked)}/>
        <span>Autorizo enviar {mode==="task"?"os dados da TF":"este texto"} à NVIDIA.</span>
      </label>
    </div>
    {mode==="task"&&<>
      <div className="qa-diagram-summary-action">
        <Button variant="secondary" isDisabled={!canSummarize} onPress={()=>void summarize()}>
          {summarizing?<LoaderCircle size={17} className="qa-ai-spinner" aria-hidden="true"/>:
            <FileText size={17} aria-hidden="true"/>}
          {summarizing?"Resumindo a tarefa…":summary?"Resumir novamente com IA":"Resumir TF com IA"}
        </Button>
        {summarizing&&<div role="status" aria-live="polite" className="qa-diagram-processing">
          <LoaderCircle className="qa-ai-spinner" size={18} aria-hidden="true"/>
          <div><strong>Preparando um resumo fiel da TF</strong>
            <p>{summaryProgress||"Organizando os documentos e cenários."}</p></div>
        </div>}
      </div>
      {summary&&<div className="qa-diagram-summary-review">
        <div className="qa-diagram-summary-review-heading">
          <strong><CheckCircle2 size={17} aria-hidden="true"/> Resumo pronto para revisão</strong>
          <span>{summary.length.toLocaleString("pt-BR")} caracteres</span>
        </div>
        <label className="field" htmlFor="diagram-summary-text">Resumo da TF para diagrama</label>
        <textarea id="diagram-summary-text" rows={8} value={summary}
          disabled={busy||summarizing}
          onChange={e=>setSummary(e.target.value)}/>
        <small>Revise o que foi implementado, aprovado, reprovado e ainda não testado.
          A geração não altera a TF nem os resultados cadastrados.</small>
        <div className="qa-diagram-summary-verified">
          <AlertCircle size={16} aria-hidden="true"/>
          {counts&&coverageLine(counts)}
        </div>
      </div>}
    </>}
    {diagramText.error&&<p role="alert" className="qa-diagram-summary-warning">{diagramText.error}</p>}
    <div className="qa-diagram-quick-actions">
      <Button isDisabled={!canGenerate} onPress={()=>void generate(false)}>
        {busy?<LoaderCircle size={17} className="qa-ai-spinner" aria-hidden="true"/>:
          <WandSparkles size={17} aria-hidden="true"/>}
        {busy?"Gerando…":attempts?"Gerar diagrama novamente":mode==="task"?"Gerar diagrama da TF":"Gerar diagrama"}
      </Button>
      {repairCandidate&&<Button variant="secondary"
        isDisabled={!canGenerate} onPress={()=>void generate(true)}>
        <Wrench size={16}/> Corrigir com IA
      </Button>}
    </div>
    {busy&&<div role="status" aria-live="polite" className="qa-diagram-processing">
      <LoaderCircle className="qa-ai-spinner" size={18} aria-hidden="true"/>
      <div><strong>Gerando o fluxograma</strong>
        <p>Aguardando a NVIDIA e validando a sintaxe Mermaid antes de abrir a prévia.</p></div>
    </div>}
    {mode==="task"&&!summary&&!summarizing&&<p className="qa-diagram-summary-explainer">
      Primeiro gere e revise o resumo completo; depois o diagrama ficará disponível.
    </p>}
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
            setMessage("Código transferido para edição manual.");
        }}>Editar código manualmente</button>
    </div>}
    <p className="qa-diagram-privacy-note">
      <ShieldCheck size={15} aria-hidden="true"/>
      O diagrama só será salvo na tarefa após sua confirmação na prévia.
    </p>
    <ToastNotice message={error} tone="error"/>
    <ToastNotice message={message} tone="success"/>
  </section>;
}
