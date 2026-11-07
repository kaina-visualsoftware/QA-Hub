import { useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileCheck2, FileText } from "lucide-react";
import type { Task, Scenario } from "../../lib/contracts";
import { supabase } from "../../lib/supabase";
import {
  buildExecutionReport, cleanDocumentName, saveTfDocument
} from "../../lib/legacy/qa-phase2.mjs";
import type { TfDocument } from "../../lib/legacy/qa-phase2.mjs";

function downloadMarkdown(content: string, name: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = cleanDocumentName(name);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DocumentsPanel({
  task, scenarios, userId
}: { task: Task; scenarios: Scenario[]; userId: string }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const docs = useQuery({
    queryKey: ["documents", userId, task.id],
    queryFn: async () => {
      const { data, error: queryError } = await supabase.from("qa_documentos")
        .select("id,tarefa_id,tipo,titulo,conteudo,versao,created_at")
        .eq("tarefa_id", task.id).order("created_at", { ascending: false }).limit(100);
      if (queryError) throw queryError;
      return (data ?? []) as TfDocument[];
    }
  });
  const selected = useMemo(() => docs.data?.find((item) => item.id === selectedId),
    [docs.data, selectedId]);
  const report = useMemo(() => buildExecutionReport(task, scenarios), [task, scenarios]);
  const save = useMutation({
    mutationFn: () => saveTfDocument(supabase, {
      taskId: task.id, type: "relatorio",
      title: "Relatório de execução — " + task.titulo.slice(0, 190),
      content: draft || report, source: "execucao"
    }),
    onSuccess: async (record) => {
      setNote("Relatório salvo como versão " + record.versao + ".");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["documents", userId, task.id] });
    },
    onError: (e) => setError(e.message)
  });

  return <section className="panel mt-5" aria-labelledby="documents-heading">
    <div className="section-heading">
      <div>
        <p className="eyebrow">HISTÓRICO VINCULADO</p>
        <h2 id="documents-heading">Posts e relatórios</h2>
        <p className="text-muted">Versões privadas imutáveis, consultáveis sem acessar o gerador antigo.</p>
      </div>
      <span className="count-pill">{docs.data?.length ?? 0} documento(s)</span>
    </div>
    <div className="generator-docs mt-5">
      <div className="stack">
        <h3 className="font-semibold">Gerar relatório de execução</h3>
        <p className="text-muted text-sm">
          Criado exclusivamente a partir do status e dos resultados já registrados.
          Nenhuma aprovação é inferida.
        </p>
        <label className="field">Texto do relatório (editável antes de salvar)
          <textarea rows={12} value={draft || report}
            onChange={(event) => setDraft(event.target.value)} maxLength={80000} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onPress={() => downloadMarkdown(draft || report, "relatorio-" + task.codigo)}>
            <Download size={16} /> Baixar Markdown
          </Button>
          <Button isDisabled={save.isPending || !scenarios.length} onPress={() => void save.mutateAsync()}>
            <FileCheck2 size={16} /> Salvar versão
          </Button>
        </div>
        {note && <p className="notice" role="status">{note}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
      </div>
      <div>
        <h3 className="font-semibold">Versões existentes</h3>
        {docs.isPending && <p className="text-muted mt-3" role="status">Carregando documentos…</p>}
        {docs.isError && <p className="notice error mt-3" role="alert">{docs.error.message}</p>}
        {docs.isSuccess && docs.data.length === 0 &&
          <p className="text-muted mt-3 text-sm">Nenhum post ou relatório salvo nesta TF.</p>}
        <div className="stack mt-3">
          {docs.data?.map((item) => <button key={item.id}
            className={"document-choice " + (item.id === selectedId ? "selected" : "")}
            onClick={() => setSelectedId((id) => id === item.id ? null : item.id)}>
            <FileText size={18} />
            <span><strong>{item.titulo}</strong>
              <small>{item.tipo === "post" ? "Post" : "Relatório"} · versão {item.versao} ·
                {" " + new Date(item.created_at).toLocaleDateString("pt-BR")}</small>
            </span>
          </button>)}
        </div>
      </div>
    </div>
    {selected && <div className="stack mt-6">
      <h3 className="font-semibold">{selected.titulo} — versão {selected.versao}</h3>
      <textarea className="readonly-doc" readOnly rows={14} value={selected.conteudo}
        aria-label="Conteúdo do documento selecionado" />
      <div><Button variant="secondary" onPress={() => downloadMarkdown(selected.conteudo, selected.titulo)}>
        <Download size={16} /> Baixar esta versão
      </Button></div>
    </div>}
  </section>;
}
