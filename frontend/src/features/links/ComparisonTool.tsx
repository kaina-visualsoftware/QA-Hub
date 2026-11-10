import { useRef, useState } from "react";
import {ToastNotice} from "../../components/ui/Toasts";
import { Button } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ClipboardCopy, Database, EyeOff } from "lucide-react";
import { compareTextLines, compareXmlDocuments } from "../../lib/legacy/qa-release-core.mjs";
import type { TextDiff, XmlDiff } from "../../lib/legacy/qa-release-core.mjs";
import { recordComparison } from "../../lib/legacy/qa-phase3.mjs";
import type { Task } from "../../lib/contracts";
import { supabase } from "../../lib/supabase";

type DiffResult =
  | { kind: "text"; output: TextDiff }
  | { kind: "xml"; output: XmlDiff };
const LIMIT = 150000;
const PAGE_SIZE = 100;

function validateXmlInput(value: string, label: string) {
  if (!value.trim()) throw Error("Informe o XML " + label + ".");
  if (value.length > LIMIT) throw Error("XML " + label + " ultrapassa 150 mil caracteres.");
  // Do not process document types, entities, or stylesheet instructions,
  // even when a browser would normally suppress external resolution.
  if (/<\s*!\s*(?:DOCTYPE|ENTITY)\b|<\?\s*xml-stylesheet\b/i.test(value)) {
    throw Error("XML com DTD, entidades ou referências de estilo externas não é permitido.");
  }
}

export default function ComparisonTool({ task, userId = "", initialMode = "text", embedded=false }:
  { task?: Task; userId?: string; initialMode?: "text" | "xml"; embedded?:boolean }) {
  const client = useQueryClient();
  const [mode, setMode] = useState<"text" | "xml">(initialMode);
  const [original, setOriginal] = useState("");
  const [updated, setUpdated] = useState("");
  const modeDrafts = useRef({
    text: { original:"", updated:"" },
    xml: { original:"", updated:"" }
  });
  const [ignoreSpaces, setIgnoreSpaces] = useState(true);
  const [result, setResult] = useState<DiffResult | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [hideEqual, setHideEqual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const owner = Boolean(task && task.user_id === userId);

  const rows = result?.kind === "text"
    ? result.output.changes.map(([prefix, line]) => ({
      prefix, text: line
    })).filter((line) => !hideEqual || line.prefix !== " ")
    : (result?.output.lines ?? []).map((line) => ({
      prefix: line.startsWith("ADICIONADO ") ? "+" : line.startsWith("REMOVIDO ") ? "-" : "~",
      text: line
    }));
  const output = result?.output;
  const added = output?.added ?? 0;
  const removed = output?.removed ?? 0;
  const changed = result?.kind === "text" ? 0 : (output?.changed ?? 0);

  function invalidateResult() {
    setResult(null); setSaved(false); setMessage(""); setError(""); setVisible(PAGE_SIZE);
  }
  function chooseMode(next:"text"|"xml"){
    if(next===mode)return;
    // Separate drafts let QAs switch formats without losing pasted data.
    modeDrafts.current[mode] = {original,updated};
    setMode(next);
    setOriginal(modeDrafts.current[next].original);
    setUpdated(modeDrafts.current[next].updated);
    invalidateResult();
  }

  function compare() {
    setError(""); setMessage(""); setSaved(false);
    setVisible(PAGE_SIZE);
    try {
      if (!original.trim() || !updated.trim()) {
        throw Error("Informe as duas versões para comparar.");
      }
      if (original.length > LIMIT || updated.length > LIMIT) {
        throw Error("Cada entrada deve ter até 150 mil caracteres.");
      }
      if (mode === "xml") {
        validateXmlInput(original, "A");
        validateXmlInput(updated, "B");
        setResult({ kind: "xml", output: compareXmlDocuments(original, updated, ignoreSpaces) });
      } else {
        setResult({ kind: "text", output: compareTextLines(original, updated) });
      }
    } catch (cause) { setResult(null); setError((cause as Error).message); }
  }
  function reportText() {
    if (!result) return "";
    const header = "Comparação " + (mode === "xml" ? "XML" : "de texto") + " — " +
      added + " adicionados, " + removed + " removidos, " + changed + " alterados";
    const body = result.kind === "text"
      ? result.output.changes.map(([prefix, line]) => prefix + " " + line).join("\n")
      : result.output.lines.join("\n");
    return header + "\n\n" + body;
  }
  async function copyReport() {
    setError(""); setMessage("");
    try {
      await navigator.clipboard.writeText(reportText());
      setMessage("Relatório copiado localmente. Nenhum conteúdo foi enviado ao servidor.");
    } catch { setError("Cópia indisponível neste navegador. Selecione o texto manualmente."); }
  }
  async function saveCounters() {
    if (!result || !task || !owner || saving || saved) return;
    if (!window.confirm("Salvar somente as contagens na TF? Os textos e XML não serão enviados.")) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await recordComparison(supabase, {
        taskId: task.id, userId,
        type: result.kind === "xml" ? "diff_xml" : "diff_texto",
        values: { adicionados: added, removidos: removed, alterados: changed }
      });
      await client.invalidateQueries({ queryKey: ["qa-comparisons", userId, task.id] });
      setSaved(true);
      setMessage("Somente os indicadores foram registrados na TF. Os textos permanecem no navegador.");
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }
  return <section className="stack" aria-label={embedded?"Editor de comparações":undefined}
    aria-labelledby={embedded?undefined:"comparison-tool-title"}>
    {!embedded&&<div>
      <h3 id="comparison-tool-title" className="font-semibold">Comparação local de texto e XML</h3>
      <p className="text-muted text-sm mt-2">Nenhum conteúdo digitado é transmitido ou salvo.
        {task ? " Opcionalmente, registre somente as contagens na TF." : " A comparação é local e não precisa de TF."}</p>
    </div>}
    <div className={embedded?"qa-tools-compare-switch":"flex flex-wrap gap-2"}
      role={embedded?"group":undefined} aria-label={embedded?"Formato da comparação":undefined}>
      <button type="button" className={"filter-chip " + (mode === "text" ? "selected" : "")}
        aria-pressed={mode === "text"} onClick={() => chooseMode("text")}>
        Texto linha a linha
      </button>
      <button type="button" className={"filter-chip " + (mode === "xml" ? "selected" : "")}
        aria-pressed={mode === "xml"} onClick={() => chooseMode("xml")}>
        XML por estrutura
      </button>
    </div>
    <div className="compare-grid qa-tools-compare-inputs">
      <label className="field">
        {mode === "xml" ? "XML A (original)" : "Texto A (original)"}
        <textarea rows={9} spellCheck={false} maxLength={LIMIT}
          placeholder="Cole o conteúdo original" value={original}
          onChange={(event) => { setOriginal(event.target.value); invalidateResult(); }}/>
      </label>
      <label className="field">
        {mode === "xml" ? "XML B (novo)" : "Texto B (novo)"}
        <textarea rows={9} spellCheck={false} maxLength={LIMIT}
          placeholder="Cole o conteúdo atualizado" value={updated}
          onChange={(event) => { setUpdated(event.target.value); invalidateResult(); }}/>
      </label>
    </div>
    {mode === "xml" && <label className="flex gap-2 items-start text-sm">
      <input type="checkbox" checked={ignoreSpaces}
        onChange={(event) => { setIgnoreSpaces(event.target.checked); invalidateResult(); }}/>
      Ignorar espaços nas extremidades de valores XML (atributos, namespaces e hierarquia
      continuam sendo comparados).
    </label>}
    <div className={embedded?"qa-tools-compare-actions":"flex flex-wrap gap-2"}>
      <Button isDisabled={!original.trim() || !updated.trim()} onPress={compare}>
        <ArrowLeftRight size={16} /> Comparar {mode === "xml" ? "XML" : "textos"}
      </Button>
      <Button variant="secondary" onPress={() => { setOriginal(""); setUpdated(""); invalidateResult(); }}>
        Limpar entradas
      </Button>
    </div>
    {result && <div className="stack">
      <div className="generator-stats qa-tools-result-summary">
        <span><strong>{added}</strong> adicionado(s)</span>
        <span><strong>{removed}</strong> removido(s)</span>
        <span><strong>{changed}</strong> alterado(s)</span>
        {result.kind === "xml" && <span><strong>{result.output.total}</strong> diferenças encontradas</span>}
      </div>
      {mode === "xml" && result.kind === "xml" && result.output.total > 3000 &&
        <p className="notice error">Há mais de 3.000 diferenças. A visualização mostra as primeiras
          3.000, mas a contagem inclui todas.</p>}
      {result.kind === "text" && <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hideEqual}
          onChange={(event) => { setHideEqual(event.target.checked); setVisible(PAGE_SIZE); }}/>
        Ocultar linhas iguais
      </label>}
      <div className="compare-result" role="region" aria-label="Diferenças encontradas">
        {rows.length === 0 && <p className="text-muted text-sm">Nenhuma diferença encontrada.</p>}
        {rows.slice(0, visible).map((row, index) => <div key={index}
          className={"compare-line " + (row.prefix === "+" ? "added" : row.prefix === "-" ? "removed" :
            row.prefix === "~" ? "changed" : "equal")}>
          <span className="compare-prefix" aria-hidden="true">{row.prefix}</span>
          <span className="compare-value">{row.text || "\u00a0"}</span>
        </div>)}
      </div>
      {rows.length > visible && <div>
        <Button variant="secondary" onPress={() => setVisible((v) => v + PAGE_SIZE)}>
          Mostrar mais diferenças ({Math.min(visible, rows.length)} de {rows.length})
        </Button>
      </div>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onPress={() => void copyReport()}>
          <ClipboardCopy size={16}/> Copiar relatório local
        </Button>
        {task && <Button isDisabled={!owner || saving || saved} onPress={() => void saveCounters()}>
          <Database size={16}/> {saved ? "Indicadores registrados" : "Salvar somente contagens na TF"}
        </Button>}
      </div>
      <p className="text-muted text-sm flex items-center gap-2">
        <EyeOff size={16}/> Os valores originais não integram o registro.
      </p>
    </div>}
    <ToastNotice message={message} tone="success"/>
    <ToastNotice message={error} tone="error"/>
  </section>;
}
