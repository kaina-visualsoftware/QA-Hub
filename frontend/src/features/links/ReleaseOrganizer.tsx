import { useState } from "react";
import { Button } from "@heroui/react";
import { ClipboardCopy, ListChecks, PackageCheck } from "lucide-react";
import {
  organizeRelease, reviewRelease
} from "../../lib/legacy/qa-release-core.mjs";
import type { Task } from "../../lib/contracts";

const INPUT_LIMIT = 100000;
type Organized = ReturnType<typeof organizeRelease>;
type Reviewed = ReturnType<typeof reviewRelease>;

export default function ReleaseOrganizer({ task, version }: { task: Task; version: string }) {
  const [raw, setRaw] = useState("");
  const [team, setTeam] = useState("");
  const [defaultStatus, setDefaultStatus] = useState<"11"|"12">("12");
  const [announcement, setAnnouncement] = useState("");
  const [compat, setCompat] = useState("");
  const [signature, setSignature] = useState("");
  const [organized, setOrganized] = useState<Organized | null>(null);
  const [reviewed, setReviewed] = useState<Reviewed | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const matches = organized?.numbers.some((item) =>
    String(item) === String(task.codigo ?? "").trim().replace(/^#/, ""));

  function clearResults() {
    setOrganized(null); setReviewed(null); setError(""); setMessage("");
  }
  function organize() {
    setError(""); setMessage(""); setReviewed(null);
    try {
      if (raw.length > INPUT_LIMIT || team.length > 10000)
        throw Error("Lista ou equipe muito extensa.");
      setOrganized(organizeRelease({ raw, version, team, defaultStatus }));
    } catch (reason) { setOrganized(null); setError((reason as Error).message); }
  }
  function review() {
    setError(""); setMessage("");
    try {
      if (raw.length > INPUT_LIMIT || announcement.length > INPUT_LIMIT)
        throw Error("Lista ou comunicado excedeu 100 mil caracteres.");
      setReviewed(reviewRelease({ raw, announcement, version, compat, signature }));
    } catch (reason) { setReviewed(null); setError((reason as Error).message); }
  }
  async function copy(value: string) {
    setError(""); setMessage("");
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Conteúdo copiado. Não foi enviado ao servidor.");
    } catch {
      setError("A cópia não está disponível. Selecione o texto manualmente.");
    }
  }
  return <details className="generator-context" aria-label="Organizador local de releases">
    <summary>Organizar lista e revisar comunicado de release (local)</summary>
    <div className="stack mt-4">
      <p className="text-muted text-sm">
        O processamento ocorre somente neste navegador, sem IA. Para associar a TF à release,
        use o botão separado de confirmação acima.
      </p>
      <label className="field">Lista autorizada de tarefas
        <textarea rows={7} maxLength={INPUT_LIMIT} spellCheck={false}
          placeholder={"Status 12\n#67866 — BUG — Desconto\nStatus 11\n#199727 — MELHORIA — Interface"}
          value={raw} onChange={(event) => { setRaw(event.target.value); clearResults(); }} />
      </label>
      <div className="form-grid">
        <label className="field">Status padrão
          <select value={defaultStatus} onChange={(event) => {
            setDefaultStatus(event.target.value as "11"|"12"); clearResults();
          }}>
            <option value="12">12 — em build</option>
            <option value="11">11 — aguardando versão</option>
          </select>
        </label>
        <label className="field grow-2">Equipe / sprints (opcional, um nome por linha)
          <textarea rows={3} maxLength={10000} value={team} onChange={(event) => {
            setTeam(event.target.value); clearResults();
          }} />
        </label>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button variant="secondary" isDisabled={!raw.trim() || !version.trim()}
          onPress={organize}><ListChecks size={16}/> Organizar lista</Button>
      </div>
      {organized && <section className="stack" aria-label="Lista organizada">
        <div className="generator-stats">
          <span><strong>{organized.numbers.length}</strong> tarefas localizadas</span>
          <span><strong>{organized.warnings.length}</strong> alertas de revisão</span>
        </div>
        <p className={"text-sm " + (matches ? "" : "text-muted")}>
          {matches
            ? "A TF em foco aparece na lista pelo número exato. Confirme o vínculo na ação acima."
            : "A TF em foco não foi encontrada na lista pelo número exato. Não há associação automática."}
        </p>
        <label className="field">Lista organizada (somente leitura)
          <textarea rows={10} readOnly value={organized.text} />
        </label>
        {organized.warnings.length > 0 && <details className="generator-context">
          <summary>Conferir {organized.warnings.length} alerta(s)</summary>
          <ul className="requirement-linked">
            {organized.warnings.slice(0,80).map((warning, i) => <li key={i}>{warning}</li>)}
          </ul>
          {organized.warnings.length > 80 && <p className="text-muted text-sm">
            Exibidos os primeiros 80 avisos.
          </p>}
        </details>}
        <div><Button variant="secondary" onPress={() => void copy(organized.text)}>
          <ClipboardCopy size={16}/> Copiar lista organizada
        </Button></div>
      </section>}
      <label className="field">Comunicado de release (opcional, para revisão)
        <textarea rows={6} maxLength={INPUT_LIMIT} spellCheck={false}
          placeholder="Cole o comunicado e compare com a lista autorizada."
          value={announcement} onChange={(event) => {
            setAnnouncement(event.target.value); setReviewed(null);
          }} />
      </label>
      <div className="form-grid">
        <label className="field">Compatibilidades (opcional)
          <textarea rows={2} maxLength={4000} value={compat}
            onChange={(event) => { setCompat(event.target.value); setReviewed(null); }} />
        </label>
        <label className="field">Assinatura (opcional)
          <input maxLength={240} value={signature}
            onChange={(event) => { setSignature(event.target.value); setReviewed(null); }} />
        </label>
      </div>
      <div><Button variant="secondary" isDisabled={!raw.trim() || !announcement.trim()}
        onPress={review}><PackageCheck size={16}/> Conferir comunicado</Button></div>
      {reviewed && <div className="stack">
        <label className="field">Relatório de divergências (uso interno)
          <textarea rows={7} readOnly value={reviewed.report} />
        </label>
        <label className="field">Comunicado revisado
          <textarea rows={7} readOnly value={reviewed.cleaned} />
        </label>
        <label className="field">BBCode preparado
          <textarea rows={7} readOnly value={reviewed.bbcode} />
        </label>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onPress={() => void copy(reviewed.cleaned)}>
            <ClipboardCopy size={16}/> Copiar comunicado
          </Button>
          <Button variant="secondary" onPress={() => void copy(reviewed.bbcode)}>
            Copiar BBCode
          </Button>
          <Button variant="secondary" onPress={() => void copy(reviewed.report)}>
            Copiar relatório
          </Button>
        </div>
      </div>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
    </div>
  </details>;
}
