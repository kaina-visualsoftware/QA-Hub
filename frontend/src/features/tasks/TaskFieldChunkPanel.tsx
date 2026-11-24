import {CheckCircle2,Clock3,FileSearch,Layers3,LoaderCircle,PauseCircle,AlertCircle} from "lucide-react";
import {AiQuotaWait} from "../../components/ui/AiQuotaWait";
import type {AiWaitState} from "../../lib/ai-retry";
import type {TaskFieldChunk,TaskFieldChunkResult} from "./task-ai-chunks";
import "./task-field-chunk-panel.css";

export type ChunkProcessingStatus="processing"|"failed";

type Props={
 chunks:TaskFieldChunk[];
 results:Record<number,TaskFieldChunkResult>;
 statuses:Record<number,ChunkProcessingStatus>;
 running:boolean;
 quotaWait:AiWaitState|null;
 onCancel:()=>void;
};

/** Same visible, evidence-oriented processing list for short and long TFs.
 * This is a read-only view of the exact parts sent to NVIDIA, not a summary.
 */
export function TaskFieldChunkPanel({chunks,results,statuses,running,quotaWait,onCancel}:Props){
 if(!chunks.length)return null;
 const completed=chunks.filter(part=>Object.hasOwn(results,part.index)).length;
 const failed=chunks.filter(part=>!Object.hasOwn(results,part.index)&&statuses[part.index]==="failed").length;
 const pending=chunks.length-completed-failed;
 return <section className="qa-task-chunks" aria-label="Partes da tarefa para análise">
  <div className="qa-task-chunks-head">
   <div className="qa-task-chunks-symbol"><Layers3 size={19} aria-hidden="true"/></div>
   <div className="qa-task-chunks-title">
    <strong>Texto dividido em {chunks.length} {chunks.length===1?"parte":"partes"}</strong>
    <span>Confira os trechos que serão enviados à NVIDIA.</span>
   </div>
   <span className="qa-task-chunks-counter" role="status" aria-live="polite">
    {completed} / {chunks.length}
   </span>
  </div>
  <progress className="qa-task-chunks-progress" max={chunks.length} value={completed}
   aria-label="Partes verificadas pela NVIDIA"/>
  <div className="qa-task-chunks-meta">
   <span>{completed} concluída(s)</span>
   {failed>0&&<span className="qa-task-chunks-error">{failed} com falha</span>}
   {pending>0&&<span>{pending} em andamento ou pendente(s)</span>}
   {running&&<button type="button" className="qa-task-chunks-cancel" onClick={onCancel}>
    <PauseCircle size={14} aria-hidden="true"/> Interromper
   </button>}
  </div>
  <AiQuotaWait state={quotaWait} onCancel={onCancel}/>
  <div className="qa-task-chunks-scroll" role="group" aria-label="Estado individual de cada parte">
   {chunks.map(part=>{
    const result=results[part.index];
    const status=result?"complete":statuses[part.index]??"pending";
    const count=result?Object.keys(result.fields).filter(key=>
     Boolean(result.fields[key]?.trim())).length:0;
    const endLine=part.startLine+(part.text.match(/\n/g)?.length??0);
    return <details className={"qa-task-chunk qa-task-chunk--"+status} key={part.index}>
     <summary>
      <span className="qa-task-chunk-number">Parte {String(part.index+1).padStart(2,"0")}</span>
      <span className="qa-task-chunk-source">Linhas {part.startLine}–{endLine} · {part.text.length.toLocaleString("pt-BR")} caracteres</span>
      <span className="qa-task-chunk-status">
       {status==="complete"?<CheckCircle2 size={15} aria-hidden="true"/>:
        status==="processing"?<LoaderCircle className="qa-task-chunk-spin" size={15} aria-hidden="true"/>:
         status==="failed"?<AlertCircle size={15} aria-hidden="true"/>:
          <Clock3 size={15} aria-hidden="true"/>}
       {status==="complete"?(count?count+" campo(s) encontrado(s)":"Verificado · sem campos"):
        status==="processing"?"Analisando…":
         status==="failed"?"Falhou · pode retomar":"Aguardando"}
      </span>
     </summary>
     <div className="qa-task-chunk-detail">
      <div><FileSearch size={14} aria-hidden="true"/> Trecho original enviado à NVIDIA</div>
      <pre>{part.text}</pre>
      {result&&<small>{result.review.length} evidência(s) registrada(s) nesta parte.</small>}
     </div>
    </details>;
   })}
  </div>
  <p className="qa-task-chunks-footnote">
   Todas as partes são preservadas; até duas são analisadas ao mesmo tempo.
   Partes com falha podem ser retomadas sem repetir as concluídas.
  </p>
 </section>;
}
