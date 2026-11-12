import {BookOpenCheck,CheckCircle2,FileSearch,LoaderCircle,PauseCircle,RefreshCcw,ShieldAlert} from "lucide-react";
import {useSemanticContext} from "./useSemanticContext";
import type {ConflictDecision,SemanticConflict} from "./semantic-conflicts";
import type {SemanticRequestStage} from "./semantic-service";
import {SEMANTIC_CONCURRENCY} from "./semantic-queue";
import {useState} from "react";
import {AiQuotaWait} from "../../components/ui/AiQuotaWait";
import "./semantic-preparation.css";

function stageLabel(stage:SemanticRequestStage|undefined){
 switch(stage){
  case "preparing":return "Validando sessão";
  case "sending":return "Preparando envio seguro";
  case "waiting":return "Aguardando a NVIDIA";
  case "cooldown":return "Recuperação NVIDIA após timeout";
  case "verifying":return "Conferindo citações na fonte";
  default:return "Preparando análise";
 }
}
type SemanticState=ReturnType<typeof useSemanticContext>;
export function SemanticPreparationPanel({semantic,authorized,disabled=false,onConflictDecision}:{
 semantic:SemanticState;authorized:boolean;disabled?:boolean;
 onConflictDecision?:(item:SemanticConflict,decision:ConflictDecision)=>Promise<void>;
}){
 const {plan,digest}=semantic;
 const [auditError,setAuditError]=useState("");
 return <section className="qa-semantic-panel" aria-label="Preparação semântica do contexto">
  <div className="qa-semantic-heading">
   <FileSearch size={20} aria-hidden="true"/>
   <div><strong>Análise automática do texto extenso</strong>
    <p>O conteúdo ultrapassa o limite de uma chamada. A IA lê todas as partes em sequência
     e identifica evidências verificáveis; você confere os resultados antes de gerar.
     Se a NVIDIA não responder, nenhuma extração local será feita e apenas os
     blocos concluídos pela IA serão mantidos.</p></div>
  </div>
  {plan&&<p className="qa-semantic-muted">{plan.chunks.length} parte(s) identificada(s).
   Os trechos originais são preservados; a síntese final pode omitir informações
   que devem ser conferidas na matriz de cobertura.</p>}
  {semantic.planError&&<p className="notice error" role="alert">{semantic.planError}</p>}
  {semantic.enabled&&plan&&<div className="qa-semantic-work">
   <div className="qa-semantic-progress">
    <span>Partes verificadas <strong>{semantic.count} / {plan.chunks.length}</strong></span>
    <progress value={semantic.count} max={plan.chunks.length}
     aria-label="Blocos analisados"/>
    <small>Até {SEMANTIC_CONCURRENCY} partes analisadas simultaneamente pela NVIDIA, respeitando
     a cota compartilhada de 15 chamadas/min no Supabase e o tempo de espera informado
     em respostas 429. Cada parte concluída é preservada nesta sessão e a análise pode ser
     interrompida ou retomada.</small>
   </div>
   {semantic.working&&<div className="qa-semantic-live" role="group" aria-label="Processamento da análise por blocos">
    <LoaderCircle className="qa-semantic-spinner" size={19} aria-hidden="true"/>
    <div>
     <strong role="status" aria-live="polite">
      Analisando até {SEMANTIC_CONCURRENCY} partes em paralelo · {semantic.attempt} partes iniciadas neste lote
     </strong>
     <div className="qa-semantic-active-parts" aria-label="Estado individual das partes em processamento">
      {semantic.activeChunks.map(chunkId=><span key={chunkId}>
       <strong>{chunkId}</strong> · {stageLabel(semantic.activeStages[chunkId])}
      </span>)}
     </div>
     <small aria-live="off">Tempo decorrido neste lote: {String(Math.floor(semantic.elapsed/60)).padStart(2,"0")}:{String(semantic.elapsed%60).padStart(2,"0")} ·
      {semantic.count} de {plan.chunks.length} partes concluídas</small>
    </div>
   </div>}
   <AiQuotaWait state={semantic.quotaWait} onCancel={semantic.cancel}/>
   <div className="qa-semantic-actions">
    {!semantic.complete&&<button type="button" disabled={disabled||semantic.working||!authorized}
     onClick={()=>void semantic.run(undefined,authorized)}>
     <BookOpenCheck size={17} aria-hidden="true"/>
     {semantic.count?"Retomar análise do texto":"Analisar todo o texto com IA"}
    </button>}
    {semantic.working&&<button type="button" onClick={semantic.cancel}>
     <PauseCircle size={16} aria-hidden="true"/> Interromper e manter progresso</button>}
   </div>
   {!authorized&&<p className="qa-semantic-muted">Marque a autorização de envio à NVIDIA antes de analisar.</p>}
   {semantic.message&&<p className="qa-semantic-muted" role="status">{semantic.message}</p>}
   {semantic.error&&<p className="notice error" role="alert">{semantic.error}</p>}
   <details className="qa-semantic-blocks" open={semantic.working||semantic.count===0?true:undefined}>
    <summary>Estado de cada parte ({semantic.count} de {plan.chunks.length} concluídas)</summary>
    <ol>{plan.chunks.map(chunk=>{
     const outcome=semantic.outcomes[chunk.id];
     return <li key={chunk.id}>
      <span><strong>{chunk.id}</strong> · Linhas {chunk.startLine}–{chunk.endLine}</span>
      {outcome?<span>{outcome.facts.length} citações verificadas · {outcome.unverified} rejeitadas</span>:
       semantic.activeStages[chunk.id]?<span className="qa-semantic-current"><LoaderCircle size={13} className="qa-semantic-spinner" aria-hidden="true"/> {stageLabel(semantic.activeStages[chunk.id])}</span>:
       <span>Aguardando análise</span>}
      {outcome&&<button type="button" disabled={disabled||semantic.working||!authorized}
       aria-label={"Reanalisar "+chunk.id} onClick={()=>void semantic.run(chunk.id,authorized)}>
       <RefreshCcw size={14} aria-hidden="true"/> Reanalisar</button>}
      {outcome&&!!outcome.facts.length&&<details>
       <summary>Ver trechos extraídos</summary>
       <ul>{outcome.facts.map((fact,i)=><li key={i}>
        <strong>{fact.category} · {fact.source}-L{fact.line}</strong>
        <blockquote>{fact.quote}</blockquote>
       </li>)}</ul>
      </details>}
     </li>;
    })}</ol>
   </details>
   {semantic.complete&&digest&&<div className="qa-semantic-review">
    <div className="qa-semantic-summary">
     <strong><CheckCircle2 size={17} aria-hidden="true"/> Matriz de cobertura do contexto</strong>
     <div className="qa-semantic-metrics">
      <span><strong>{digest.coverage.analyzedChunks}/{digest.coverage.totalChunks}</strong> fontes segmentadas</span>
      <span><strong>{digest.coverage.selectedFacts}</strong> citações utilizadas</span>
      <span><strong>{digest.coverage.unverifiedQuotes}</strong> citações rejeitadas</span>
      <span><strong>{digest.coverage.budgetOmissions}</strong> fatos fora do orçamento</span>
      <span><strong>{digest.coverage.missingIds.length}</strong> identificadores sem citação</span>
     </div>
     {digest.coverage.failedChunks>0&&<p role="alert">Alguns blocos não retornaram evidências utilizáveis:
      {digest.coverage.failedChunks} bloco(s). Revise os textos antes de gerar.</p>}
     {!!digest.coverage.missingIds.length&&<p role="alert">
      Identificadores ainda sem cobertura: {digest.coverage.missingIds.slice(0,40).join(", ")}
      {digest.coverage.missingIds.length>40?" (e outros)":""}.
     </p>}
    </div>
    {semantic.conflicts.length>0&&<section className="qa-semantic-conflicts"
      aria-label="Revisão de divergências entre fontes">
      <strong>Conflitos explícitos que precisam de decisão ({semantic.conflicts.length})</strong>
      <p>São exibidas apenas afirmações opostas sobre a mesma regra, campo ou condição.
        Descrições históricas, cenários condicionais diferentes e repetições não exigem
        revisão individual. As citações vêm da NVIDIA e são conferidas contra a TF;
        o QA continua responsável por resolver conflitos reais.</p>
      <ol>{semantic.conflicts.map((item,index)=><li key={item.id}>
        <strong>{index+1}. {item.reason}</strong>
        {(item.pairs?.length??1)>1&&<small>
         {item.pairs?.length} comparações equivalentes agrupadas nesta única decisão.
        </small>}
        <div className="qa-semantic-compare">
          <blockquote><small>Fonte A · {item.left.source}-L{item.left.line}</small>
            {item.left.quote}</blockquote>
          <blockquote><small>Fonte B · {item.right.source}-L{item.right.line}</small>
            {item.right.quote}</blockquote>
        </div>
        <label>Decisão do QA
          <select value={semantic.conflictDecisions[item.id]??"pending"}
            disabled={disabled||semantic.working}
            onChange={e=>{
             const choice=e.target.value as ConflictDecision;
             if(!onConflictDecision){semantic.setConflictDecision(item.id,choice);return;}
             setAuditError("");
             void onConflictDecision(item,choice).catch(err=>setAuditError(
               err instanceof Error?err.message:"Não foi possível registrar a decisão."));
            }}>
            <option value="pending">Pendente de revisão</option>
            <option value="keep_both">Manter ambas e sinalizar como não confirmado</option>
            <option value="prefer_left">Priorizar a fonte A neste contexto</option>
            <option value="prefer_right">Priorizar a fonte B neste contexto</option>
          </select>
        </label>
      </li>)}</ol>
      {auditError&&<p className="notice error" role="alert">{auditError}</p>}
      {!semantic.conflictsReviewed&&<p role="alert">
        Revise todas as divergências antes de liberar a geração com contexto semântico.
      </p>}
      {semantic.conflictsReviewed&&<p role="status">
        Divergências revisadas. A fonte original permanece intacta.
      </p>}
    </section>}
    <details><summary>Ver exatamente o contexto final que a IA receberá</summary>
     <label className="field">TF
      <textarea readOnly rows={8} value={digest.task}/></label>
     {!!digest.requirements&&<label className="field">Requisitos
      <textarea readOnly rows={5} value={digest.requirements}/></label>}
    </details>
    <p className="qa-semantic-caution"><ShieldAlert size={17} aria-hidden="true"/>
     A IA seleciona citações existentes, mas pode deixar de encontrar regras importantes.
     A cobertura listada é a dos identificadores detectados no texto, não uma garantia de testes completos.
    </p>
    <label className="qa-semantic-consent">
     <input type="checkbox" checked={semantic.approved} disabled={disabled||semantic.working||
      digest.coverage.selectedFacts===0||!semantic.conflictsReviewed} onChange={e=>semantic.setApproved(e.target.checked)}/>
     Revisei a matriz de cobertura e autorizo gerar usando somente os trechos verificados.
    </label>
   </div>}
  </div>}
 </section>;
}
