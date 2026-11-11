import "./context-preparation.css";
import {FileCheck2,ScanText,ShieldAlert} from "lucide-react";
import type {ContextPreparation} from "./context-preparation";

/** A separate, explicit review stage when the model cannot receive the full text. */
export function ContextPreparationPanel({items,acknowledged,onAcknowledge,disabled=false}:{
 items:{label:string;result:ContextPreparation;original:string}[];
 acknowledged:boolean;onAcknowledge:(value:boolean)=>void;disabled?:boolean
}) {
 const needsReview=items.some(item=>item.result.needsReview);
 if(!needsReview)return <p className="qa-context-inline-ready">
  <FileCheck2 size={16} aria-hidden="true"/> Contexto dentro dos limites de envio, sem omissões.
 </p>;
 return <section className="qa-context-optimizer" aria-label="Compactador de contexto">
  <div className="qa-context-optimizer-title">
   <ScanText size={20} aria-hidden="true"/>
   <div><strong>Leitura estrutural rápida concluída · com origem verificável</strong>
    <p>A varredura percorreu toda a TF, classificou informações por seções e priorizou trechos de
     problema, análise, correção, requisitos, testes e resultados. Trechos não escolhidos continuam
     preservados na fonte. Isso não substitui uma interpretação semântica por IA.</p>
   </div>
  </div>
  <div className="qa-context-optimizer-metrics">
   {items.map(({label,result})=><div key={label}>
    <strong>{label}</strong>
    <span>{result.originalChars.toLocaleString("pt-BR")} → {result.sentChars.toLocaleString("pt-BR")} caracteres</span>
    <small>{result.mode==="extrativo"
      ?result.omittedLines.toLocaleString("pt-BR")+" trechos omitidos · "+
       result.criticalOmissions.toLocaleString("pt-BR")+" potencialmente relevantes"
      :"Sem omissões"}
    </small>
   </div>)}
  </div>
  {items.some(item=>item.result.topics?.length)&&<div className="qa-context-topics" aria-label="Cobertura estrutural da leitura rápida">
    {items.flatMap(item=>(item.result.topics??[]).map(topic=>(
     <div key={item.label+topic.label}>
      <strong>{item.label} · {topic.label}</strong>
      <span>{topic.selected} de {topic.total} trechos selecionados</span>
     </div>
    )))}
   </div>}
  {items.some(item=>item.result.findings?.length)&&<div className="qa-context-findings"
    aria-label="Principais trechos identificados na análise local">
    <strong>Principais evidências da TF · leitura local</strong>
    <p>Frases extraídas literalmente da fonte, sem gerar conclusões não documentadas.</p>
    {items.flatMap(item=>(item.result.findings??[]).map(finding=>(
     <div key={item.label+finding.label} className="qa-context-finding">
      <span>{item.label} · {finding.label} · linha {finding.line}</span>
      <blockquote>{finding.excerpt}</blockquote>
     </div>
    )))}
   </div>}
  {items.filter(item=>item.result.needsReview).map(({label,result,original})=>
   <details className="qa-context-optimizer-review" key={label}>
    <summary>Conferir seleção de {label} enviada à IA</summary>
    <label className="field">Contexto preparado
     <textarea readOnly rows={9} value={result.text}/>
    </label>
    <details><summary>Comparar com a fonte completa preservada</summary>
     <textarea readOnly rows={6} aria-label={"Fonte original de "+label} value={original}/>
    </details>
   </details>)}
  <p className="qa-context-optimizer-warning"><ShieldAlert size={17} aria-hidden="true"/>
   A IA receberá apenas os trechos exibidos. Analise as omissões, especialmente quando houver
   regras ou cenários críticos. O documento original não é alterado.</p>
  <label className="qa-context-optimizer-consent">
   <input type="checkbox" checked={acknowledged} disabled={disabled}
    onChange={event=>onAcknowledge(event.target.checked)}/>
   Revisei o contexto compactado e concordo em gerar com cobertura parcial.
  </label>
 </section>;
}
