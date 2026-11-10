import {useEffect,useMemo,useRef,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {WandSparkles,Wrench,FileText,CheckCircle2,AlertCircle,ShieldCheck} from "lucide-react";
import {ToastNotice} from "../../components/ui/Toasts";
import "./diagram-composer.css";
import {AiBusyStatus} from "../../components/ui/AiBusyStatus";
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
  onBusyChange?:(busy:boolean)=>void;
};
const reasonText=(reason:unknown)=>reason instanceof Error?reason.message:"Não foi possível gerar o diagrama.";

export function DiagramAiPanel({task,scenarios,userId,onDraft,repairRequest,onRepairHandled,onBusyChange}:Props){
  const own=task.user_id===userId;
  const [mode,setMode]=useState<DiagramInputMode>("task");
  const [preset,setPreset]=useState("processo");
  const [manual,setManual]=useState("");
  const [summary,setSummary]=useState("");
  const [consent,setConsent]=useState(false);
  const [summarizing,setSummarizing]=useState(false);
  const [summaryProgress,setSummaryProgress]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{onBusyChange?.(busy||summarizing);},[busy,summarizing,onBusyChange]);
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
    onBusyChange?.(true);
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
      setSummarizing(false);setSummaryProgress("");onBusyChange?.(false);
    }
  }

  async function generate(repair=false){
    if(!canGenerate||(repair&&!repairCandidate))return;
    onBusyChange?.(true);
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
    finally{setBusy(false);onBusyChange?.(false);}
  }

  const counts=evidence.coverage;
  const contextReady=Boolean(counts)&&!requirements.isPending&&!requirements.isError&&!evidence.error;
  const processing=busy||summarizing;
  return <section className="qa-diagram-ai qa-diagram-quick qa-diagram-form" aria-labelledby="diagram-ai-heading" aria-busy={processing}>
    <header className="qa-diagram-form-heading">
      <h3 id="diagram-ai-heading" tabIndex={-1}>Criar diagrama com IA</h3>
      <p>Defina a origem e o modelo. Depois revise o resumo antes de gerar o fluxo.</p>
    </header>
    {!own&&<p role="alert" className="notice error">Somente o autor pode gerar diagramas desta TF.</p>}
    <div className={"qa-diagram-form-layout"+(mode==="text"?" is-text":"")}>
      <div className="qa-diagram-form-fields">
        <fieldset className="qa-diagram-origin" disabled={!own||processing}>
          <legend>Origem do fluxograma</legend>
          <div className="qa-diagram-origin-choices">
            <label className={mode==="task"?"selected":""}><input type="radio" name="diagram-input-mode" checked={mode==="task"} onChange={()=>setMode("task")}/>
              <span><strong>Dados completos da TF</strong><small>Cenários, resultados e requisitos aprovados.</small></span></label>
            <label className={mode==="text"?"selected":""}><input type="radio" name="diagram-input-mode" checked={mode==="text"} onChange={()=>setMode("text")}/>
              <span><strong>Texto livre</strong><small>Descreva um processo específico.</small></span></label>
          </div>
        </fieldset>
        <label className="field qa-ai-diagram-model">Modelo do diagrama
          <select value={preset} disabled={!own||processing} onChange={event=>setPreset(event.target.value)}>
            {diagramPresets.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        {mode==="text"?<label className="field qa-diagram-description">Descreva o processo
          <textarea rows={7} value={manual} maxLength={20000} disabled={!own||processing}
            placeholder={"Descreva o início, as etapas e as decisões do processo.\nEx.: Receber pedido, conferir valores, emitir nota e tratar falhas."}
            onChange={e=>setManual(e.target.value)}/>
          <small>Inclua as condições e os resultados que precisam aparecer no fluxo.</small>
        </label>:<details className="qa-diagram-options">
          <summary>Orientações adicionais <span>Opcional</span></summary>
          <div className="qa-diagram-options-content"><label className="field">O que destacar no fluxo?
            <textarea rows={3} value={manual} maxLength={20000} disabled={!own||processing}
              placeholder="Ex.: priorizar a regra corrigida e os pontos de regressão" onChange={e=>setManual(e.target.value)}/>
          </label></div>
        </details>}
      </div>
      {mode==="task"&&<aside className="qa-diagram-context" aria-labelledby="diagram-context-heading">
        <h4 id="diagram-context-heading">Contexto da TF</h4>
        <p className="qa-diagram-context-task">{task.titulo}</p>
        {!contextReady&&!requirements.isError&&!evidence.error&&<p role="status">Carregando o contexto…</p>}
        <dl className="qa-diagram-context-counts" aria-label="Cobertura da tarefa">
          {([
            ["Cenários",counts?.total??0],["Aprovados",counts?.passed??0],
            ["Reprovados",counts?.failed??0],["Bloqueados",counts?.blocked??0],
            ["Pendentes",counts?.pending??0],["Requisitos aprovados",counts?.requirements??0]
          ] as const).map(([label,count])=><div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
        </dl>
        <p className="qa-diagram-context-note">Todos os cenários e resultados serão considerados, sem seleção manual.
          A análise será feita em {counts?.parts??0} parte(s) e pode consumir mais de uma geração NVIDIA.</p>
        <details className="qa-diagram-payload"><summary>Conferir todos os dados utilizados</summary>
          <textarea readOnly aria-label="Contexto completo da TF" rows={6} value={evidence.source}/>
        </details>
      </aside>}
    </div>
    {mode==="task"&&requirements.isError&&<p role="alert" className="notice error">
      Não foi possível carregar os requisitos aprovados. <button type="button" onClick={()=>void requirements.refetch()}>Tentar novamente</button>
    </p>}
    {mode==="task"&&evidence.error&&<p role="alert" className="notice error">{evidence.error}</p>}
    {mode==="task"&&summary&&<section className="qa-diagram-summary-review" aria-label="Revisão do resumo">
      <div className="qa-diagram-summary-review-heading"><strong><CheckCircle2 size={17} aria-hidden="true"/> Resumo pronto para revisão</strong>
        <span>{summary.length.toLocaleString("pt-BR")} caracteres</span></div>
      <label className="field" htmlFor="diagram-summary-text">Resumo da TF para diagrama</label>
      <textarea id="diagram-summary-text" rows={7} value={summary} disabled={processing} onChange={e=>setSummary(e.target.value)}/>
      <small>Revise o que foi implementado, aprovado, reprovado e ainda não testado.</small>
      <div className="qa-diagram-summary-verified"><AlertCircle size={16} aria-hidden="true"/>{counts&&coverageLine(counts)}</div>
    </section>}
    <footer className="qa-diagram-submit-area">
      <label className="qa-diagram-form-consent"><input type="checkbox" checked={consent} disabled={!own||processing} onChange={e=>setConsent(e.target.checked)}/>
        <span>Autorizo enviar {mode==="task"?"os dados da TF":"este texto"} à NVIDIA.</span>
      </label>
      {processing?<AiBusyStatus title={summarizing?"Preparando um resumo fiel da TF":"Gerando o fluxograma"}
        detail={summarizing?summaryProgress||"Organizando os documentos e cenários.":"Aguardando a NVIDIA e validando a sintaxe antes de abrir a prévia."}/>:
        <div className="qa-diagram-submit-actions">
          <p>{mode==="task"&&!summary?"Primeiro prepare o resumo. Você poderá revisá-lo antes de gerar o diagrama.":"Confira o conteúdo antes de gerar. O resultado será aberto para revisão."}</p>
          <div className="qa-diagram-submit-buttons">
            {mode==="task"&&<Button variant={summary?"secondary":"primary"} isDisabled={!canSummarize} onPress={()=>void summarize()}>
              <FileText size={17} aria-hidden="true"/>{summary?"Resumir novamente com IA":"Resumir TF com IA"}
            </Button>}
            {(mode==="text"||!!summary)&&<Button isDisabled={!canGenerate} onPress={()=>void generate(false)}>
              <WandSparkles size={17} aria-hidden="true"/>{attempts?"Gerar diagrama novamente":mode==="task"?"Gerar diagrama da TF":"Gerar diagrama"}
            </Button>}
            {repairCandidate&&<Button variant="secondary" isDisabled={!canGenerate} onPress={()=>void generate(true)}><Wrench size={16}/> Corrigir com IA</Button>}
          </div>
        </div>}
      {diagramText.error&&<p role="alert" className="notice error">{diagramText.error}</p>}
      {error&&<p role="alert" className="notice error">{error}</p>}
    </footer>
    {invalidGenerated&&<div className="qa-diagram-error-details"><details className="qa-diagram-options">
      <summary>Detalhes do erro de sintaxe</summary><pre className="qa-mermaid-diagnostic">{invalidGenerated.error}</pre>
      <textarea rows={5} readOnly value={invalidGenerated.code} aria-label="Código Mermaid inválido"/>
    </details><button type="button" className="secondary-link" disabled={!own||processing} onClick={()=>{
      if(onDraft(invalidGenerated.code,mode))setMessage("Código transferido para edição manual.");
    }}>Editar código manualmente</button></div>}
    <p className="qa-diagram-privacy-note"><ShieldCheck size={15} aria-hidden="true"/> O diagrama só será salvo na tarefa após sua confirmação na prévia.</p>
    <ToastNotice message={message} tone="success"/>
  </section>;
}
