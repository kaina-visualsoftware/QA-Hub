import {ShieldCheck} from "lucide-react";
import type {FieldReview,ScenarioReview} from "./task-evidence";
import {EVIDENCE_REASONS} from "./task-evidence";
import "./task-evidence-review.css";

/** Citations from the *submitted* context, not claimed proof of every paraphrase. */
export function TaskFieldEvidenceReview({fields,confirmed,onConfirm,onApply,disabled}:{
 fields:FieldReview[];
 confirmed:Record<string,boolean>;
 onConfirm:(field:string,value:boolean)=>void;
 onApply:(field:string,value:string)=>void;
 disabled:boolean;
}){
 if(!fields.length)return null;
 const verified=fields.filter(x=>x.status==="verified").length;
 return <section className="qa-task-evidence" aria-label="Proveniência dos campos da IA">
  <div className="qa-task-evidence-head" role="status">
   <ShieldCheck size={17} aria-hidden="true"/>
   <div>
    <strong>Evidências da extração</strong>
    <p>{verified} campo(s) com trecho localizado · {fields.length-verified} proposta(s) para revisão.
     A IA pode sintetizar informações implícitas na TF. Uma citação localizada não comprova sozinha a interpretação; confira os valores.</p>
   </div>
  </div>
  <details>
   <summary>Conferir citações, linhas e propostas não aplicadas</summary>
   <div className="qa-task-evidence-list">
    {fields.map(row=><article key={row.field} className="qa-task-evidence-item">
     <strong>{row.field.replaceAll("_"," ")}</strong>
     <span>{row.derivation==="synthesized"?"Síntese da IA":"Informação literal"} ·
      {row.status==="verified"?" trecho localizado":" revisão necessária"}
      {row.sourceLine!==null?" · Linha "+row.sourceLine+" do contexto enviado":""}</span>
     {row.status==="needs_review"&&<p>
      {EVIDENCE_REASONS[row.reason??""]??"Trecho ou afirmação sem comprovação suficiente."}
      {" "}Este valor não foi aplicado automaticamente.
     </p>}
     <p className="qa-task-evidence-value">{row.value}</p>
     {row.quote&&<blockquote>{row.quote}</blockquote>}
     {row.status==="needs_review"&&<div className="qa-task-evidence-actions">
      <label><input type="checkbox" checked={Boolean(confirmed[row.field])}
       disabled={disabled} onChange={event=>onConfirm(row.field,event.target.checked)}/>
       Conferi o valor com o relatório original</label>
      <button type="button" disabled={disabled||!confirmed[row.field]||
       (row.field==="tipo_teste"&&!["BUILD","RELEASE"].includes(row.value))}
       onClick={()=>onApply(row.field,row.value)}>Aplicar manualmente</button>
     </div>}
    </article>)}
   </div>
  </details>
 </section>;
}

export function TaskScenarioEvidenceReview({rows}:{
 rows:ScenarioReview[];
}){
 if(!rows.length)return null;
 const verified=rows.filter(x=>x.status==="verified").length;
 return <section className="qa-task-evidence" aria-label="Proveniência dos cenários da IA">
  <div className="qa-task-evidence-head">
   <ShieldCheck size={17} aria-hidden="true"/>
   <div>
    <strong>Referências dos cenários</strong>
    <p>{verified} citação(ões) verificadas · {rows.length-verified} pendência(s).
     Casos não verificados pela IA permanecem na versão local e exigem seleção manual.</p>
   </div>
  </div>
  <details><summary>Conferir origem dos cenários</summary>
   <div className="qa-task-evidence-list">
    {rows.map(row=><article key={row.sourceIndex} className="qa-task-evidence-item">
     <strong>{row.title}</strong>
     <span>{row.status==="verified"?"Trecho localizado":"Revisão necessária"}
      {row.sourceLine!==null?" · Linha "+row.sourceLine+" do contexto enviado":""}</span>
     {row.status==="needs_review"&&<p>
      {EVIDENCE_REASONS[row.reason??""]??"A IA não comprovou todos os elementos deste cenário."}
     </p>}
     {row.quote&&<blockquote>{row.quote}</blockquote>}
    </article>)}
   </div>
  </details>
 </section>;
}
