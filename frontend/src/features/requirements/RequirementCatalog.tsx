import { useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import type { Task } from "../../lib/contracts";
import {
  parseRequirements, prepareImport
} from "../../lib/legacy/qa-requirements.mjs";
import type { DraftRequirement } from "../../lib/legacy/qa-requirements.mjs";
import {
  changeRequirementState, editRequirement, importRequirementText,
  listRequirementRevisions
} from "./requirements-data";
import type { Requirement } from "./requirements-data";
import { Check, FileUp, Pencil, Save, X } from "lucide-react";

function RevisionHistory({ taskId, requirementId }: { taskId: string; requirementId: string }) {
  const q = useQuery({
    queryKey: ["requirement-revisions", taskId, requirementId],
    queryFn: () => listRequirementRevisions(taskId, requirementId)
  });
  if (q.isPending) return <p role="status" className="text-sm">Consultando revisões…</p>;
  if (q.isError) return <p role="alert" className="notice error">{q.error.message}</p>;
  return <div className="stack mt-3">
    {q.data?.map((version) => <details key={version.id} className="generator-context">
      <summary>Revisão {version.versao} · {version.estado} · {new Date(version.created_at).toLocaleString("pt-BR")}</summary>
      <p className="text-sm mt-3"><strong>{version.codigo} · {version.titulo}</strong></p>
      <p className="mt-2 text-sm">{version.descricao}</p>
      {version.criterios_aceite && <p className="mt-2 text-sm">
        <strong>Critérios de aceite:</strong> {version.criterios_aceite}
      </p>}
    </details>)}
    {q.data?.length === 0 && <p className="text-muted text-sm">Nenhuma revisão localizada.</p>}
  </div>;
}

export default function RequirementCatalog({
  task, records, onChanged
}: { task: Task; records: Requirement[]; onChanged: () => Promise<void> }) {
  const [source, setSource] = useState("");
  const [preparedSource, setPreparedSource] = useState("");
  const [preview, setPreview] = useState<DraftRequirement[]>([]);
  const [editItem, setEditItem] = useState<Requirement | null>(null);
  const [revisions, setRevisions] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedCount = preview.filter((item) => item.selected && !item.duplicate).length;
  const visible = useMemo(() => records.filter((item) => {
    const text = [item.codigo, item.titulo, item.descricao, item.criterios_aceite].join(" ").toLowerCase();
    return (stateFilter === "all" || item.estado === stateFilter) &&
      (!term || text.includes(term.toLowerCase()));
  }), [records, term, stateFilter]);

  function updatePreview(index: number, patch: Partial<DraftRequirement>) {
    setPreview((rows) => rows.map((item, i) =>
      i === index ? { ...item, ...patch } : item));
  }
  function parseText() {
    setError(""); setMessage("");
    try {
      const rows = parseRequirements(source, { existing: records });
      setPreview(rows); setPreparedSource(source);
      setMessage(rows.length + " requisito(s) preparados. Nenhum dado foi salvo. Revise antes de importar.");
    } catch (reason) {
      setPreview([]); setPreparedSource(""); setError((reason as Error).message);
    }
  }
  async function importNow() {
    setError(""); setMessage(""); setBusy(true);
    try {
      if (source !== preparedSource) throw Error("O texto mudou. Organize novamente antes de salvar.");
      prepareImport(source, preview);
      const result = await importRequirementText(task.id, source, preview);
      await onChanged();
      setPreview([]); setPreparedSource(""); setSource("");
      setMessage(result.inserted + " requisito(s) importado(s); " + result.skipped +
        " código(s) já existente(s) ignorado(s).");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function updateSaved(next: Requirement) {
    setBusy(true); setError(""); setMessage("");
    try {
      await editRequirement(task.id, next.id, next);
      setEditItem(null);
      await onChanged();
      setMessage("Requisito salvo. Alterações e revisões preservadas.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function changeState(item: Requirement, next: Requirement["estado"]) {
    if (next === "arquivado" &&
      !window.confirm("Arquivar " + item.codigo + "? O histórico será preservado.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await changeRequirementState(task.id, item.id, next);
      await onChanged(); setEditItem(null);
      setMessage(item.codigo + ": situação alterada para " + next + ".");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="stack">
    <div className="generator-stats">
      <span><strong>{records.length}</strong> cadastrados</span>
      <span><strong>{records.filter((r) => r.estado === "aprovado").length}</strong> aprovados</span>
      <span><strong>{records.filter((r) => r.estado === "rascunho").length}</strong> rascunhos</span>
      <span><strong>{records.filter((r) => r.estado === "arquivado").length}</strong> arquivados</span>
    </div>
    <details className="generator-context" open={records.length === 0}>
      <summary>Importar requisitos de texto (prévia e revisão)</summary>
      <div className="stack mt-4">
        <label className="field">Cole a especificação, critérios de aceite ou regras de negócio
          <textarea rows={7} maxLength={30000} value={source} onChange={(e) => {
            setSource(e.target.value);
            if (preview.length) setMessage("Texto alterado. Organize novamente antes de importar.");
          }} placeholder="RF-001: O sistema deve..." />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onPress={parseText} isDisabled={busy || source.trim().length < 5}>
            <FileUp size={16} /> Organizar
          </Button>
          {!!preview.length && <>
            <Button variant="secondary" onPress={() => setPreview((rows) =>
              rows.map((row) => row.selected && !row.duplicate ?
                { ...row, estado: "aprovado" } : row))}>
              <Check size={16} /> Aprovar selecionados na prévia
            </Button>
            <Button onPress={() => void importNow()} isDisabled={busy || selectedCount === 0 ||
              source !== preparedSource}>
              <Save size={16} /> Salvar {selectedCount} revisado(s)
            </Button>
          </>}
        </div>
        {!!preview.length && <div className="stack">
          <p className="text-muted text-sm">Classificações automáticas são apenas sugestões. Revise código, origem e aceitação.</p>
          {preview.map((item, index) => <article className="generator-case" key={index}>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={item.selected && !item.duplicate}
                disabled={item.duplicate}
                onChange={(e) => updatePreview(index, { selected: e.target.checked })} />
              <strong className="text-sm">Incluir {item.codigo}
                {item.suggested ? " · classificação sugerida" : ""}
                {item.duplicate ? " · possível duplicata" : ""}</strong>
            </label>
            <div className="form-grid mt-3">
              <label className="field">Tipo<select value={item.tipo} onChange={(e) => {
                const tipo = e.target.value;
                updatePreview(index, { tipo,
                  codigo: item.codigo.replace(/^[A-Z]+/, tipo), duplicate: false });
              }}>
                {["RF","RNF","RN","CA"].map((value) => <option key={value}>{value}</option>)}
              </select></label>
              <label className="field">Código<input maxLength={10} value={item.codigo}
                onChange={(e) => updatePreview(index, { codigo: e.target.value.toUpperCase(), duplicate: false,
                  selected: true })} /></label>
              <label className="field grow-2">Título<input maxLength={240} value={item.titulo}
                onChange={(e) => updatePreview(index, { titulo: e.target.value })} /></label>
              <label className="field">Situação<select value={item.estado}
                onChange={(e) => updatePreview(index, {
                  estado: e.target.value === "aprovado" ? "aprovado" : "rascunho"
                })}><option value="rascunho">Rascunho</option><option value="aprovado">Aprovado</option></select>
              </label>
            </div>
            <div className="stack mt-3">
              <label className="field">Descrição<textarea rows={3} maxLength={6000} value={item.descricao}
                onChange={(e) => updatePreview(index, { descricao: e.target.value })} /></label>
              <label className="field">Critérios de aceite<textarea rows={2} maxLength={4000}
                value={item.criterios_aceite} onChange={(e) =>
                  updatePreview(index, { criterios_aceite: e.target.value })} /></label>
            </div>
            <p className="text-muted text-sm mt-2">Trecho de origem: {(item.origem_trecho || item.descricao).slice(0,220)}</p>
          </article>)}
        </div>}
      </div>
    </details>
    <div className="section-heading mt-4"><h3 className="font-semibold">Requisitos cadastrados</h3>
      <span className="count-pill">{visible.length}</span></div>
    <div className="flex flex-wrap gap-2">
      <label className="field grow-2">Buscar<input value={term} onChange={(e) => setTerm(e.target.value)}
        placeholder="Código, título, regra..." /></label>
      <label className="field">Situação<select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
        <option value="all">Todos</option><option value="rascunho">Rascunhos</option>
        <option value="aprovado">Aprovados</option><option value="arquivado">Arquivados</option>
      </select></label>
    </div>
    {visible.length === 0 && <p className="text-muted text-sm">Nenhum requisito encontrado neste filtro.</p>}
    {visible.map((item) => <article className="requirement-row" key={item.id}>
      <div className="section-heading">
        <div><strong>{item.codigo} · {item.titulo}</strong>
          <p className="text-muted text-sm">{item.tipo} · {item.estado} · revisão {item.versao || 1}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onPress={() => {
            setEditItem((current) => current?.id === item.id ? null : { ...item });
            setRevisions(null);
          }}><Pencil size={14} /> Editar</Button>
          {item.estado !== "aprovado" && item.estado !== "arquivado" &&
            <Button size="sm" onPress={() => void changeState(item, "aprovado")} isDisabled={busy}>
              Aprovar
            </Button>}
          {item.estado !== "arquivado" &&
            <Button size="sm" variant="secondary" onPress={() => void changeState(item, "arquivado")}
              isDisabled={busy}>Arquivar</Button>}
        </div>
      </div>
      <p className="text-sm mt-3">{item.descricao}</p>
      {item.criterios_aceite && <p className="text-sm mt-2"><strong>Aceite:</strong> {item.criterios_aceite}</p>}
      <button type="button" className="secondary-link mt-3" onClick={() =>
        setRevisions((v) => v === item.id ? null : item.id)}>Ver revisões</button>
      {revisions === item.id && <RevisionHistory taskId={task.id} requirementId={item.id} />}
      {editItem?.id === item.id && <form className="stack mt-4" onSubmit={(event) => {
        event.preventDefault();
        void updateSaved(editItem);
      }}>
        <div className="form-grid">
          <label className="field">Tipo<select value={editItem.tipo} onChange={(e) => {
            const tipo = e.target.value as Requirement["tipo"];
            setEditItem({ ...editItem, tipo, codigo: editItem.codigo.replace(/^[A-Z]+/, tipo) });
          }}>{["RF","RNF","RN","CA"].map((v)=><option key={v}>{v}</option>)}</select></label>
          <label className="field">Código<input maxLength={10} value={editItem.codigo}
            onChange={(e) => setEditItem({ ...editItem, codigo: e.target.value.toUpperCase() })} /></label>
          <label className="field grow-2">Título<input maxLength={240} value={editItem.titulo}
            onChange={(e) => setEditItem({ ...editItem, titulo: e.target.value })} /></label>
          <label className="field">Situação<select value={editItem.estado === "arquivado" ?
            "rascunho" : editItem.estado}
            onChange={(e) => setEditItem({ ...editItem,
              estado: e.target.value === "aprovado" ? "aprovado" : "rascunho" })}>
            <option value="rascunho">Rascunho</option><option value="aprovado">Aprovado</option></select>
          </label>
        </div>
        <label className="field">Descrição<textarea rows={3} maxLength={6000} value={editItem.descricao}
          onChange={(e) => setEditItem({ ...editItem, descricao: e.target.value })} /></label>
        <label className="field">Critérios de aceite<textarea rows={3} maxLength={4000}
          value={editItem.criterios_aceite} onChange={(e) =>
            setEditItem({ ...editItem, criterios_aceite: e.target.value })} /></label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" isDisabled={busy}><Save size={16} /> Salvar alterações</Button>
          <Button type="button" variant="secondary" onPress={() => setEditItem(null)}>
            <X size={16} /> Cancelar</Button>
        </div>
      </form>}
    </article>)}
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
  </div>;
}
