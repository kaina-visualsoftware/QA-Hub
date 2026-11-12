import {BookOpenCheck,CheckCircle2,FileSearch,LoaderCircle,PauseCircle,RefreshCcw,ShieldAlert} from "lucide-react";
import {useSemanticContext} from "./useSemanticContext";
import type {ConflictDecision,SemanticConflict} from "./semantic-conflicts";
import {useState} from "react";
import {AiQuotaWait} from "../../components/ui/AiQuotaWait";
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
   <div><strong>Preparação automática do texto extenso</strong>
    <p>O texto é dividido sem descartar trechos. Quando a NVIDIA estiver disponível,
     ela seleciona citações verificáveis; se falhar, o sistema continua com seleção
     literal no navegador, identificada como sem IA. Revise as decisões e a cobertura
     antes de gerar.</p></div>
  </div>
  {plan&&<p className="qa-semantic-muted">{plan.chunks.length} parte(s) identificada(s).
   Os trechos originais são preservados; a síntese final pode omitir informações
   que devem ser conferidas na matriz de cobertura.</p>}
  {semantic.planError&&<p className="notice error" role="alert">{semantic.planError}</p>}
  {semantic.enabled&&plan&&<div className="qa-semantic-work">
   <div className="qa-semantic-progress">
    <span>Partes preparadas <strong>{semantic.count} / {plan.chunks.length}</strong></span>
    <progress value={semantic.count} max={plan.chunks.length}
     aria-label="Blocos analisados"/>
    <small>Máximo de 15 chamadas NVIDIA/min. Quando o serviço falha, a seleção local segue sem novas chamadas; os trechos completos permanecem na TF, e o progresso fica preservado enquanto esta tela estiver aberta.</small>
   </div>
   {semantic.working&&<div className="qa-semantic-live" role="group" aria-label="Processamento da análise por blocos">
    <LoaderCircle className="qa-semantic-spinner" size={19} aria-hidden="true"/>
    <div>
     <strong role="status" aria-live="polite">Processando {semantic.activeChunk??"contexto"} · envio {semantic.attempt} neste lote</strong>
     <span>{semantic.activeStage==="local"?"Selecionando trechos literais localmente, sem IA":
      semantic.activeStage==="preparing"?"Validando sessão":
       semantic.activeStage==="sending"?"Preparando solicitação segura":
       semantic.activeStage==="waiting"?"Aguardando resposta da NVIDIA":
       semantic.activeStage==="verifying"?"Conferindo as citações com a fonte original":
       "Preparando próxima parte"}</span>
     <small aria-live="off">Tempo decorrido neste lote: {String(Math.floor(semantic.elapsed/60)).padStart(2,"0")}:{String(semantic.elapsed%60).padStart(2,"0")} ·
      {semantic.count} de {plan.chunks.length} partes concluídas</small>
    </div>
   </div>}
   <AiQuotaWait state={semantic.quotaWait} onCancel={semantic.cancel}/>
   <div className="qa-semantic-actions">
    {!semantic.complete&&<button type="button" disabled={disabled||semantic.working||!authorized}
     onClick={()=>void semantic.run(undefined,authorized)}>
     <BookOpenCheck size={17} aria-hidden="true"/>
     {semantic.count?"Retomar preparação do texto":"Preparar todo o texto"}
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
      {outcome?<span>{outcome.facts.length} citações literais · {outcome.method==="local"?"seleção local (sem IA)":outcome.model+" (IA)"} · {outcome.unverified} rejeitadas</span>:
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
      <span><strong>{digest.coverage.localChunks}</strong> partes selecionadas sem IA</span>
      <span><strong>{digest.coverage.unverifiedQuotes}</strong> citações rejeitadas</span>
      <span><strong>{digest.coverage.budgetOmissions}</strong> fatos fora do orçamento</span>
      <span><strong>{digest.coverage.missingIds.length}</strong> identificadores sem citação</span>
     </div>
     {digest.coverage.localChunks>0&&<p role="alert">
      Parte do contexto foi selecionada por regras locais, não interpretada pela NVIDIA.
      A seleção é parcial: confira especialmente requisitos revisados, contradições entre versões,
      resultados dos testes e trechos omitidos antes de aprovar.
     </p>}
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
A seleção por IA ou por regras locais pode deixar de encontrar informações importantes.
     A cobertura listada é a dos identificadores detectados no texto, não uma garantia de testes completos.
    </p>
    <label className="qa-semantic-consent">
     <input type="checkbox" checked={semantic.approved} disabled={disabled||semantic.working||
      digest.coverage.selectedFacts===0||!semantic.conflictsReviewed} onChange={e=>semantic.setApproved(e.target.checked)}/>
     Revisei a matriz de cobertura, incluindo seleções locais sem IA, e autorizo gerar usando somente as citações exibidas.
    </label>
   </div>}
  </div>}
 </section>;
}
