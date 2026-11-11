import {BookOpenCheck,CheckCircle2,FileSearch,LoaderCircle,PauseCircle,RefreshCcw,ShieldAlert} from "lucide-react";
import {useSemanticContext} from "./useSemanticContext";
import type {ConflictDecision,SemanticConflict} from "./semantic-conflicts";
import {useState} from "react";
import "./semantic-preparation.css";

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
   <div><strong>Como preparar o contexto extenso?</strong>
    <p>Escolha a seleção rápida ou uma análise por blocos, com trechos de origem verificáveis.</p></div>
  </div>
  <div className="qa-semantic-strategies" role="radiogroup" aria-label="Método de compactação">
   <label><input type="radio" name="qa-semantic-mode" value="fast"
    checked={!semantic.enabled} disabled={disabled||semantic.working}
    onChange={()=>semantic.setEnabled(false)}/>
    <span><strong>Rápido</strong><small>Leitura estrutural local: identifica problema, causas, correções, regras e testes, com origem verificável. Não interpreta tudo como uma IA.</small></span>
   </label>
   <label><input type="radio" name="qa-semantic-mode" value="semantic"
    checked={semantic.enabled} disabled={disabled||semantic.working||!plan}
    onChange={()=>semantic.setEnabled(true)}/>
    <span><strong>Semântico por blocos</strong>
     <small>{plan?plan.chunks.length+" chamadas previstas (podem ocorrer tentativas adicionais)":
       "Fonte indisponível para divisão."} Preserva rastreabilidade.</small>
    </span>
   </label>
  </div>
  {semantic.planError&&<p className="notice error" role="alert">{semantic.planError}</p>}
  {semantic.enabled&&plan&&<div className="qa-semantic-work">
   <div className="qa-semantic-progress">
    <span>Partes verificadas <strong>{semantic.count} / {plan.chunks.length}</strong></span>
    <progress value={semantic.count} max={plan.chunks.length}
     aria-label="Blocos analisados"/>
    <small>Até 8 blocos por lote. Cada tentativa utiliza a cota compartilhada de 15 chamadas/min.
     Se atingir o limite, o progresso já concluído fica disponível para retomada.</small>
   </div>
   {semantic.working&&<div className="qa-semantic-live" role="group" aria-label="Processamento da análise por blocos">
    <LoaderCircle className="qa-semantic-spinner" size={19} aria-hidden="true"/>
    <div>
     <strong role="status" aria-live="polite">Processando {semantic.activeChunk??"contexto"} · envio {semantic.attempt} neste lote</strong>
     <span>{semantic.activeStage==="preparing"?"Validando sessão":
       semantic.activeStage==="sending"?"Preparando solicitação segura":
       semantic.activeStage==="waiting"?"Aguardando resposta da NVIDIA":
       semantic.activeStage==="verifying"?"Conferindo as citações com a fonte original":
       "Preparando próxima parte"}</span>
     <small aria-live="off">Tempo decorrido neste lote: {String(Math.floor(semantic.elapsed/60)).padStart(2,"0")}:{String(semantic.elapsed%60).padStart(2,"0")} ·
      {semantic.count} de {plan.chunks.length} partes concluídas</small>
    </div>
   </div>}
   <div className="qa-semantic-actions">
    {!semantic.complete&&<button type="button" disabled={disabled||semantic.working||!authorized}
     onClick={()=>void semantic.run(undefined,authorized)}>
     <BookOpenCheck size={17} aria-hidden="true"/>
     {semantic.count?"Continuar análise por blocos":"Analisar blocos com IA"}
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
       semantic.activeChunk===chunk.id?<span className="qa-semantic-current"><LoaderCircle size={13} className="qa-semantic-spinner" aria-hidden="true"/> Em análise</span>:
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
      <strong>Possíveis divergências entre fontes ({semantic.conflicts.length})</strong>
      <p>Comparações automáticas podem gerar falsos positivos: mudanças de versão ou
        de momento não são necessariamente contradições. Revise os dois trechos antes de decidir.
        A IA não decide qual fonte é verdadeira.</p>
      <ol>{semantic.conflicts.map((item,index)=><li key={item.id}>
        <strong>{index+1}. {item.reason}</strong>
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
