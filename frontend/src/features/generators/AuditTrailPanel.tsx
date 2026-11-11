import {useEffect,useState} from "react";
import {ClipboardCheck,History,RefreshCcw,ShieldCheck} from "lucide-react";
import {compareSourceVersions,readAuditTrail,snapshotSources} from "./ai-audit";
import type {ApprovedSource,AuditEvent} from "./ai-audit";
import "./ai-f32.css";

type Comparison=Awaited<ReturnType<typeof compareSourceVersions>>;
const labels={
 source_snapshot:"Versão da fonte registrada",
 conflict_decision:"Divergência revisada",
 post_revision_applied:"Trecho do post aprovado",
 test_revision_applied:"Caso revisado aprovado",
 coverage_generation_prepared:"Casos incrementais preparados"
};
export function AuditTrailPanel({taskId,userId,taskText,approved,onChangedCodes}:{
 taskId:string;userId:string;taskText:string;approved:ApprovedSource[];
 onChangedCodes:(codes:string[])=>void
}){
 const [rows,setRows]=useState<AuditEvent[]>([]);
 const [comparison,setComparison]=useState<Comparison>([]);
 const [loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [hasMore,setHasMore]=useState(false);
 useEffect(()=>{
  setRows([]);setComparison([]);setLoaded(false);setError("");setMessage("");
  onChangedCodes([]);
 },[taskId,userId]);
 async function refresh(){
  setBusy(true);setError("");setMessage("");
  try{
   const response=await readAuditTrail(taskId,userId);
   const states=await compareSourceVersions(taskId,taskText,approved,response.rows);
   setRows(response.rows);setComparison(states);setHasMore(response.hasMore);setLoaded(true);
   onChangedCodes(states.filter(s=>s.state==="changed"&&s.code!=="Contexto da TF")
     .map(s=>s.code));
  }catch(reason){setError(reason instanceof Error?reason.message:"Auditoria indisponível.");}
  finally{setBusy(false);}
 }
 async function snapshot(){
  if(!window.confirm("Registrar a versão atual da TF e dos requisitos aprovados? Somente hashes serão gravados."))return;
  setBusy(true);setError("");setMessage("");
  try{
   const count=await snapshotSources(taskId,userId,taskText,approved);
   const response=await readAuditTrail(taskId,userId);
   const states=await compareSourceVersions(taskId,taskText,approved,response.rows);
   setRows(response.rows);setComparison(states);setHasMore(response.hasMore);setLoaded(true);
   onChangedCodes([]);
   setMessage(count+" impressão(ões) SHA-256 registrada(s). Nenhum texto original foi enviado ao histórico.");
  }catch(reason){setError(reason instanceof Error?reason.message:"Erro no registro da versão.");}
  finally{setBusy(false);}
 }
 return <details className="qa-f32-audit" aria-label="Auditoria e histórico de versões da IA">
  <summary><History size={17} aria-hidden="true"/> Auditoria e histórico de versões</summary>
  <div className="qa-f32-audit-body">
   <p>Compare o estado atual da TF e dos requisitos aprovados com as versões registradas.
    O histórico é privado e imutável, armazenando somente hashes e decisões — nunca textos da TF,
    imagens, SQL ou respostas completas da IA.</p>
   <div className="qa-f32-audit-actions">
    <button type="button" disabled={busy} onClick={()=>void refresh()}>
     <RefreshCcw size={16} aria-hidden="true"/> Carregar histórico e comparar versões</button>
    <button type="button" disabled={busy} onClick={()=>void snapshot()}>
     <ClipboardCheck size={16} aria-hidden="true"/> Registrar versão atual</button>
   </div>
   {error&&<p className="notice error" role="alert">{error}</p>}
   {message&&<p role="status">{message}</p>}
   {loaded&&<div className="qa-f32-audit-results">
    <strong>Comparação com a última versão registrada</strong>
    {comparison.length===0?<p>Não há fontes para comparar.</p>:
     <ul>{comparison.map(item=><li key={item.code}>
      <span>{item.code}</span>
      <strong>{item.state==="changed"?"Alterado desde o registro":
       item.state==="same"?"Sem alteração identificada":"Sem registro anterior"}</strong>
      {item.date&&<small>Referência: {new Date(item.date).toLocaleString("pt-BR")}</small>}
     </li>)}</ul>}
    <strong><ShieldCheck size={16} aria-hidden="true"/> Últimos eventos registrados</strong>
    {hasMore&&<p>Mais de 300 eventos disponíveis. Esta consulta apresenta os 300 mais recentes.</p>}
    {!rows.length?<p>Nenhum evento registrado para esta TF.</p>:
      <ol>{rows.slice(0,35).map(event=><li key={event.id}>
       <span>{labels[event.event_type]??event.event_type}</span>
       <small>{event.requirement_code??event.resource} · {new Date(event.created_at).toLocaleString("pt-BR")}</small>
       {event.decision&&<small>Decisão: {event.decision==="keep_both"?"Manter ambas":
        event.decision==="prefer_left"?"Priorizar fonte A":"Priorizar fonte B"}</small>}
      </li>)}</ol>}
   </div>}
  </div>
 </details>;
}
