import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChartNoAxesCombined, CircleCheck, CircleDashed, ClipboardList, Plus } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { getAdminRole, listTasks } from "../lib/data";
import { listTaskProgress } from "../lib/task-progress";
import { taskStatusLabels } from "../lib/contracts";
import type { Task } from "../lib/contracts";

function percentage(value:number,total:number){return total?Math.round(value/total*100):0}
export default function DashboardPage(){
  const {user}=useAuth();
  const userId=user?.id??"";
  const role=useQuery({queryKey:["role",userId],queryFn:()=>getAdminRole(userId),enabled:!!userId});
  const tasks=useQuery({queryKey:["tasks",userId,role.data],
    queryFn:()=>listTasks(userId,role.data??false),enabled:!!userId&&role.data!==undefined});
  const all=tasks.data??[];
  const summary=all.reduce((acc,task)=>{
    acc[task.status]=(acc[task.status]||0)+1;return acc;
  },{} as Record<Task["status"],number>);
  const recent=all.slice(0,5);
  const taskIds=all.slice(0,30).map(t=>t.id);
  const progress=useQuery({queryKey:["task-progress",userId,taskIds.join(",")],
    queryFn:()=>listTaskProgress(taskIds),enabled:tasks.isSuccess&&taskIds.length>0});
  const totals=Object.values(progress.data??{}).reduce((acc,item)=>({
    scenarios:acc.scenarios+item.total,
    executed:acc.executed+item.executed,
    pending:acc.pending+item.pending
  }),{scenarios:0,executed:0,pending:0});
  return <div className="page qa-dashboard">
    <div className="page-heading"><div><p className="eyebrow">ACOMPANHAMENTO</p>
      <h1>Visão geral</h1></div>
      <Link to="/" search={{newTask:true}} className="secondary-link">
        <Plus size={17}/> Nova TF
      </Link>
    </div>
    {tasks.isPending&&<p role="status">Carregando indicadores…</p>}
    {tasks.isError&&<p className="notice error" role="alert">{tasks.error.message}</p>}
    <section className="qa-dashboard-metrics" aria-label="Indicadores das tarefas">
      <article><ClipboardList size={18}/><span>TFs</span><strong>{all.length}</strong></article>
      <article><CircleDashed size={18}/><span>Em andamento</span>
        <strong>{(summary.rascunho||0)+(summary.em_teste||0)}</strong></article>
      <article><CircleCheck size={18}/><span>Aprovadas</span><strong>{summary.aprovado||0}</strong></article>
      <article><ChartNoAxesCombined size={18}/><span>Com problema</span>
        <strong>{(summary.reprovado||0)+(summary.bloqueado||0)}</strong></article>
    </section>
    <div className="qa-dashboard-panels">
      <section className="panel">
        <h2>Distribuição das TFs</h2>
        <div className="qa-dashboard-statuses">
          {(Object.entries(taskStatusLabels) as [Task["status"],string][]).map(([key,label])=>
            <div key={key} className="qa-dashboard-barrow">
              <div><span>{label}</span><strong>{summary[key]||0}</strong></div>
              <div className="qa-dashboard-track"><span style={{width:percentage(summary[key]||0,all.length)+"%"}}/></div>
            </div>)}
        </div>
        <p className="text-muted text-sm">Baseado nas TFs acessíveis à sua conta.</p>
      </section>
      <section className="panel">
        <h2>Cobertura de execução</h2>
        <div className="qa-dashboard-coverage">
          <strong>{percentage(totals.executed,totals.scenarios)}%</strong>
          <span>dos cenários registrados como executados</span>
        </div>
        <div className="qa-dashboard-track" role="progressbar" aria-label="Execução dos cenários"
          aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={percentage(totals.executed,totals.scenarios)}>
          <span style={{width:percentage(totals.executed,totals.scenarios)+"%"}}/>
        </div>
        <p className="text-muted text-sm">{totals.executed} executados · {totals.pending} pendentes
          {progress.isPending?" · Consultando…":""}</p>
        <small className="text-muted">A cobertura considera até 30 TFs recentes, com base nos
          resultados realmente gravados. Execução não equivale à aprovação da TF.</small>
        {progress.isError&&<p role="alert" className="notice error">Não foi possível consultar a cobertura.</p>}
      </section>
    </div>
    <section className="panel qa-dashboard-recents">
      <div className="section-heading"><h2>Últimas tarefas</h2>
        <Link className="back-link" to="/">Ver todas <ArrowRight size={15}/></Link></div>
      {recent.length===0&&<p className="empty-state">Nenhuma TF cadastrada.</p>}
      {recent.map(task=><Link key={task.id} to="/tarefa/$taskId" params={{taskId:task.id}}
        className="qa-dashboard-recent">
        <span><strong>{task.titulo}</strong>
          <small>{task.codigo||"Sem código"} · {task.tipo_teste}</small></span>
        <span className={"status-chip "+task.status}>{taskStatusLabels[task.status]}</span>
      </Link>)}
    </section>
  </div>;
}
