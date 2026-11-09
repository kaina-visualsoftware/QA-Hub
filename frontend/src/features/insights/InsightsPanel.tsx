import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {BarChart3,History,Layers3} from "lucide-react";
import {coveragePercent,fetchQaInsights,monthLabel} from "./insights-data";
import type {QaInsightsPeriod} from "./insights-data";

export default function InsightsPanel({userId}:{userId:string}){
  const [period,setPeriod]=useState<QaInsightsPeriod>(6);
  const [showAll,setShowAll]=useState(false);
  const query=useQuery({
    queryKey:["qa-insights",userId,period],
    queryFn:()=>fetchQaInsights(period),
    enabled:!!userId,staleTime:30000
  });
  const report=query.data;
  return <div className="qa-f6-insights" aria-label="Inteligência de QA">
    <div className="qa-f6-insights-head">
      <div>
        <h3><BarChart3 size={18} aria-hidden="true"/> Qualidade por módulo e versão</h3>
        <p className="text-muted text-sm">Cobertura reflete o estado atual dos cenários.
          Regressões vêm somente das mudanças realmente registradas desde a F4.</p>
      </div>
      <label className="field">Histórico
        <select value={period} onChange={e=>{
          setPeriod(Number(e.target.value) as QaInsightsPeriod);
        }}>
          <option value={3}>3 meses</option>
          <option value={6}>6 meses</option>
          <option value={12}>12 meses</option>
        </select>
      </label>
    </div>
    {query.isPending&&<p role="status" className="notice">Calculando indicadores…</p>}
    {query.isError&&<div role="alert" className="notice error">
      Não foi possível consultar os indicadores: {query.error.message}
      <Button variant="secondary" size="sm" onPress={()=>void query.refetch()}>
        Tentar novamente
      </Button>
    </div>}
    {report&&<>
      <div className="qa-f6-summary" aria-label="Resumo da qualidade">
        <div><Layers3 size={17} aria-hidden="true"/>
          <strong>{report.modules.length}</strong><span>Módulos na visão</span></div>
        <div><History size={17} aria-hidden="true"/>
          <strong>{report.months.reduce((total,item)=>total+item.alteracoes,0)}</strong>
          <span>Mudanças registradas no período</span></div>
        <div><strong>{report.regressions}</strong>
          <span>Transições de aprovado para falha/bloqueio</span></div>
      </div>
      <section className="qa-f6-section" aria-label="Cobertura por módulo">
        <h4>Cobertura atual por módulo</h4>
        {report.modules.length===0&&<p className="text-muted text-sm">
          Não há TFs com dados acessíveis para exibir.</p>}
        {report.modules.slice(0,showAll?20:6).map(item=>{
          const coverage=coveragePercent(item.executados,item.casos);
          return <article className="qa-f6-metric" key={item.modulo}>
            <div className="qa-f6-metric-heading">
              <strong>{item.modulo}</strong>
              <span>{coverage}% · {item.executados}/{item.casos} cenários</span>
            </div>
            <div className="qa-f6-track" role="progressbar"
              aria-label={"Cobertura em "+item.modulo}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={coverage}>
              <span style={{width:coverage+"%"}}/>
            </div>
            <small>{item.tarefas} TF(s) · {item.problemas} caso(s) com falha ou bloqueio</small>
          </article>;
        })}
        {report.modules.length>6&&<Button variant="secondary" size="sm"
          onPress={()=>setShowAll(value=>!value)}>
          {showAll?"Mostrar menos":"Ver todos os módulos ("+report.modules.length+")"}
        </Button>}
      </section>
      <section className="qa-f6-section" aria-label="Qualidade por versão">
        <h4>Versões registradas nas TFs</h4>
        {report.versions.length===0&&<p className="text-muted text-sm">
          Nenhuma versão disponível.</p>}
        <div className="qa-f6-versions">
          {report.versions.map(item=><div className="qa-f6-version" key={item.modulo+"\u0000"+item.versao}>
            <div><strong>{item.modulo}</strong> <span>· {item.versao}</span></div>
            <p>{item.tarefas} TF(s) · {item.aprovadas} aprovada(s) ·
              {" "}{coveragePercent(item.executados,item.casos)}% dos cenários executados
              {item.problemas>0?" · "+item.problemas+" com problema":""}</p>
          </div>)}
        </div>
        <small className="text-muted">A versão exibida é a versão atual da TF.
          Não é possível atribuir uma regressão histórica a uma versão antiga sem snapshot da versão.</small>
      </section>
      <section className="qa-f6-section" aria-label="Mudanças ao longo do tempo">
        <h4>Histórico confirmado · últimos {report.period_months} meses</h4>
        {report.months.length===0&&<p className="text-muted text-sm">
          Não há mudanças de status registradas neste período. Estados iniciais
          anteriores à F4 não são contados como execuções.</p>}
        {report.months.map(item=><div className="qa-f6-month" key={item.mes}>
          <strong>{monthLabel(item.mes)}</strong>
          <span>{item.alteracoes} mudança(s) · {item.aprovacoes} aprovação(ões) de cenário
            {item.regressoes>0?" · "+item.regressoes+" retrocesso(s)":""}</span>
        </div>)}
      </section>
    </>}
  </div>;
}
