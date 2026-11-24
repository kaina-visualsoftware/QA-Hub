import {CheckCircle2,AlertCircle,Clock3,Layers3,LoaderCircle} from "lucide-react";
import type {CasePlan} from "./case-source-plan";
import type {CasePartsCheckpoint,CasePartProgress} from "./case-chunk-generation";
import "./case-source-status.css";

export function CaseSourceStatus({plan,progress,checkpoint,processing=false}:{
 plan:CasePlan;progress:CasePartProgress|null;
 checkpoint:CasePartsCheckpoint|null;processing?:boolean
}){
 const complete=progress?.complete??0;
 const failed=progress?.failed??0;
 return <section className="qa-case-source-status" aria-label="Partes da TF para gerar cenários">
  <header className="qa-case-source-head">
   <Layers3 size={19} aria-hidden="true"/>
   <div><strong>Contexto completo · {plan.parts.length} partes</strong>
    <small>{plan.sourceCount} fontes · {plan.chars.toLocaleString("pt-BR")} caracteres</small>
   </div>
   <b role="status" aria-live="polite">{complete}/{plan.parts.length}</b>
  </header>
  <progress max={plan.parts.length} value={complete}
   aria-label="Partes da TF analisadas para geração de cenários"/>
  <div className="qa-case-source-metrics">
   <span>{complete} verificadas</span>
   {processing&&<span>Analisando até 2 partes por vez</span>}
   {failed>0&&<span className="qa-case-source-failed">{failed} pendente(s) de retomada</span>}
  </div>
  <div className="qa-case-source-list" role="group" aria-label="Fontes e status por parte">
   {plan.parts.map((part,index)=>{
    const status=progress?.status[part.id]??"pending";
    const failure=checkpoint?.failures[part.id];
    const count=checkpoint?.complete[part.id]?.cases.length??0;
    return <details className={"qa-case-source-item qa-case-source-"+status} key={part.id}>
     <summary>
      {status==="complete"?<CheckCircle2 size={15} aria-hidden="true"/>:
       status==="failed"?<AlertCircle size={15} aria-hidden="true"/>:
       status==="processing"?<LoaderCircle size={15} className="qa-ai-spinner" aria-hidden="true"/>:
       <Clock3 size={15} aria-hidden="true"/>}
      <span className="qa-case-source-label">Parte {index+1} · {part.label}</span>
      <small>{status==="complete"?(count?count+" caso(s)":"Sem novos casos"):
       status==="processing"?"Analisando…":status==="failed"?"Falhou":"Pendente"}</small>
     </summary>
     <div className="qa-case-source-detail">
      <p>Trecho {part.index+1}/{part.total} · linha {part.line} · {part.text.length.toLocaleString("pt-BR")} caracteres</p>
      {failure&&<p role="status" className="qa-case-source-error">{failure}</p>}
      <pre>{part.text}</pre>
     </div>
    </details>;
   })}
  </div>
  {!!plan.warnings.length&&<details className="qa-case-source-warnings">
   <summary>{plan.warnings.length} aviso(s) de leitura de anexos</summary>
   <ul>{plan.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>
  </details>}
 </section>;
}
