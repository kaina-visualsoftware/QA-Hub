import {useState,lazy,Suspense} from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChartNoAxesCombined, CircleCheck, CircleDashed, ClipboardList, Plus } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import {getAdminRole} from "../lib/data";
import {taskStatistics} from "../features/tasks/task-search-data";
import { taskStatusLabels } from "../lib/contracts";
import type { Task } from "../lib/contracts";
import {QAModal} from "../components/ui/QAModal";
const InsightsPanel=lazy(()=>import("../features/insights/InsightsPanel"));

function percentage(value:number,total:number){return total?Math.round(value/total*100):0}
export default function DashboardPage(){
  const {user}=useAuth();
  const userId=user?.id??"";
  const [showInsights,setShowInsights]=useState(false);
  const role=useQuery({queryKey:["role",userId],queryFn:()=>getAdminRole(userId),enabled:!!userId});
  const tasks=useQuery({
    queryKey:["task-stats",userId,role.data],
    queryFn:taskStatistics,
    enabled:!!userId&&role.data!==undefined,
    staleTime:20000
  });
  const allCount=tasks.data?.total??0;
  const summary=tasks.data?.statuses??{} as Record<Task["status"],number>;
  const recent=tasks.data?.recent??[];
  const totals={
    scenarios:tasks.data?.scenarios??0,
    executed:tasks.data?.executed??0,
    pending:(tasks.data?.scenarios??0)-(tasks.data?.executed??0)
  };
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
      <article><ClipboardList size={18}/><span>TFs</span><strong>{allCount}</strong></article>
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
              <div className="qa-dashboard-track"><span style={{width:percentage(summary[key]||0,allCount)+"%"}}/></div>
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
          {tasks.isPending?" · Consultando…":""}</p>
        <small className="text-muted">Cobertura calculada no banco a partir dos resultados gravados.
          Execução não equivale à aprovação da TF.</small>
      </section>
    </div>
    <section className="panel qa-f6-dashboard-entry" aria-label="Inteligência de QA">
      <div className="section-heading">
        <div><h2>Análises de qualidade</h2>
          <p className="text-muted text-sm">Cobertura por módulo e versão, mudanças reais e regressões.</p></div>
        <button type="button" className="secondary-link" onClick={()=>setShowInsights(true)}>
          <ChartNoAxesCombined size={17} aria-hidden="true"/> Explorar indicadores
        </button>
      </div>
    </section>
    <QAModal open={showInsights} title="Inteligência de QA" eyebrow="INDICADORES"
      size="full" onClose={()=>setShowInsights(false)}>
      <Suspense fallback={<p role="status" className="notice">Carregando análises…</p>}>
        <InsightsPanel userId={userId}/>
      </Suspense>
    </QAModal>
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
