import { useEffect, useMemo, useRef, useState } from "react";
import {ToastNotice} from "../../components/ui/Toasts";
import { ArrowLeft, ArrowRight, Check, ClipboardList, FilePlus2, ListCheck, RotateCcw, X } from "lucide-react";
import type { ExecutionResult, Scenario } from "../../lib/contracts";
import { scenarioStatusLabels } from "../../lib/contracts";
import { nextAfterSaved, orderedGuideScenarios } from "./guided-selection";
import type { GuideScope } from "./guided-selection";

type ResultStatus = ExecutionResult["status"];
type GuidedDraft = "reprovado" | "bloqueado" | null;

export default function GuidedExecution({
  scenarios, owner, canCreateScenario=owner, busy, onSave, onEvidence, onNewScenario
}: {
  scenarios: Scenario[];
  owner: boolean;
  canCreateScenario?:boolean;
  busy: boolean;
  onSave: (scenario: Scenario, status: ResultStatus, observed: string) => Promise<boolean>;
  onEvidence: (scenario: Scenario) => void;
  onNewScenario: () => void;
}) {
  const [scope, setScope] = useState<GuideScope>("pending");
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [draft, setDraft] = useState<GuidedDraft>(null);
  const [observed, setObserved] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const guideRef = useRef<HTMLElement|null>(null);
  const items = useMemo(()=>orderedGuideScenarios(scenarios,scope),[scenarios,scope]);
  const current = items.find(item=>item.id===selectedId) ?? items[0] ?? null;
  const position = current ? items.findIndex(item=>item.id===current.id) : -1;
  const completed = scenarios.filter(item=>item.status!=="nao_executado").length;
  const pending = scenarios.length-completed;
  const hasDraft = Boolean(draft && observed.trim());
  const actionDisabled = busy || !owner;

  useEffect(()=>{
    // The panel stays mounted as filters and results change. Reset a draft only
    // when the selected scenario changes; never replace text with stale data.
    setDraft(null);setObserved("");setError("");
  },[current?.id]);

  function canLeave(): boolean {
    return !hasDraft || window.confirm("Descartar a observação não salva deste cenário?");
  }
  function selectScope(value:GuideScope){
    if(busy||!canLeave())return;
    setScope(value);setSelectedId(null);setDraft(null);setObserved("");setError("");
  }
  function move(delta:number){
    if(busy||!current||!canLeave())return;
    const target=items[position+delta];
    if(!target)return;
    setSelectedId(target.id);setDraft(null);setObserved("");setError("");
    requestAnimationFrame(()=>guideRef.current?.querySelector<HTMLElement>(
      '[data-qa-guided-primary="true"]')?.focus({preventScroll:true}));
  }
  function pick(status:GuidedDraft){
    if(actionDisabled||!current)return;
    setDraft(status);setObserved(current.status===status ? current.obtido : "");
    setError("");
  }
  async function save(status:ResultStatus, note=""){
    if(actionDisabled||!current)return;
    if ((status==="reprovado"||status==="bloqueado") && note.trim().length<3){
      setError("Descreva o comportamento observado (mínimo de 3 caracteres).");
      return;
    }
    const currentId=current.id;
    const next=nextAfterSaved(scenarios,currentId,scope);
    setError("");setAnnouncement("");
    try{
      const confirmed=await onSave(current,status,note.trim());
      if(!confirmed)return;
      setDraft(null);setObserved("");
      setSelectedId(next);
      const pendingAfter = scenarios.filter(item=>item.id!==currentId &&
        item.status==="nao_executado").length;
      setAnnouncement(scope==="pending" && status!=="nao_executado"
        ? pendingAfter>0
          ? "Resultado salvo. Próximo cenário pendente disponível."
          : "Último cenário pendente registrado. Revise os resultados antes de encerrar a TF."
        : "Resultado salvo. A situação da TF não foi alterada.");
      requestAnimationFrame(()=>guideRef.current?.querySelector<HTMLElement>(
        '[data-qa-guided-primary="true"]')?.focus({preventScroll:true}));
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Falha ao registrar resultado. Tente novamente.");
    }
  }
  return <section className="qa-guided" aria-label="Execução guiada dos testes" ref={guideRef}>
    <div className="qa-guided-toolbar">
      <div>
        <p className="eyebrow">EXECUÇÃO GUIADA</p>
        <h3>Um cenário de cada vez</h3>
      </div>
      <div className="qa-guided-scope" role="group" aria-label="Cenários na execução guiada">
        <button type="button" className={scope==="pending"?"selected":""}
          disabled={busy} aria-pressed={scope==="pending"}
          onClick={()=>selectScope("pending")}>Pendentes ({pending})</button>
        <button type="button" className={scope==="all"?"selected":""}
          disabled={busy} aria-pressed={scope==="all"}
          onClick={()=>selectScope("all")}>Todos</button>
      </div>
    </div>
    <div className="qa-guided-progress-row">
      <strong>{completed}/{scenarios.length}</strong> executados
      <span>{pending} pendentes</span>
    </div>
    <div className="qa-guided-meter" role="progressbar" aria-label="Progresso dos testes guiados"
      aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={scenarios.length ? Math.round(completed/scenarios.length*100) : 0}>
      <span style={{width:(scenarios.length ? completed/scenarios.length*100 : 0)+"%"}}/>
    </div>
    {!current ? <div className="qa-guided-complete">
      <ListCheck size={32} aria-hidden="true"/>
      <h4>{scenarios.length===0?"Nenhum cenário cadastrado":
        "Sem cenários pendentes"}</h4>
      <p>{scenarios.length===0?"Cadastre ou gere casos para começar.":
        "Não há mais pendências nesta TF. Confira os resultados antes de alterar a situação da tarefa."}</p>
      {scenarios.length===0&&<button type="button" disabled={!canCreateScenario} onClick={onNewScenario}>
        <FilePlus2 size={16} aria-hidden="true"/> Cadastrar cenário
      </button>}
      {scenarios.length>0&&<button type="button" onClick={()=>selectScope("all")}>
        Revisar todos os resultados <ArrowRight size={16} aria-hidden="true"/>
      </button>}
    </div> :
      <article className="qa-guided-card">
        <div className="qa-guided-heading">
          <div><span className="eyebrow">CENÁRIO {String(current.ordem).padStart(2,"0")} · {position+1} DE {items.length}</span>
            <h4>{current.titulo}</h4></div>
          <span className={"status-chip "+current.status}>{scenarioStatusLabels[current.status]}</span>
        </div>
        <div className="qa-guided-details">
          <div><h5>Passos</h5><p>{current.passos||"Não informado"}</p></div>
          <div><h5>Resultado esperado</h5><p>{current.esperado||"Não informado"}</p></div>
          {current.observacoes&&<div><h5>Observações</h5><p>{current.observacoes}</p></div>}
          {current.obtido&&<div className="qa-guided-observed">
            <h5>Resultado observado anteriormente</h5><p>{current.obtido}</p></div>}
        </div>
        <div className="qa-guided-actions" role="group" aria-label={"Registrar resultado de "+current.titulo}>
          <button type="button" className="qa-guided-pass" data-qa-guided-primary="true"
            disabled={actionDisabled} onClick={()=>void save("aprovado")}>
            <Check size={18} aria-hidden="true"/> Funcionou
          </button>
          <button type="button" className="qa-guided-fail" disabled={actionDisabled}
            onClick={()=>pick("reprovado")}>
            <X size={18} aria-hidden="true"/> Não funcionou
          </button>
          <button type="button" className="qa-guided-block" disabled={actionDisabled}
            onClick={()=>pick("bloqueado")}>Bloqueado</button>
        </div>
        {draft&&<form className="qa-guided-note" onSubmit={event=>{
          event.preventDefault();void save(draft,observed);
        }}>
          <label className="field">Comportamento observado — {draft==="reprovado"?"falha":"bloqueio"}
            <textarea value={observed} autoFocus disabled={busy} maxLength={2000} rows={3}
              placeholder="Descreva o que ocorreu, sem dados sensíveis."
              onChange={event=>setObserved(event.target.value)}/>
          </label>
          <div className="qa-guided-note-actions">
            <button type="button" className="qa-guided-text-btn" disabled={busy}
              onClick={()=>{setDraft(null);setObserved("");setError("");}}>Cancelar</button>
            <button type="submit" className="qa-guided-submit"
              disabled={actionDisabled||observed.trim().length<3}>
              {busy?"Salvando…":"Salvar resultado"}
            </button>
          </div>
        </form>}
        <div className="qa-guided-utility">
          <button type="button" disabled={!owner||busy} onClick={()=>onEvidence(current)}>
            <FilePlus2 size={16} aria-hidden="true"/> Adicionar evidência
          </button>
          {current.status!=="nao_executado"&&<button type="button" disabled={actionDisabled}
            onClick={()=>void save("nao_executado")}>
            <RotateCcw size={15} aria-hidden="true"/> Desfazer execução
          </button>}
        </div>
        <div className="qa-guided-navigation">
          <button type="button" disabled={busy||position<=0}
            onClick={()=>move(-1)}><ArrowLeft size={16} aria-hidden="true"/> Anterior</button>
          <span aria-live="off">Cenário {position+1} de {items.length}</span>
          <button type="button" disabled={busy||position>=items.length-1}
            onClick={()=>move(1)}>Próximo <ArrowRight size={16} aria-hidden="true"/></button>
        </div>
      </article>}
    <ToastNotice message={error} tone="error"/>
    <ToastNotice message={announcement} tone="info"/>
    <p className="qa-guided-disclaimer"><ClipboardList size={14} aria-hidden="true"/>
      Os resultados só são registrados após confirmação do servidor. A situação da TF não muda automaticamente.</p>
  </section>;
}
