import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Task, Scenario } from "../../lib/contracts";
import {
  listRequirements, listRequirementLinks, listRequirementSources, listRequirementUsage
} from "./requirements-data";
import RequirementCatalog from "./RequirementCatalog";
import CoverageView from "./CoverageView";
import SourcesView from "./SourcesView";
import UsageView from "./UsageView";
import { BookText, ChartNoAxesColumn, FileText, History, X } from "lucide-react";

type Props = { task: Task; userId: string; scenarios: Scenario[]; onClose: () => void };
type View = "catalog" | "coverage" | "sources" | "history";

export default function RequirementsPanel({ task, userId, scenarios, onClose }: Props) {
  const owned = task.user_id === userId;
  const [view, setView] = useState<View>("catalog");
  const client = useQueryClient();
  const reqs = useQuery({
    queryKey: ["requirements", userId, task.id],
    queryFn: () => listRequirements(task.id), enabled: owned
  });
  const links = useQuery({
    queryKey: ["requirement-links", userId, task.id],
    queryFn: () => listRequirementLinks(task.id), enabled: owned && view === "coverage"
  });
  const sources = useQuery({
    queryKey: ["requirement-sources", userId, task.id],
    queryFn: () => listRequirementSources(task.id), enabled: owned
  });
  const history = useQuery({
    queryKey: ["requirement-usage", userId, task.id],
    queryFn: () => listRequirementUsage(task.id), enabled: owned && view === "history"
  });
  const reload = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["requirements", userId, task.id] }),
      client.invalidateQueries({ queryKey: ["requirement-links", userId, task.id] }),
      client.invalidateQueries({ queryKey: ["requirement-sources", userId, task.id] }),
      client.invalidateQueries({ queryKey: ["gen-requirements", userId, task.id] })
    ]);
  };
  const viewItems = [
    { id: "catalog" as const, text: "Requisitos", icon: BookText },
    { id: "coverage" as const, text: "Cobertura", icon: ChartNoAxesColumn },
    { id: "sources" as const, text: "Fontes e anexos", icon: FileText },
    { id: "history" as const, text: "Rastreabilidade", icon: History }
  ];
  return <section className="panel mt-5" aria-labelledby="requirements-heading">
    <div className="section-heading">
      <div><p className="eyebrow">R1–R4 · TF PRIVADA</p><h2 id="requirements-heading">Requisitos e cobertura</h2>
        <p className="text-muted">Importe, revise e aprove requisitos. Vincule cenários reais para acompanhar a cobertura.</p>
      </div>
      <button type="button" aria-label="Fechar requisitos" onClick={onClose}><X size={18} /></button>
    </div>
    {!owned ? <p className="notice error mt-4" role="alert">
      Os requisitos pertencem ao criador da TF e não são exibidos na consulta administrativa.
    </p> : <>
      <div className="requirements-tabs mt-5" role="tablist" aria-label="Requisitos da TF">
        {viewItems.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} role="tab" aria-selected={view === item.id}
            className={"filter-chip " + (view === item.id ? "selected" : "")}
            onClick={() => setView(item.id)}>
            <Icon size={16} /> {item.text}
          </button>;
        })}
      </div>
      <div role="tabpanel" className="mt-5">
        {reqs.isPending && <p className="notice" role="status">Carregando requisitos privados…</p>}
        {reqs.isError && <p className="notice error" role="alert">{reqs.error.message}</p>}
        {reqs.isSuccess && view === "catalog" &&
          <RequirementCatalog task={task} records={reqs.data} sources={sources.data ?? []}
            onChanged={reload} />}
        {reqs.isSuccess && view === "coverage" &&
          <CoverageView task={task} requirements={reqs.data}
            scenarios={scenarios} links={links.data ?? []}
            loading={links.isPending} error={links.error?.message} onChanged={reload} />}
        {reqs.isSuccess && view === "sources" &&
          <SourcesView task={task} userId={userId} records={sources.data ?? []}
            loading={sources.isPending} error={sources.error?.message} onChanged={reload} />}
        {reqs.isSuccess && view === "history" &&
          <UsageView records={history.data ?? []} loading={history.isPending}
            error={history.error?.message} />}
      </div>
    </>}
  </section>;
}
