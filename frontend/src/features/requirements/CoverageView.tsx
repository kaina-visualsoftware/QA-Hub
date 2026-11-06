import { useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { Download, Link2, Save, X } from "lucide-react";
import type { Task, Scenario } from "../../lib/contracts";
import {
  calculateRequirementCoverage, coverageCsv, COVERAGE_STATES
} from "../../lib/legacy/qa-requirements-coverage.mjs";
import type { CoverageLink } from "../../lib/legacy/qa-requirements-coverage.mjs";
import type { Requirement } from "./requirements-data";
import { linkRequirementToScenarios } from "./requirements-data";

function exportFile(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CoverageView({
  task, requirements, scenarios, links, loading, error, onChanged
}: {
  task: Task; requirements: Requirement[]; scenarios: Scenario[];
  links: CoverageLink[]; loading: boolean; error?: string;
  onChanged: () => Promise<void>;
}) {
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const summary = useMemo(() =>
    calculateRequirementCoverage(requirements, scenarios, links, task.id),
    [requirements, scenarios, links, task.id]);
  const visible = useMemo(() => summary.items.filter((item) => {
    if (filter !== "all" && item.coverage !== filter) return false;
    return !term || [item.codigo, item.titulo, item.descricao,
      ...item.cases.map((scenario) => scenario.titulo)].join(" ")
        .toLowerCase().includes(term.toLowerCase());
  }), [summary, term, filter]);
  function openLinks(requirementId: string) {
    if (editingId === requirementId) { setEditingId(null); return; }
    setEditingId(requirementId);
    setSelectedCases(links.filter((link) => link.requisito_id === requirementId)
      .map((link) => link.cenario_id));
    setSaveError(""); setMessage("");
  }
  async function saveLinks() {
    if (!editingId || saving) return;
    setSaving(true); setSaveError(""); setMessage("");
    try {
      if (selectedCases.length > 200) throw Error("Máximo de 200 cenários por requisito.");
      const result = await linkRequirementToScenarios(task.id, editingId, selectedCases);
      await onChanged();
      setEditingId(null);
      setMessage(result.linked + " cenário(s) associado(s). Cobertura atualizada.");
    } catch (reason) { setSaveError((reason as Error).message); }
    finally { setSaving(false); }
  }
  return <div className="stack">
    <div className="generator-stats">
      <span><strong>{summary.totals.total}</strong> aprovados</span>
      <span><strong>{summary.totals.linked}</strong> cobertos · {summary.totals.coveragePercent}%</span>
      <span><strong>{summary.totals.validated}</strong> validados · {summary.totals.validationPercent}%</span>
      <span><strong>{summary.totals.unlinked}</strong> sem cenários</span>
      <span><strong>{summary.totals.failed}</strong> com falha</span>
    </div>
    <p className="text-muted text-sm">
      Cobertura significa que há cenários vinculados. Um requisito somente fica validado
      quando todos os cenários vinculados foram realmente aprovados.
    </p>
    {loading && <p role="status" className="notice">Carregando vínculos privados…</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {!loading && !error && <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="field grow-2">Localizar requisito<input placeholder="Código, cenário ou título..."
          value={term} onChange={(e) => setTerm(e.target.value)} /></label>
        <label className="field">Cobertura<select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todos</option>
          {Object.entries(COVERAGE_STATES).map(([key, value]) =>
            <option key={key} value={key}>{value}</option>)}
        </select></label>
        <Button variant="secondary" onPress={() =>
          exportFile(coverageCsv(summary.items), "cobertura-" + (task.codigo || task.id) + ".csv")}>
          <Download size={16} /> Exportar CSV
        </Button>
      </div>
      {!visible.length && <p className="text-muted text-sm">
        {summary.items.length ? "Nenhum requisito neste filtro." :
          "Aprove requisitos para visualizar a cobertura."}
      </p>}
      {visible.map((item) => <article key={item.id} className="requirement-row">
        <div className="section-heading">
          <div>
            <strong>{item.codigo} · {item.titulo}</strong>
            <p className="text-muted text-sm">
              {item.linkedCount} cenário(s) vinculado(s) · {item.executedCount} executado(s)
            </p>
          </div>
          <span className={"requirement-coverage " + item.coverage}>
            {COVERAGE_STATES[item.coverage] || item.coverage}
          </span>
        </div>
        {item.cases.length ? <ul className="requirement-linked">
          {item.cases.map((scenario) => <li key={scenario.id}>
            {scenario.titulo} <small>({scenario.status.replaceAll("_", " ")})</small>
          </li>)}
        </ul> : <p className="text-muted text-sm mt-3">Sem cenários associados.</p>}
        <button className="secondary-link mt-3" onClick={() => openLinks(item.id)}>
          <Link2 size={15} /> {editingId === item.id ? "Ocultar vínculos" : "Vincular cenários"}
        </button>
        {editingId === item.id && <div className="generator-context mt-3">
          <p className="text-sm font-semibold">Selecione os cenários desta TF</p>
          {scenarios.length > 200 && <p className="notice error mt-2">
            A TF possui mais de 200 cenários; selecione no máximo 200 para este requisito.
          </p>}
          {!scenarios.length && <p className="text-muted text-sm mt-3">
            Cadastre cenários na execução para conseguir vinculá-los.
          </p>}
          <div className="requirements-link-list mt-3">
            {scenarios.map((scenario) => <label className="extracted-case" key={scenario.id}>
              <input type="checkbox" checked={selectedCases.includes(scenario.id)}
                onChange={(e) => setSelectedCases((current) =>
                  e.target.checked ? [...current, scenario.id] :
                    current.filter((id) => id !== scenario.id))} />
              <span><strong>{scenario.titulo}</strong>
                <small>{scenario.status === "nao_executado" ? "Pendente" : scenario.status}</small></span>
            </label>)}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button isDisabled={saving || selectedCases.length > 200}
              onPress={() => void saveLinks()}><Save size={15} /> Salvar vínculos</Button>
            <Button variant="secondary" onPress={() => setEditingId(null)}>
              <X size={15} /> Cancelar</Button>
          </div>
        </div>}
      </article>)}
    </>}
    {message && <p role="status" className="notice">{message}</p>}
    {saveError && <p role="alert" className="notice error">{saveError}</p>}
  </div>;
}
