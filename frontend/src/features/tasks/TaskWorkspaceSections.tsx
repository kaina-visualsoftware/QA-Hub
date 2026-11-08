import type { KeyboardEvent } from "react";
import { Button } from "@heroui/react";
import {
  ArrowRight, BookText, ClipboardList, FileText, GitBranchPlus, GitMerge,
  LayoutDashboard, ListChecks, Plus, Sparkles, Workflow
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
  description, cause, correction, pendingCount, total, owner,
  onNewScenario, onRun, onCases, onDiagram, onDeliverables
}: {
  description?: string | null; cause?: string | null; correction?: string | null;
  pendingCount: number; total: number; owner: boolean;
  onNewScenario: () => void; onRun: () => void; onCases: () => void;
  onDiagram: () => void; onDeliverables: () => void;
}) {
  const source = description?.trim() || "";
  const abbreviated = source.length > 360;
  const nextLabel = pendingCount === 1
    ? "1 teste aguardando execução" : pendingCount + " testes aguardando execução";
  return <div className="qa-task-overview">
    <section className="qa-quickflow qa-quickflow-clean qa-task-action-panel"
      aria-label="Fluxo rápido de QA">
      <div className="qa-overview-intro">
        <div>
          <p className="eyebrow">PRÓXIMO PASSO</p>
          <h2>{!total ? "Comece pelos cenários" :
            pendingCount ? nextLabel :
            "Execução registrada"}</h2>
          <p>{!total ? "Cadastre um caso ou gere uma sugestão a partir da TF." :
            pendingCount ? "Continue de onde parou, sem alterar a situação da TF." :
            "Consulte os resultados e prepare os entregáveis."}</p>
        </div>
      </div>
      <div className="qa-primary-actions" role="group" aria-label="Ações principais da TF">
        <Button onPress={onRun} isDisabled={!owner} aria-label="Testar pendentes">
          <ListChecks size={18} aria-hidden="true"/> Testar
        </Button>
        <Button variant="secondary" onPress={onNewScenario} isDisabled={!owner}>
          <Plus size={18} aria-hidden="true"/> Cenário
        </Button>
        <button type="button" className="qa-primary-tool" aria-label="Gerar casos com IA"
          onClick={onCases}><Sparkles size={18} aria-hidden="true"/> Gerar casos</button>
        <button type="button" className="qa-primary-tool" aria-label="Gerar diagrama com IA"
          onClick={onDiagram}><Workflow size={18} aria-hidden="true"/> Diagrama</button>
      </div>
      <button type="button" className="qa-overview-more" onClick={onDeliverables}>
        Mais ferramentas <ArrowRight size={16} aria-hidden="true"/>
      </button>
    </section>
    {source && <section className="panel qa-task-description" aria-label="Descrição da TF">
      <h2>Sobre esta TF</h2>
      <p className="qa-task-excerpt">{abbreviated ? source.slice(0, 350).trimEnd() + "…" : source}</p>
      {abbreviated && <details className="qa-task-full-text">
        <summary>Ver descrição completa</summary><p>{source}</p>
      </details>}
      {(cause?.trim() || correction?.trim()) && <details className="qa-task-full-text">
        <summary>Ver análise técnica</summary>
        {cause?.trim() && <p><strong>Causa</strong>{cause}</p>}
        {correction?.trim() && <p><strong>Correção</strong>{correction}</p>}
      </details>}
    </section>}
  </div>;
}

export type DeliverableKind =
  | "post" | "diagrams" | "documents" | "requirements" | "evidence" | "links";

export function TaskDeliverables({ onOpen }: {
  onOpen: (kind: DeliverableKind, primary?: boolean) => void;
}) {
  return <div className="qa-task-deliverables">
    <div className="qa-task-section-heading">
      <div><h2>Entregáveis</h2><p>Produza ou consulte os materiais da TF sem sair da tarefa.</p></div>
    </div>
    <div className="qa-deliverables-group" aria-label="Criar entregáveis">
      <button type="button" className="qa-deliverable-action"
        onClick={() => onOpen("post", true)}>
        <span className="qa-deliverable-icon"><FileText size={20}/></span>
        <span><strong>Gerar post</strong><small>Resumo técnico com IA</small></span>
        <ArrowRight className="qa-deliverable-arrow" size={17} aria-hidden="true"/>
      </button>
      <button type="button" className="qa-deliverable-action" onClick={() => onOpen("diagrams", true)}>
        <span className="qa-deliverable-icon"><Workflow size={20}/></span>
        <span><strong>Gerar diagrama</strong><small>Fluxo visual Mermaid</small></span>
        <ArrowRight className="qa-deliverable-arrow" size={17} aria-hidden="true"/>
      </button>
      <button type="button" className="qa-deliverable-action" onClick={() => onOpen("documents", true)}>
        <span className="qa-deliverable-icon"><ClipboardList size={20}/></span>
        <span><strong>Relatório</strong><small>Resultados e histórico</small></span>
        <ArrowRight className="qa-deliverable-arrow" size={17} aria-hidden="true"/>
      </button>
    </div>
    <h3 className="qa-deliverables-subtitle">Consultar e organizar</h3>
    <div className="qa-workbench-tools-grid" role="group" aria-label="Ferramentas da TF">
      <button type="button" aria-label="Requisitos e cobertura" onClick={() => onOpen("requirements")}
        className="qa-workbench-tool"><BookText size={17}/> Requisitos e cobertura</button>
      <button type="button" aria-label="Evidências e auditoria" onClick={() => onOpen("evidence")}
        className="qa-workbench-tool"><ClipboardList size={17}/> Evidências e auditoria</button>
      <button type="button" aria-label="Releases e referências" onClick={() => onOpen("links")}
        className="qa-workbench-tool"><GitMerge size={17}/> Releases e referências</button>
      <button type="button" aria-label="Diagramas salvos / editor" onClick={() => onOpen("diagrams")}
        className="qa-workbench-tool"><GitBranchPlus size={17}/> Diagramas salvos / editor</button>
      <button type="button" aria-label="Relatório e documentos" onClick={() => onOpen("documents")}
        className="qa-workbench-tool"><FileText size={17}/> Relatório e documentos</button>
    </div>
  </div>;
}
