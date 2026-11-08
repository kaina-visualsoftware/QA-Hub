import {useMemo,useState} from "react";
import {Button} from "@heroui/react";
import {useInfiniteQuery,useQuery} from "@tanstack/react-query";
import {ArrowLeftRight,Clock3} from "lucide-react";
import type {Scenario,Task} from "../../lib/contracts";
import {scenarioStatusLabels} from "../../lib/contracts";
import {compareTextLines} from "../../lib/legacy/qa-release-core.mjs";
import {
  changedFields,HISTORY_SIZE,historyPage,listTaskChanges
} from "./execution-history-data";

function when(date:string){
  return new Date(date).toLocaleString("pt-BR");
}

export default function ExecutionHistoryPanel({task,scenarios,userId}:{
  task:Task;scenarios:Scenario[];userId:string;
}){
  const [scenarioId,setScenarioId]=useState("");
  const [oldId,setOldId]=useState("");
  const [newId,setNewId]=useState("");
  const [showChanges,setShowChanges]=useState(false);
  const executions=useInfiniteQuery({
    queryKey:["execution-history",userId,task.id,scenarioId],
    initialPageParam:0,
    queryFn:({pageParam})=>historyPage(task.id,scenarioId,pageParam),
    getNextPageParam:(last,all)=>last.length===HISTORY_SIZE?all.length:undefined,
    staleTime:20000
  });
  const taskChanges=useQuery({
    queryKey:["task-change-history",userId,task.id],
    queryFn:()=>listTaskChanges(task.id),
    enabled:showChanges,
    staleTime:30000
  });
  const rows=useMemo(()=>executions.data?.pages.flat()??[],[executions.data]);
  const selectedScenario=scenarioId||rows[0]?.cenario_id||"";
  const comparables=rows.filter(row=>row.cenario_id===selectedScenario);
  const newer=comparables.find(row=>row.id===newId)??comparables[0];
  const older=comparables.find(row=>row.id===oldId)??comparables[1];
  const diff=useMemo(()=>{
    if(!newer||!older||newer.id===older.id)return null;
    if(new Date(newer.created_at)<new Date(older.created_at))return null;
    return compareTextLines(older.obtido_novo,newer.obtido_novo);
  },[older,newer]);

  return <div className="qa-history" aria-label="Histórico de execuções">
    <p className="text-muted text-sm">Resultados e alterações gravados no banco.
      Registros anteriores à F4 aparecem somente como estado inicial, sem
      reconstruir execuções que não foram registradas.</p>
    <div className="qa-history-controls">
      <label className="field">Cenário
        <select value={scenarioId} onChange={e=>{
          setScenarioId(e.target.value);setOldId("");setNewId("");
        }}>
          <option value="">Todos os cenários</option>
          {scenarios.map(s=><option key={s.id} value={s.id}>{s.titulo}</option>)}
        </select>
      </label>
      <Button variant="secondary" onPress={()=>setShowChanges(value=>!value)}>
        <Clock3 size={16}/> {showChanges?"Ocultar alterações da TF":"Alterações da TF"}
      </Button>
    </div>
    {showChanges&&<section className="qa-history-task-changes" aria-label="Alterações de dados da TF">
      <h3>Dados alterados</h3>
      {taskChanges.isPending&&<p role="status">Consultando alterações…</p>}
      {taskChanges.isError&&<p role="alert" className="notice error">
        {taskChanges.error.message}</p>}
      {taskChanges.data?.length===0&&<p className="text-muted text-sm">
        Nenhuma alteração dos campos de identificação foi registrada desde a F4.</p>}
      {taskChanges.data?.map(event=><article key={event.id} className="qa-history-change">
        <small>{when(event.created_at)}</small>
        {changedFields(event.anterior,event.atual).map(change=>
          <p key={change.field}><strong>{change.field}:</strong>{" "}
            <span>{change.old||"—"}</span> → <span>{change.next||"—"}</span></p>)}
      </article>)}
    </section>}
    <div className="qa-history-list">
      <h3>Registros de execução</h3>
      {executions.isPending&&<p role="status">Carregando histórico…</p>}
      {executions.isError&&<p role="alert" className="notice error">
        {executions.error.message}</p>}
      {executions.isSuccess&&rows.length===0&&<p className="text-muted text-sm">
        Nenhum registro disponível nesta seleção.</p>}
      {rows.map(row=><article key={row.id} className="qa-history-event">
        <span className="qa-history-event-date">{when(row.created_at)}</span>
        <strong>{scenarios.find(item=>item.id===row.cenario_id)?.titulo||"Cenário"}</strong>
        <span className="qa-history-event-status">
          {row.origem==="base"?"Estado inicial: ":"Alteração: "}
          {row.origem==="alteracao"&&row.status_anterior
            ?scenarioStatusLabels[row.status_anterior]+" → ":""}
          {scenarioStatusLabels[row.status_novo]}
        </span>
        {row.origem==="alteracao"&&row.obtido_anterior!==row.obtido_novo&&
          <small>Resultado observado atualizado</small>}
      </article>)}
      {executions.hasNextPage&&<Button variant="secondary"
        isDisabled={executions.isFetchingNextPage}
        onPress={()=>void executions.fetchNextPage()}>
        {executions.isFetchingNextPage?"Carregando…":"Mostrar mais registros"}
      </Button>}
    </div>
    {comparables.length>=2&&<section className="qa-history-compare"
      aria-label="Comparar duas execuções">
      <h3><ArrowLeftRight size={17}/> Comparar execuções</h3>
      <p className="text-muted text-sm">Selecione duas versões do mesmo cenário.
        A comparação é feita localmente, sem criar outra execução.</p>
      <div className="qa-history-compare-selects">
        <label className="field">Versão anterior
          <select value={older?.id??""} onChange={e=>setOldId(e.target.value)}>
            {comparables.map(row=><option value={row.id} key={row.id}>
              {when(row.created_at)} · {scenarioStatusLabels[row.status_novo]}
            </option>)}
          </select>
        </label>
        <label className="field">Versão posterior
          <select value={newer?.id??""} onChange={e=>setNewId(e.target.value)}>
            {comparables.map(row=><option value={row.id} key={row.id}>
              {when(row.created_at)} · {scenarioStatusLabels[row.status_novo]}
            </option>)}
          </select>
        </label>
      </div>
      {older&&newer&&<p className="qa-history-transition">
        {scenarioStatusLabels[older.status_novo]} → {scenarioStatusLabels[newer.status_novo]}
      </p>}
      {diff&&<div className="compare-result" role="region"
        aria-label="Diferenças entre os resultados observados">
        {diff.changes.length===0&&<p>Os textos observados são iguais.</p>}
        {diff.changes.slice(0,120).map(([prefix,line],i)=>
          <div key={i} className={"compare-line "+(
            prefix==="+"?"added":prefix==="-"?"removed":"equal"
          )}>
            <span className="compare-prefix" aria-hidden="true">{prefix}</span>
            <span className="compare-value">{line||"\u00a0"}</span>
          </div>)}
        {diff.changes.length>120&&<p className="text-muted text-sm">
          Mostrando 120 de {diff.changes.length} linhas de diferença.</p>}
      </div>}
      {older&&newer&&!diff&&<p className="notice error">
        Selecione versões distintas e ordenadas do mesmo cenário.</p>}
    </section>}
  </div>;
}
