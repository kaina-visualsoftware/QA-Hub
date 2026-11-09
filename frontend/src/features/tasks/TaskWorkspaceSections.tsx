import type { KeyboardEvent,ReactNode } from "react";
import { Button } from "@heroui/react";
import {
  ArrowRight, BookText, ClipboardList, FileText, GitMerge,
  LayoutDashboard, ListChecks, Workflow, History, Users
} from "lucide-react";

export type TaskTab = "summary" | "tests" | "deliverables";
const tabs: { id: TaskTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "summary", label: "Resumo", icon: LayoutDashboard },
  { id: "tests", label: "Testes", icon: ListChecks },
  { id: "deliverables", label: "Entregáveis", icon: FileText }
];

export function TaskViewTabs({ value, onChange, scenarioCount }: {
  value: TaskTab; onChange: (tab: TaskTab) => void; scenarioCount: number;
}) {
  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(tabs[next].id);
    requestAnimationFrame(() => {
      document.getElementById("qa-task-tab-" + tabs[next].id)?.focus();
    });
  }
  return <nav className="qa-task-tabs" role="tablist" aria-label="Áreas da tarefa">
    {tabs.map(({id, label, icon: Icon}, index) =>
      <button key={id} type="button" role="tab" id={"qa-task-tab-"+id}
        aria-controls={"qa-task-panel-"+id}
        aria-selected={value === id} tabIndex={value === id ? 0 : -1}
        onClick={() => onChange(id)} onKeyDown={(event) => handleKey(event, index)}
        className={"qa-task-tab " + (value === id ? "selected" : "")}>
        <Icon size={17} aria-hidden="true"/>
        <span>{label}</span>
        {id === "tests" && <span className="qa-task-tab-count" aria-label={scenarioCount+" cenários"}>
          {scenarioCount}
        </span>}
      </button>)}
  </nav>;
}

export function TaskOverview({
  description,cause,correction,pendingCount,total,onViewTests
}:{
  description?:string|null;cause?:string|null;correction?:string|null;
  pendingCount:number;total:number;onViewTests:()=>void;
}){
  const source=description?.trim()||"";
  const abbreviated=source.length>360;
  return <div className="qa-task-overview qa-task-overview-clean">
    <section className="qa-task-status-summary" aria-label="Situação dos testes">
      <div>
        <p className="eyebrow">EXECUÇÃO</p>
        <h2>{!total?"Sem cenários cadastrados":
          pendingCount?pendingCount+" cenário(s) pendente(s)":"Execução registrada"}</h2>
        <p>{!total?"Use Ações para cadastrar ou gerar o primeiro cenário.":
          pendingCount?"Abra a área Testes para continuar a validação.":
          "Consulte os resultados em Testes e os artefatos em Entregáveis."}</p>
      </div>
      <Button variant="secondary" onPress={onViewTests}>
        <ListChecks size={17} aria-hidden="true"/> Ver testes
      </Button>
    </section>
    <section className="panel qa-task-description" aria-label="Descrição da TF">
      <h2>Sobre esta TF</h2>
      {source?<p className="qa-task-excerpt">{abbreviated?
        source.slice(0,350).trimEnd()+"…":source}</p>:
        <p className="text-muted text-sm">Nenhuma descrição informada.</p>}
      {abbreviated&&<details className="qa-task-full-text">
        <summary>Ver descrição completa</summary><p>{source}</p>
      </details>}
      {(cause?.trim()||correction?.trim())&&<details className="qa-task-full-text">
        <summary>Ver análise técnica</summary>
        {cause?.trim()&&<p><strong>Causa</strong>{cause}</p>}
        {correction?.trim()&&<p><strong>Correção</strong>{correction}</p>}
      </details>}
    </section>
  </div>;
}

export type DeliverableKind =
  | "post" | "diagrams" | "documents" | "requirements" | "evidence" | "links" | "history" | "collaboration";

export function TaskDeliverables({onOpen,diagrams,documents,owner}:{
  onOpen:(kind:DeliverableKind,primary?:boolean)=>void;
  diagrams:ReactNode;documents:ReactNode;owner:boolean;
}){
  return <div className="qa-task-deliverables qa-task-deliverables-organized">
    <div className="qa-task-section-heading">
      <div><h2>Entregáveis</h2>
        <p>Visualize os registros já salvos sem abrir um formulário de criação.</p>
      </div>
    </div>
    <div className="qa-artifact-collections">
      {diagrams}
      {documents}
    </div>
    {owner&&<><h3 className="qa-deliverables-subtitle">Criar</h3>
    <div className="qa-deliverables-group" aria-label="Criar entregáveis">
      <button type="button" className="qa-deliverable-action"
        onClick={()=>onOpen("post",true)}>
        <span className="qa-deliverable-icon"><FileText size={19}/></span>
        <span><strong>Gerar post</strong><small>Redigir com IA</small></span>
        <ArrowRight className="qa-deliverable-arrow" size={17} aria-hidden="true"/>
      </button>
      <button type="button" className="qa-deliverable-action"
        onClick={()=>onOpen("diagrams",true)}>
        <span className="qa-deliverable-icon"><Workflow size={19}/></span>
        <span><strong>Criar diagrama</strong><small>Editor Mermaid / IA</small></span>
        <ArrowRight className="qa-deliverable-arrow" size={17} aria-hidden="true"/>
      </button>
      <button type="button" className="qa-deliverable-action"
        onClick={()=>onOpen("documents",true)}>
        <span className="qa-deliverable-icon"><ClipboardList size={19}/></span>
        <span><strong>Gerar relatório</strong><small>Resultados registrados</small></span>
        <ArrowRight className="qa-deliverable-arrow" size={17} aria-hidden="true"/>
      </button>
    </div>
    </>}
    <h3 className="qa-deliverables-subtitle">Consultar e gerenciar</h3>
    <div className="qa-workbench-tools-grid" role="group" aria-label="Ferramentas da TF">
      <button type="button" aria-label="Requisitos e cobertura"
        onClick={()=>onOpen("requirements")} className="qa-workbench-tool">
        <BookText size={17}/> Requisitos e cobertura</button>
      <button type="button" aria-label="Evidências e auditoria"
        onClick={()=>onOpen("evidence")} className="qa-workbench-tool">
        <ClipboardList size={17}/> Evidências e auditoria</button>
      <button type="button" aria-label="Releases e referências"
        onClick={()=>onOpen("links")} className="qa-workbench-tool">
        <GitMerge size={17}/> Releases e referências</button>
      <button type="button" aria-label="Relatório e documentos"
        onClick={()=>onOpen("documents")} className="qa-workbench-tool">
        <FileText size={17}/> Relatório e documentos</button>
      <button type="button" aria-label="Histórico de execuções"
        onClick={()=>onOpen("history")} className="qa-workbench-tool">
        <History size={17}/> Histórico de execuções</button>
      <button type="button" aria-label="Equipe e comentários"
        onClick={()=>onOpen("collaboration")} className="qa-workbench-tool">
        <Users size={17}/> Equipe e comentários</button>
    </div>
  </div>;
}
