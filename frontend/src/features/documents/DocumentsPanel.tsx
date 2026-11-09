import { useEffect, useMemo, useRef, useState } from "react";
import {ToastNotice} from "../../components/ui/Toasts";
import { Button } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCopy, Download, FileCheck2, RefreshCw } from "lucide-react";
import { listEvidenceFiles } from "../evidence/evidence-files";
import { buildQaReportPdf } from "./qa-report-pdf";
import type { Task, Scenario } from "../../lib/contracts";
import { supabase } from "../../lib/supabase";
import {
  buildExecutionReport, buildTestedSummary, cleanDocumentName, executionSummary, saveTfDocument
} from "../../lib/legacy/qa-phase2.mjs";

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
  task, scenarios, userId, focusOnOpen = false
}: { task: Task; scenarios: Scenario[]; userId: string; focusOnOpen?: boolean }) {
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  // null means live, generated from saved scenarios; "" is a real, editable empty draft.
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busyPdf,setBusyPdf]=useState(false);
  const evidenceFiles = useQuery({
    queryKey:["evidence-files",userId,task.id],
    queryFn:()=>listEvidenceFiles(supabase,task.id),
    enabled:task.user_id===userId
  });
  const report = useMemo(() => buildExecutionReport(task, scenarios), [task, scenarios]);
  const testedSummary = useMemo(() => buildTestedSummary(scenarios), [scenarios]);
  const counts = useMemo(() => executionSummary(scenarios), [scenarios]);
  const content = draft ?? report;
  useEffect(() => {
    if (!focusOnOpen) return;
    const frame = requestAnimationFrame(() => {
      headingRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      headingRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusOnOpen]);
  async function downloadPdf(text:string,name:string){
    if(busyPdf||!text.trim())return;
    setError("");setBusyPdf(true);
    try{
      const data=await buildQaReportPdf({
        task,scenarios,content:text,files:evidenceFiles.data??[]
      });
      const blob=new Blob([new Uint8Array(data)],{type:"application/pdf"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");link.href=url;
      link.download=cleanDocumentName(name,"pdf");
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),15000);
      setNote("PDF gerado localmente. O relatório e a TF não foram modificados.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Não foi possível exportar PDF.");
    }finally{setBusyPdf(false);}
  }

  const save = useMutation({
    mutationFn: () => saveTfDocument(supabase, {
      taskId: task.id, type: "relatorio",
      title: "Relatório de execução — " + task.titulo.slice(0, 190),
      content, source: draft === null ? "execucao" : "manual"
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
        <h2 id="documents-heading" ref={headingRef} tabIndex={-1}>Criar relatório</h2>
        <p className="text-muted">Os posts e relatórios salvos são visualizados na aba Entregáveis.</p>
      </div>
    </div>
    <div className="generator-docs mt-5">
      <div className="stack">
        <h3 className="font-semibold">Gerar relatório de execução</h3>
        <p className="text-muted text-sm">
          Criado exclusivamente a partir do status e dos resultados já registrados.
          Nenhuma aprovação é inferida.
        </p>
        <p className="text-muted text-sm">
          {counts.finalizados} de {counts.total} cenário(s) com execução registrada.
          {counts.nao_executado > 0 ? " Os pendentes não aparecem em O que foi testado." : ""}
        </p>
        <details className="qa-report-summary-details">
          <summary>Consultar o que foi testado</summary>
          <label className="field mt-3">O que foi testado (somente resultados salvos)
            <textarea rows={7} readOnly value={testedSummary}/>
          </label>
          <Button variant="secondary" onPress={() => {
            void navigator.clipboard.writeText(testedSummary)
              .then(() => setNote("Resumo copiado. Revise antes de utilizar."))
              .catch(() => setError("Não foi possível copiar. Selecione o texto acima manualmente."));
          }}>
            <ClipboardCopy size={16}/> Copiar o que foi testado
          </Button>
        </details>

        <label className="field">Prévia do relatório (editável antes de salvar)
          <textarea rows={9} value={content} maxLength={80000}
            onChange={(event) => { setDraft(event.target.value); setNote(""); }} />
        </label>
        {draft !== null && <div className="stack">
          <p className="text-muted text-sm" role="status">
            Edição manual em andamento. Mudanças posteriores nos cenários não substituem este texto.
            Para recuperar a versão baseada nos resultados salvos, use Atualizar prévia.
          </p>
          <div><Button variant="secondary" onPress={() => {
            if (draft.trim() && !window.confirm(
              "Substituir a edição manual pela versão atual dos cenários salvos?"
            )) return;
            setDraft(null); setNote("");
          }}><RefreshCw size={16} /> Atualizar prévia</Button></div>
        </div>}
        <div className="flex flex-wrap gap-2">
          <Button isDisabled={!content.trim()||busyPdf}
            onPress={()=>void downloadPdf(content,"relatorio-"+(task.codigo||task.id))}>
            <Download size={16}/>{busyPdf?"Gerando PDF…":"Exportar PDF"}
          </Button>
          <Button variant="secondary" isDisabled={!content.trim()}
            onPress={() => downloadMarkdown(content, "relatorio-" + task.codigo)}>
            <Download size={16} /> Baixar Markdown
          </Button>
          <Button isDisabled={save.isPending || !scenarios.length || !content.trim() || content.length > 80000}
            onPress={() => save.mutate()}>
            <FileCheck2 size={16} /> Salvar versão
          </Button>
        </div>
        {evidenceFiles.isError&&<p className="notice error" role="alert">
          A relação de anexos não foi carregada. O PDF poderá ser exportado sem ela.
        </p>}
        <ToastNotice message={note} tone="success"/>
        <ToastNotice message={error} tone="error"/>
      </div>
    </div>
  </section>;
}
