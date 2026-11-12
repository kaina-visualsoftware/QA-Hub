import {useMemo,useState} from "react";
import {Activity,FileJson2,ShieldCheck,UploadCloud} from "lucide-react";
import {aiMetricWarnings,groupAiAttempts,MAX_AI_LOG_FILE_BYTES,
 parseAiLogExport,summarizeAiAttempts} from "./ai-metrics";
import type {AiLogImport} from "./ai-metrics";
import "./ai-monitoring.css";

export default function AiMonitoringPanel(){
 const [report,setReport]=useState<AiLogImport|null>(null);
 const [error,setError]=useState("");
 const [mode,setMode]=useState("all");
 const [filename,setFilename]=useState("");
 const modes=useMemo(()=>[...new Set((report?.attempts??[]).map(row=>row.mode))].sort(),[report]);
 const subset=useMemo(()=>(report?.attempts??[]).filter(row=>mode==="all"||row.mode===mode),
  [report,mode]);
 const summary=useMemo(()=>summarizeAiAttempts(subset),[subset]);
 const groups=useMemo(()=>groupAiAttempts(subset),[subset]);
 const reset=()=>{setReport(null);setFilename("");setMode("all");setError("");};
 async function upload(file:File|undefined){
  reset();
  if(!file)return;
  if(file.size>MAX_AI_LOG_FILE_BYTES){
   setError("Arquivo maior que 2 MB. Exporte uma janela menor de registros.");
   return;
  }
  try{
   const parsed=parseAiLogExport(await file.text());
   if(!parsed.attempts.length){
    setError("Nenhum evento qa_ai_attempt v1 válido encontrado. Exporte somente metadados JSON.");
    return;
   }
   setReport(parsed);setFilename(file.name);
  }catch(reason){
   setError(reason instanceof Error?reason.message:"Falha ao interpretar o arquivo.");
  }
 }
 return <section className="qa-ai-monitoring panel" aria-labelledby="ai-f8-monitoring">
  <header className="qa-ai-monitoring-header">
   <div>
    <p className="eyebrow">OBSERVABILIDADE DA IA · F8</p>
    <h2 id="ai-f8-monitoring"><Activity size={19} aria-hidden="true"/> Diagnóstico do provedor</h2>
    <p>Analise uma exportação de eventos <code>qa_ai_attempt</code> do Supabase.
     A análise é local neste navegador, sem enviar o arquivo à aplicação.
     <strong> Não são métricas em tempo real.</strong></p>
   </div>
   <ShieldCheck size={24} aria-hidden="true"/>
  </header>
  <div className="qa-ai-monitoring-controls">
   <label className="qa-ai-monitoring-upload">
    <UploadCloud size={18} aria-hidden="true"/>
    <span>Importar JSON ou JSONL sanitizado (até 2 MB)</span>
    <input type="file" accept=".json,.jsonl,.ndjson,application/json"
      aria-label="Arquivo JSON ou JSONL de eventos da IA"
      onChange={event=>{const file=event.currentTarget.files?.[0];
       void upload(file);event.currentTarget.value="";}}/>
   </label>
   {report&&<button type="button" className="qa-ai-monitoring-clear"
     onClick={reset}>Limpar dados</button>}
  </div>
  {error&&<p role="alert" className="notice error">{error}</p>}
  {!report&&!error&&<div className="qa-ai-monitoring-empty">
   <FileJson2 size={23} aria-hidden="true"/>
   <p>Importe uma exportação de logs para calcular taxa de sucesso, latência,
    uso de fallback, bloqueios de cota e truncamentos. Nenhum dado é carregado automaticamente.</p>
  </div>}
  {report&&<>
   <div className="qa-ai-monitoring-source" role="status">
    <span>{filename}</span>
    <span>{report.attempts.length} eventos válidos · {report.ignored} ignorados</span>
   </div>
   <label className="field qa-ai-monitoring-filter">Modo de IA
    <select value={mode} onChange={event=>setMode(event.target.value)}>
     <option value="all">Todos os modos</option>
     {modes.map(item=><option key={item} value={item}>{item}</option>)}
    </select>
   </label>
   <div className="qa-ai-monitoring-stats" aria-label="Resumo das tentativas importadas">
    <div><span>Sucesso por tentativa</span>
     <strong>{summary.successPercent===null?"—":summary.successPercent+"%"}</strong>
     <small>{summary.providerSuccess}/{summary.providerAttempts} chamadas do provedor</small></div>
    <div><span>P95 de latência</span>
     <strong>{summary.p95Ms===null?"—":(summary.p95Ms/1000).toFixed(1)+" s"}</strong>
     <small>Não é tempo completo de geração em lotes</small></div>
    <div><span>Cota negada</span><strong>{summary.quotaDenied}</strong>
     <small>Bloqueios na RPC compartilhada</small></div>
    <div><span>Fallback / truncamento</span>
     <strong>{summary.fallbackAttempts} / {summary.truncated}</strong>
     <small>Tentativas por outro modelo / respostas cortadas</small></div>
   </div>
   {aiMetricWarnings(summary).map(text=><p className="qa-ai-monitoring-warning"
     role="status" key={text}>{text}</p>)}
   <div className="qa-ai-monitoring-table-wrap">
    <table className="qa-ai-monitoring-table">
     <caption>Resultados agrupados por modo e modelo, somente das tentativas importadas</caption>
     <thead><tr><th scope="col">Modo · modelo</th><th scope="col">Tentativas</th>
      <th scope="col">Sucesso</th><th scope="col">P95</th><th scope="col">Timeouts</th></tr></thead>
     <tbody>{groups.map(group=><tr key={group.key}>
      <th scope="row">{group.key}</th>
      <td>{group.summary.providerAttempts}</td>
      <td>{group.summary.successPercent===null?"—":group.summary.successPercent+"%"}</td>
      <td>{group.summary.p95Ms===null?"—":(group.summary.p95Ms/1000).toFixed(1)+" s"}</td>
      <td>{group.summary.timeouts}</td>
     </tr>)}</tbody>
    </table>
   </div>
   <p className="qa-ai-monitoring-footnote">
    Indicadores calculados exclusivamente dos eventos importados, não de usuários, TFs ou textos.
    HTTP 200 em SSE não garante geração completa; faltas de eventos também afetam a amostra.
    O relatório CI de casos sintéticos é separado destes dados operacionais.
   </p>
  </>}
 </section>;
}
