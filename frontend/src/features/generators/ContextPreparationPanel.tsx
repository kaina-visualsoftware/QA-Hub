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
   <div><strong>Etapa anterior à IA · compactador de contexto</strong>
    <p>Uma seleção extrativa local reduz repetições e prioriza regras, cenários, números e resultados.
     Não é um resumo criado pela NVIDIA e não garante cobertura total.</p>
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
