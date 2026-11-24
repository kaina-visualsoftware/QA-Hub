import type {KeyboardEvent,ReactNode} from "react";
import {FolderOpen,LayoutDashboard,ListChecks,FileChartColumnIncreasing,
  BookOpenText,Paperclip,Link2,Users} from "lucide-react";
import type {Task,Scenario} from "../../lib/contracts";

export type TaskTab="summary"|"tests"|"deliverables"|"resources";
export type TaskResourceView="requirements"|"files"|"references"|"team";

const tabs=[
  {id:"summary",label:"Visão geral",short:"Geral",icon:LayoutDashboard},
  {id:"tests",label:"Cenários",short:"Cenários",icon:ListChecks},
  {id:"deliverables",label:"Relatórios e posts",short:"Relatórios",icon:FileChartColumnIncreasing},
  {id:"resources",label:"Arquivos e requisitos",short:"Arquivos",icon:FolderOpen}
] as const;

function moveTab(event:KeyboardEvent<HTMLButtonElement>,index:number,
  items:readonly {id:string}[],onChange:(id:string)=>void,prefix:string){
  const keys:Record<string,number>={
    ArrowRight:(index+1)%items.length,
    ArrowLeft:(index-1+items.length)%items.length,
    Home:0,End:items.length-1
  };
  const next=keys[event.key];
  if(next===undefined)return;
  event.preventDefault();
  onChange(items[next].id);
  requestAnimationFrame(()=>document.getElementById(prefix+items[next].id)?.focus());
}

export function TaskViewTabs({value,onChange,scenarioCount}:{
  value:TaskTab;onChange:(tab:TaskTab)=>void;scenarioCount:number;
}){
  return <nav className="qa-task-tabs qa-task-tabs-workspace" role="tablist"
    aria-label="Áreas da tarefa">
    {tabs.map(({id,label,short,icon:Icon},index)=>
      <button key={id} type="button" role="tab"
        aria-label={id==="tests"?label+" ("+scenarioCount+")":label}
        id={"qa-task-tab-"+id} aria-controls={"qa-task-panel-"+id}
        aria-selected={value===id} tabIndex={value===id?0:-1}
        onKeyDown={event=>moveTab(event,index,tabs,
          next=>onChange(next as TaskTab),"qa-task-tab-")}
        onClick={()=>onChange(id)}
        className={"qa-task-tab"+(value===id?" selected":"")}>
        <Icon size={17} aria-hidden="true"/>
        <span className="qa-task-tab-long">{label}</span>
        <span className="qa-task-tab-short" aria-hidden="true">{short}</span>
        {id==="tests"&&<span className="qa-task-tab-count">{scenarioCount}</span>}
      </button>)}
  </nav>;
}

const resourceTabs=[
  {id:"requirements",label:"Requisitos",icon:BookOpenText},
  {id:"files",label:"Arquivos e evidências",icon:Paperclip},
  {id:"references",label:"Releases e referências",icon:Link2},
  {id:"team",label:"Equipe",icon:Users}
] as const;

export function TaskResourceTabs({value,onChange}:{
  value:TaskResourceView;onChange:(next:TaskResourceView)=>void;
}){
  return <nav className="qa-task-resources-tabs" role="tablist"
    aria-label="Documentos e informações de apoio">
    {resourceTabs.map(({id,label,icon:Icon},index)=>
      <button key={id} role="tab" type="button"
        id={"qa-task-resource-tab-"+id}
        aria-controls={"qa-task-resource-panel-"+id}
        aria-selected={value===id} tabIndex={value===id?0:-1}
        onClick={()=>onChange(id)}
        onKeyDown={event=>moveTab(event,index,resourceTabs,
          next=>onChange(next as TaskResourceView),"qa-task-resource-tab-")}
        className={"qa-task-resource-tab"+(value===id?" selected":"")}>
        <Icon size={17} aria-hidden="true"/>{label}
      </button>)}
  </nav>;
}

function Detail({label,value}:{label:string;value:string|null|undefined}){
  if(!value?.trim())return null;
  return <div className="qa-task-detail">
    <span>{label}</span><p>{value}</p>
  </div>;
}
export function TaskOverview({task}:{task:Task}){
  const description=task.descricao?.trim()??"";
  const summaryLimit=480;
  const needsExpand=description.length>summaryLimit;
  const shortDescription=needsExpand
    ?description.slice(0,summaryLimit).replace(/\s+\S*$/,"").trimEnd()+"…"
    :description;
  // Code, module, version and type already appear in the page header.
  // Keep only supplementary fields in the collapsed details.
  const metadata=[
    {label:"Ambiente",value:task.ambiente},
    {label:"Base de teste",value:task.base_teste},
    {label:"Empresa",value:task.empresa},
    {label:"Testador",value:task.testador}
  ].filter(item=>item.value?.trim());
  const technical=[
    {label:"Funcionamento",value:task.explicacao},
    {label:"Causa identificada",value:task.causa},
    {label:"Correção implementada",value:task.correcao},
    {label:"Conclusão",value:task.conclusao},
    {label:"Observações",value:task.observacoes}
  ].filter(item=>item.value?.trim());
  return <div className="qa-task-overview-v2 qa-task-overview-focused qa-task-overview-compact">
    <section className="panel qa-task-info-card" aria-label="Informações principais da tarefa">
      <header className="qa-task-info-heading"><h2>Resumo da TF</h2></header>
      {description?<div className="qa-task-primary-description">
        <p className="qa-task-description-preview">{shortDescription}</p>
        {needsExpand&&<details className="qa-task-description-more">
          <summary>Ler descrição completa</summary>
          <p>{description}</p>
        </details>}
      </div>:<p className="text-muted text-sm">Nenhuma descrição informada.</p>}
      {metadata.length>0&&<details className="qa-progressive-details qa-task-metadata-details">
        <summary>Dados complementares</summary>
        <div className="qa-task-detail-grid">
          {metadata.map(item=><Detail key={item.label} label={item.label} value={item.value}/>)}
        </div>
      </details>}
    </section>
    {technical.length>0&&<details className="panel qa-task-info-card qa-task-progressive-panel"
      aria-label="Análise técnica da tarefa">
      <summary className="qa-task-progressive-heading"><span><h2>Análise técnica</h2></span></summary>
      <div className="qa-task-technical-list">
        {technical.map(item=><Detail key={item.label} label={item.label} value={item.value}/>)}
      </div>
    </details>}
  </div>;
}

export function TaskResultsDashboard({scenarios}:{scenarios:Scenario[]}){
  const total=scenarios.length;
  const statusItems=[
    {name:"Aprovados",status:"aprovado",color:"pass"},
    {name:"Reprovados",status:"reprovado",color:"fail"},
    {name:"Bloqueados",status:"bloqueado",color:"blocked"},
    {name:"Pendentes",status:"nao_executado",color:"pending"}
  ];
  const results=statusItems.map(item=>({...item,
    count:scenarios.filter(s=>s.status===item.status).length
  }));
  const executed=total-results[3].count;
  const coverage=total?Math.round(executed/total*100):0;
  return <section className="qa-task-results" aria-labelledby="qa-task-results-title">
    <header className="qa-task-info-heading">
      <h2 id="qa-task-results-title">Indicadores da execução</h2>
      <p>Gráficos calculados a partir dos resultados efetivamente salvos nesta TF.</p>
    </header>
    <div className="qa-task-results-metrics" aria-label="Resumo dos cenários">
      <div><strong>{total}</strong><span>Cenários totais</span></div>
      <div><strong>{executed}</strong><span>Executados</span></div>
      <div><strong>{coverage}%</strong><span>Execução registrada</span></div>
      <div><strong>{results[1].count+results[2].count}</strong><span>Falhas e bloqueios</span></div>
    </div>
    <div className="qa-task-results-distribution">
      <div className="qa-task-results-distribution-header">
        <h3>Distribuição dos resultados</h3>
        <span>{executed} de {total} executados</span>
      </div>
      <div className="qa-task-results-stack" role="img"
        aria-label={results.map(item=>item.name+": "+item.count).join("; ")}>
        {results.map(item=>item.count>0&&<span key={item.status}
          className={"qa-task-results-segment qa-task-results-"+item.color}
          style={{width:(item.count/total*100)+"%"}}/>)}
      </div>
      <div className="qa-task-results-legend">
        {results.map(item=><div key={item.status}>
          <i aria-hidden="true" className={"qa-task-results-"+item.color}/>
          <span>{item.name}</span><strong>{item.count}</strong>
        </div>)}
      </div>
      {total===0&&<p className="text-muted text-sm">
        Cadastre cenários para visualizar a distribuição de resultados.</p>}
    </div>
  </section>;
}

export function TaskDeliverables({diagrams,documents}:{
  diagrams:ReactNode;documents:ReactNode;
}){
  return <div className="qa-task-deliverables qa-task-deliverables-organized">
    <div className="qa-artifact-collections">
      {documents}
      {diagrams}
    </div>
  </div>;
}
