import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {ArchiveRestore,FileClock,FileText} from "lucide-react";
import {listTrash,restoreScenario,restoreTask,trashDate} from "./trash-data";
import "./trash.css";

type RestoreInput={kind:"task"|"scenario";id:string;taskId:string};

export default function TrashPanel({userId}:{userId:string}){
  const client=useQueryClient();
  const [message,setMessage]=useState("");
  const trash=useQuery({
    queryKey:["qa-trash",userId],queryFn:listTrash,
    enabled:!!userId,staleTime:10000
  });
  const restore=useMutation({
    mutationFn:({kind,id,taskId}:RestoreInput)=>kind==="task"
      ?restoreTask(taskId):restoreScenario(taskId,id),
    onSuccess:async (_result,input)=>{
      setMessage(input.kind==="task"?
        "TF restaurada como privada. Você pode encontrá-la novamente na lista.":
        "Cenário restaurado. A execução anterior foi preservada.");
      await Promise.all([
        client.invalidateQueries({queryKey:["qa-trash",userId]}),
        client.invalidateQueries({queryKey:["task-search",userId]}),
        client.invalidateQueries({queryKey:["task-stats",userId]}),
        client.invalidateQueries({queryKey:["tasks",userId]}),
        client.invalidateQueries({queryKey:["task",userId]}),
        client.invalidateQueries({queryKey:["scenarios",userId]}),
        client.invalidateQueries({queryKey:["task-progress",userId]}),
        client.invalidateQueries({queryKey:["qa-insights",userId]}),
        client.invalidateQueries({queryKey:["public-tasks"]})
      ]);
    }
  });

  function confirmRestore(input:RestoreInput){
    if(restore.isPending)return;
    const explanation=input.kind==="task"
      ?"Restaurar esta TF? Ela continuará privada e não será republicada automaticamente."
      :"Restaurar este cenário à TF original, mantendo seus resultados anteriores?";
    if(window.confirm(explanation)){
      setMessage("");restore.mutate(input);
    }
  }

  const entries=trash.data;
  return <div className="qa-f7-trash" aria-label="Lixeira recuperável">
    <p className="text-muted text-sm">TFs e cenários arquivados não entram na busca,
      nos indicadores nem na execução. A restauração mantém os mesmos IDs e
      registros históricos. Uma TF restaurada permanece privada.</p>
    {trash.isPending&&<p role="status" className="notice">Consultando lixeira…</p>}
    {trash.isError&&<div role="alert" className="notice error">
      {trash.error.message}
      <Button size="sm" variant="secondary" onPress={()=>void trash.refetch()}>
        Tentar novamente
      </Button>
    </div>}
    {message&&<p role="status" className="notice">{message}</p>}
    {restore.isError&&<p role="alert" className="notice error">
      Falha na restauração: {restore.error.message}
    </p>}
    {entries&&<>
      <section className="qa-f7-trash-group" aria-label="TFs arquivadas">
        <div className="qa-f7-trash-heading">
          <h3><FileText size={18} aria-hidden="true"/> TFs arquivadas</h3>
          <span className="count-pill">{entries.tasks.length}</span>
        </div>
        {entries.tasks.length===0&&<p className="text-muted text-sm">
          Nenhuma TF arquivada.</p>}
        {entries.tasks.map(task=><article className="qa-f7-trash-entry" key={task.id}>
          <div>
            <strong>{task.titulo}</strong>
            <small>{task.codigo||"Sem código"} · {task.sistema||"Sem módulo"} ·
              {" "}{task.versao||"Sem versão"}</small>
            <small>Arquivada em {trashDate(task.archived_at)}</small>
          </div>
          <Button size="sm" variant="secondary" isDisabled={restore.isPending}
            onPress={()=>confirmRestore({kind:"task",id:task.id,taskId:task.id})}>
            <ArchiveRestore size={16} aria-hidden="true"/> Restaurar TF
          </Button>
        </article>)}
      </section>
      <section className="qa-f7-trash-group" aria-label="Cenários arquivados">
        <div className="qa-f7-trash-heading">
          <h3><FileClock size={18} aria-hidden="true"/> Cenários arquivados</h3>
          <span className="count-pill">{entries.scenarios.length}</span>
        </div>
        {entries.scenarios.length===0&&<p className="text-muted text-sm">
          Nenhum cenário arquivado em TFs ativas.</p>}
        {entries.scenarios.map(scenario=><article className="qa-f7-trash-entry"
          key={scenario.id}>
          <div>
            <strong>{scenario.titulo}</strong>
            <small>TF: {scenario.tarefa_titulo}</small>
            <small>Arquivado em {trashDate(scenario.archived_at)}</small>
          </div>
          <Button size="sm" variant="secondary" isDisabled={restore.isPending}
            onPress={()=>confirmRestore({
              kind:"scenario",id:scenario.id,taskId:scenario.tarefa_id
            })}>
            <ArchiveRestore size={16} aria-hidden="true"/> Restaurar cenário
          </Button>
        </article>)}
      </section>
      {(entries.tasks.length>=100||entries.scenarios.length>=100)&&
        <small className="text-muted">Exibindo os 100 registros mais recentes de cada tipo.</small>}
    </>}
    <p className="text-muted text-sm">Não existe exclusão permanente pela interface.
      Registros apagados antes da F7 não podem ser reconstruídos por esta lixeira.</p>
  </div>;
}
