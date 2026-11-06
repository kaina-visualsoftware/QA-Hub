import { useState } from "react";
import { Button } from "@heroui/react";
import { Download, FileUp } from "lucide-react";
import type { Task } from "../../lib/contracts";
import {
  downloadRequirementSource, prepareRequirementFile, registerRequirementFile
} from "./requirements-data";
import type { PreparedFile, RequirementSource } from "./requirements-data";

function downloadBlob(file: Blob, name: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function SourcesView({
  task, userId, records, loading, error, onChanged
}: {
  task: Task; userId: string; records: RequirementSource[];
  loading: boolean; error?: string; onChanged: () => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<PreparedFile | null>(null);
  const [manualText, setManualText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [readingFile, setReadingFile] = useState<string | null>(null);
  async function prepare() {
    if (!file) return;
    setBusy(true); setFailure(""); setMessage("");
    try {
      const item = await prepareRequirementFile(file, manualText);
      if (records.some((source) => source.hash === item.hash)) {
        throw Error("O conteúdo desse arquivo já foi anexado à TF.");
      }
      setPending(item);
      setMessage("Arquivo verificado. Revise os metadados e confirme para registrar uma versão privada.");
    } catch (reason) { setPending(null); setFailure((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function upload() {
    if (!pending) return;
    setBusy(true); setMessage(""); setFailure("");
    try {
      const result = await registerRequirementFile(task.id, userId, pending);
      await onChanged();
      setMessage("Arquivo anexado com sucesso · versão " + result.version + ".");
      setFile(null); setPending(null); setManualText("");
    } catch (reason) { setFailure((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function download(item: RequirementSource) {
    setReadingFile(item.id); setFailure("");
    try {
      const blob = await downloadRequirementSource(item);
      downloadBlob(blob, item.nome_arquivo || "documento");
    } catch (reason) { setFailure((reason as Error).message); }
    finally { setReadingFile(null); }
  }
  return <div className="stack">
    <p className="text-muted text-sm">
      PDF/DOCX são lidos localmente com carregamento sob demanda dos parsers.
      PDFs digitalizados não possuem OCR; nesses casos use o texto manual.
      Revise sempre a prévia antes de confirmar o upload.
    </p>
    <p className="text-muted text-sm">
      O arquivo original é armazenado no bucket privado da TF. Versões registradas não podem
      ser substituídas ou excluídas. Nenhum arquivo é enviado automaticamente à IA.
    </p>
    <div className="generator-context">
      <h3 className="font-semibold">Anexar documento de requisitos</h3>
      <label className="field mt-3">Arquivo PDF, DOCX, TXT ou MD (até 10 MB)
        <input type="file" accept=".pdf,.docx,.txt,.md"
          onChange={(e) => { setFile(e.currentTarget.files?.[0] ?? null);
            setPending(null); setFailure(""); setMessage(""); }} />
      </label>
      <label className="field mt-3">
        Substituir extração automática por texto manual (opcional; até 30 mil caracteres)
        <textarea rows={4} maxLength={30000} value={manualText}
          onChange={(e) => { setManualText(e.target.value); setPending(null); }}
          placeholder="O navegador extrai texto de PDF/DOCX/TXT/MD localmente. Cole aqui apenas se precisar corrigir a extração." />
      </label>
      <div className="flex flex-wrap gap-2 mt-4">
        <Button variant="secondary" isDisabled={!file || busy} onPress={() => void prepare()}>
          <FileUp size={16} /> Verificar arquivo
        </Button>
        <Button isDisabled={!pending || busy} onPress={() => void upload()}>Anexar versão privada</Button>
      </div>
      {pending && <div className="mt-3 text-sm stack">
        <p><strong>{pending.file.name}</strong> · {pending.size.toLocaleString("pt-BR")} bytes</p>
        <p>SHA-256: <code className="requirement-hash">{pending.hash}</code></p>
        {pending.warning && <p className="notice">{pending.warning}</p>}
        <label className="field">Texto que será associado ao arquivo (prévia de leitura)
          <textarea readOnly rows={5} value={pending.text} /></label>
        <p className="text-muted text-sm">
          O cadastro do requisito não é automático: após anexar, utilize o texto na aba Requisitos para
          importar somente os itens revisados.
        </p>
      </div>}
    </div>
    <div className="section-heading mt-4">
      <h3 className="font-semibold">Fontes existentes</h3>
      <span className="count-pill">{records.length}</span>
    </div>
    {loading && <p role="status" className="notice">Carregando fontes privadas…</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {!loading && !error && records.length === 0 &&
      <p className="text-muted text-sm">Nenhuma fonte salva na TF.</p>}
    {records.map((item) => <article key={item.id} className="requirement-row">
      <div className="section-heading">
        <div>
          <strong>{item.tipo_fonte === "arquivo" ? item.nome_arquivo : "Texto importado da TF"}</strong>
          <p className="text-muted text-sm">
            {item.tipo_fonte === "arquivo" ? "Arquivo" : "Texto"} · versão {item.versao} ·
            {" " + new Date(item.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
        {item.tipo_fonte === "arquivo" &&
          <Button size="sm" variant="secondary" isDisabled={readingFile === item.id}
            onPress={() => void download(item)}>
            <Download size={15} /> Baixar original
          </Button>}
      </div>
      {item.texto_extraido && <details className="generator-context mt-3">
        <summary>Consultar texto registrado (somente leitura)</summary>
        <textarea readOnly className="mt-3" rows={6} value={item.texto_extraido} />
      </details>}
    </article>)}
    {message && <p role="status" className="notice">{message}</p>}
    {failure && <p role="alert" className="notice error">{failure}</p>}
  </div>;
}
