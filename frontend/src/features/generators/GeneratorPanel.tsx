import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, FileCheck2, Send, WandSparkles, RotateCcw } from "lucide-react";
import {combinedInstructions,generatorPresets} from "./ai-presets";
import type { Task, Scenario } from "../../lib/contracts";
import { supabase } from "../../lib/supabase";
import {
  composeFullTaskContext, fetchTaskSupport, sanitizeAiContext
} from "../../lib/legacy/qa-test-context.mjs";
import {
  composeRequirementContext, loadApprovedRequirements, recordRequirementUsage
} from "../../lib/legacy/qa-requirements-context.mjs";
import {
  attachReviewedCases, markScenarioDuplicates, parseGeneratedCases
} from "../../lib/legacy/qa-workspace.mjs";
import type { GeneratedCase } from "../../lib/legacy/qa-workspace.mjs";
import {
  formatGeneratedPost, validatePostStructure
} from "../../lib/legacy/qa-post-format.mjs";
import {
  saveTfDocument
} from "../../lib/legacy/qa-phase2.mjs";
import { generateWithNvidia } from "./stream";
import type { GeneratorMode } from "./stream";

type GeneratorAssembly =
  | { kind: "ready"; taskContext: ReturnType<typeof composeFullTaskContext>;
      approved: ReturnType<typeof composeRequirementContext> }
  | { kind: "error"; error: string };

type Props = {
  task: Task;
  userId: string;
  scenarios: Scenario[];
  mode: GeneratorMode;
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Falha ao executar a operação.";
}

function editableCopy(items: GeneratedCase[]) {
  return items.map((item) => ({
    ...item, selected: item.selected !== false,
    source_index: item.source_index || crypto.randomUUID()
  }));
}

export default function GeneratorPanel({ task, userId, scenarios, mode }: Props) {
  const client = useQueryClient();
  const [extra, setExtra] = useState("");
  const [preset, setPreset] = useState("essencial");
  const [selected, setSelected] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [partialConsent, setPartialConsent] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [raw, setRaw] = useState("");
  const [content, setContent] = useState("");
  const [cases, setCases] = useState<GeneratedCase[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [dirtyOutput, setDirtyOutput] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [generationId, setGenerationId] = useState(() => crypto.randomUUID());
  const controller = useRef<AbortController | null>(null);
  const formOwn = task.user_id === userId;

  const requirements = useQuery({
    queryKey: ["gen-requirements", userId, task.id],
    queryFn: () => loadApprovedRequirements(supabase, task, userId),
    enabled: formOwn
  });
  const support = useQuery({
    queryKey: ["gen-support", userId, task.id],
    queryFn: () => fetchTaskSupport(supabase, task, userId),
    enabled: formOwn
  });
  useEffect(() => {
    if (requirements.data) setSelected(requirements.data.map((item) => item.id));
  }, [requirements.data]);
  useEffect(() => {
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    setRaw(""); setContent(""); setCases([]); setConsent(false);
    setPreset("essencial");setExtra("");
    setMessage(""); setError(""); setDirtyOutput(false);
  }, [task.id, mode]);

  const assembly = useMemo<GeneratorAssembly | null>(() => {
    if (!support.data || !requirements.data) return null;
    try {
      const taskContext = composeFullTaskContext(task, support.data, { limit: 30000 });
      const approved = composeRequirementContext(
        requirements.data, selected, sanitizeAiContext(combinedInstructions(mode,preset,extra)),
        { taskId: task.id, limit: 20000 }
      );
      return { kind: "ready", taskContext, approved };
    } catch (reason) {
      return { kind: "error", error: messageOf(reason) };
    }
  }, [support.data, requirements.data, task, selected, extra, mode, preset]);
  const generationError = assembly?.kind === "error" ? assembly.error : "";
  const context = assembly?.kind === "ready" ? assembly : null;
  const missingSources = context?.taskContext.failedSources ?? [];
  useEffect(()=>{
    setConsent(false);
    setPartialConsent(false);
  },[context?.taskContext.text,context?.approved.text]);
  const canSend = formOwn && !generating && !!context &&
    !requirements.isLoading && !support.isLoading &&
    !requirements.isError && !support.isError && consent &&
    (!missingSources.length || partialConsent);

  const reviewed = useMemo(() =>
    markScenarioDuplicates(cases, scenarios), [cases, scenarios]);
  const chosen = reviewed.filter((item) => item.selected && !item.duplicate);
  const postIssues = mode === "post" && content
    ? validatePostStructure(content) : [];

  function replaceCase(index: number, patch: Partial<GeneratedCase>) {
    setDirtyOutput(true);
    setCases((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  async function generate() {
    if (!canSend || !context) return;
    // Never discard human-edited drafts just because the user requests another answer.
    if (dirtyOutput && (content.trim() || cases.length) &&
      !window.confirm("Substituir a versão editada? As alterações manuais serão perdidas se a nova geração for concluída.")) return;
    const nextId = crypto.randomUUID();
    const previousRaw = raw;
    const previousTruncated=truncated;
    setGenerating(true); setError(""); setMessage("");
    setRaw(""); setTruncated(false);
    const abort = new AbortController();
    controller.current = abort;
    try {
      // All identity, support and approved requirements are scoped to this TF.
      // The full redacted payload is inspectable on screen before consent.
      const response = await generateWithNvidia(
        mode, context.taskContext.text, context.approved.text,
        (chunk) => setRaw((previous) => previous + chunk), abort.signal
      );
      setGenerationId(nextId);
      setTruncated(response.truncated);
      setDirtyOutput(false);
      if (mode === "post") {
        const formatted = formatGeneratedPost(response.text, {
          taskText: context.taskContext.text
        });
        setContent(formatted);
      } else {
        const candidates = parseGeneratedCases(response.text);
        setCases(editableCopy(candidates));
        setContent(response.text);
      }
      setMessage(response.truncated
        ? "Resposta interrompida pelo limite do modelo. Revise antes de usar."
        : mode === "teste"
          ? "Roteiro gerado. Revise os cenários antes de anexá-los."
          : "Post gerado e formatado. Revise os campos antes de salvar.");
    } catch (cause) {
      setRaw(previousRaw);setTruncated(previousTruncated);
      setError(abort.signal.aborted
        ? "Geração cancelada. A versão anterior foi preservada."
        : messageOf(cause) + " A versão anterior foi preservada; tente novamente.");
    } finally {
      setGenerating(false); controller.current = null;
    }
  }

  async function savePost() {
    if (mode !== "post" || !content.trim() || !context || !formOwn) return;
    if (postIssues.length) {
      setError("Revise o formato obrigatório: " + postIssues.join(", ")); return;
    }
    setBusySave(true); setError(""); setMessage("");
    try {
      const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0,240) || "Post da TF";
      const saved = await saveTfDocument(supabase, {
        taskId: task.id, type: "post", title, content,
        source: dirtyOutput ? "manual" : "gerado"
      });
      await client.invalidateQueries({ queryKey: ["documents", userId, task.id] });
      const warnings: string[] = [];
      try {
        const { error: historyError } = await supabase.from("qa_generator_posts").insert({
          user_id: userId, ts: Date.now(), titulo: title,
          tarefa: context.taskContext.text, requisito: context.approved.text, md: content
        });
        if (historyError) throw historyError;
      } catch (reason) { warnings.push("Histórico do gerador: " + messageOf(reason)); }
      if (context.approved.snapshots.length) {
        try {
          await recordRequirementUsage(supabase, {
            taskId: task.id, uid: userId, type: "post",
            artifactRef: saved.id, snapshots: context.approved.snapshots
          });
        } catch (reason) { warnings.push("Rastreabilidade: " + messageOf(reason)); }
      }
      setMessage("Post salvo em Documentos · versão " + saved.versao +
        (warnings.length ? ". Atenção: " + warnings.join(" | ") : "."));
    } catch (reason) { setError(messageOf(reason)); }
    finally { setBusySave(false); }
  }

  async function attachCases() {
    if (mode !== "teste" || !chosen.length || !context || !formOwn) return;
    setBusySave(true); setError(""); setMessage("");
    try {
      // The RPC is atomic, checks RLS, prevents duplicates and never marks tests approved.
      const saved = await attachReviewedCases(supabase, {
        taskId: task.id, generationId, items: chosen
      });
      const warnings: string[] = [];
      await client.invalidateQueries({ queryKey: ["scenarios", userId, task.id] });
      try {
        const { error: historyError } = await supabase.from("qa_generator_tests").upsert({
          id: generationId, user_id: userId, ts: Date.now(),
          titulo: task.titulo, tarefa: context.taskContext.text,
          requisito: context.approved.text, md: content, exec: {}
        }, { onConflict: "id" });
        if (historyError) throw historyError;
      } catch (reason) { warnings.push("Histórico do gerador: " + messageOf(reason)); }
      if (context.approved.snapshots.length) {
        try {
          await recordRequirementUsage(supabase, {
            taskId: task.id, uid: userId, type: "teste", artifactRef: generationId,
            snapshots: context.approved.snapshots
          });
        } catch (reason) { warnings.push("Rastreabilidade: " + messageOf(reason)); }
      }
      setMessage(saved.inserted + " cenário(s) anexado(s) · " + saved.skipped +
        " duplicado(s) ignorado(s). Todos começam não executados." +
        (warnings.length ? " Atenção: " + warnings.join(" | ") : ""));
    } catch (reason) { setError(messageOf(reason)); }
    finally { setBusySave(false); }
  }

  return <section className="panel mt-5" aria-labelledby="generator-title">
    <div className="qa-ai-generator-intro">
      <h2 id="generator-title" className="sr-only">
        {mode === "post" ? "Gerar post técnico" : "Gerar casos de teste"}
      </h2>
      <p className="text-muted text-sm">Escolha um modelo, confira os dados enviados e
        revise a prévia antes de salvar na TF.</p>
    </div>
    {!formOwn && <p className="notice error mt-4" role="alert">
      Gere conteúdo somente a partir de TFs pertencentes à sua conta. A consulta administrativa de outras contas é somente leitura neste fluxo.
    </p>}
    {(support.isLoading || requirements.isLoading) && <p role="status" className="mt-4">Carregando o contexto da TF…</p>}
    {(support.isError || requirements.isError || generationError) &&
      <p className="notice error mt-4" role="alert">
        {messageOf(support.error || requirements.error) !== "Falha ao executar a operação."
          ? messageOf(support.error || requirements.error) : generationError}
      </p>}
    {context && <div className="stack mt-5">
      <div className="qa-ai-setup">
        <label className="field">Modelo de geração
          <select value={preset} disabled={generating||busySave}
            onChange={event=>setPreset(event.target.value)}>
            {generatorPresets[mode].map(option=>
              <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <details className="qa-ai-extra-options">
          <summary>Personalizar dados e instruções <span>Opcional</span></summary>
          <div className="qa-ai-options-content">
            <div className="generator-stats" aria-label="Fontes no contexto">
              <span>Cenários: <strong>{context.taskContext.sourceCounts.scenarios}</strong></span>
              <span>Documentos: <strong>{context.taskContext.sourceCounts.documents}</strong></span>
              <span>Evidências: <strong>{context.taskContext.sourceCounts.evidence}</strong></span>
              <span>Eventos: <strong>{context.taskContext.sourceCounts.events}</strong></span>
              <span>Requisitos: <strong>{selected.length}</strong></span>
            </div>
            {requirements.data && requirements.data.length > 0 && <fieldset className="extracted-cases">
              <legend className="font-semibold">Requisitos aprovados para incluir</legend>
              {requirements.data.map(item=><label className="extracted-case" key={item.id}>
                <input type="checkbox" checked={selected.includes(item.id)}
                  disabled={generating||busySave}
                  onChange={event=>setSelected(prev=>event.target.checked
                    ? [...prev,item.id] : prev.filter(id=>id!==item.id))}/>
                <span><strong>{item.codigo} · {item.titulo}</strong>
                  <small>{item.descricao.slice(0,180)}</small></span>
              </label>)}
            </fieldset>}
            <label className="field">Instruções adicionais (opcional)
              <textarea rows={3} value={extra} maxLength={18000}
                disabled={generating||busySave}
                onChange={event=>setExtra(event.target.value)}
                placeholder="Ex.: cobrir o cenário de estorno ou destacar o antes/depois"/>
            </label>
          </div>
        </details>
      </div>
      {missingSources.length > 0 && <div className="notice error">
        <strong>Fontes indisponíveis:</strong>
        <p className="mt-2">{missingSources.join(" · ")}</p>
        <label className="flex items-start gap-2 mt-3">
          <input type="checkbox" checked={partialConsent} onChange={(e) => setPartialConsent(e.target.checked)} />
          Estou ciente de que este contexto está incompleto e desejo continuar.
        </label>
      </div>}
      <details className="generator-context">
        <summary>Ver dados enviados à IA</summary>
        <label className="field mt-3">Contexto da TF<textarea readOnly rows={9} value={context.taskContext.text} /></label>
        <label className="field mt-3">Requisitos e complemento<textarea readOnly rows={5} value={context.approved.text} /></label>
      </details>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        Autorizo enviar os textos exibidos à NVIDIA para gerar este conteúdo. A ocultação automática de dados sensíveis pode falhar; revise antes de enviar.
      </label>
      <div className="flex gap-2 flex-wrap">
        <Button isDisabled={!canSend} onPress={() => void generate()}>
          {raw||content||cases.length?<RotateCcw size={16}/>:<WandSparkles size={16}/>}
          {generating ? "Gerando…" : raw||content||cases.length ? "Gerar novamente"
            : mode === "post" ? "Gerar post" : "Gerar roteiro"}
        </Button>
        {generating && <Button variant="secondary" onPress={() => controller.current?.abort()}>
          Cancelar geração
        </Button>}
      </div>
    </div>}

    {(generating || raw || content || cases.length>0) && <section className="mt-6" aria-label="Resultado da IA">
      <p className="eyebrow">RESULTADO</p>
      <h3 className="font-semibold mt-1">Conteúdo produzido</h3>
      {generating && <p role="status" className="text-muted text-sm mt-2">
        Gerando uma nova versão. A prévia anterior permanece até a conclusão.
      </p>}
      {truncated && <p className="notice error mt-3">Resposta parcial: verifique os itens incompletos antes de usar.</p>}
      {mode === "post" ? <div className="stack mt-3">
        <label className="field">Post formatado (edite antes de salvar)
          <textarea rows={15} maxLength={80000} value={generating && !content ? raw : content} disabled={generating}
            onChange={(event) => { setContent(event.target.value); setDirtyOutput(true); }} />
        </label>
        {postIssues.length > 0 && <p className="notice error" role="alert">
          Estrutura a revisar: {postIssues.join(", ")}.
        </p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onPress={() => void navigator.clipboard.writeText(content || raw)}
            isDisabled={!content}><Clipboard size={16} /> Copiar</Button>
          <Button onPress={() => void savePost()} isDisabled={!content || !!postIssues.length || busySave || generating}>
            <FileCheck2 size={16} /> Salvar post na TF
          </Button>
        </div>
      </div> : <div className="stack mt-4">
        <details className="generator-context"><summary>Ver roteiro completo em Markdown</summary>
          <textarea className="w-full mt-3" rows={12} readOnly value={raw} /></details>
        <p className="text-muted text-sm">Revise cada cenário. Duplicados serão ignorados pela seleção e pelo banco.</p>
        {reviewed.length === 0 && !generating && <p className="notice error">
          O modelo não produziu cenários no formato esperado. Consulte o roteiro acima e tente novamente; não serão cadastrados casos automaticamente.
        </p>}
        <p className="qa-ai-case-count">{chosen.length} de {reviewed.length} casos selecionados</p>
        {reviewed.map((item, index) => <article key={String(item.source_index) + index} className="generator-case qa-ai-case-review">
          <label className="flex gap-2 items-center text-sm font-semibold">
            <input type="checkbox" disabled={item.duplicate} checked={item.selected && !item.duplicate}
              onChange={(event) => replaceCase(index, { selected: event.target.checked })} />
            Caso {index + 1} {item.duplicate ? "· Duplicado, não anexar" : ""}
          </label>
          <div className="qa-ai-case-preview">
            <strong>{item.titulo}</strong>
            <p><b>Passos:</b> {item.passos.slice(0,240)}{item.passos.length>240?"…":""}</p>
            <p><b>Esperado:</b> {item.esperado.slice(0,240)}{item.esperado.length>240?"…":""}</p>
          </div>
          <details className="qa-ai-case-edit">
            <summary>Editar cenário</summary>
            <div className="stack mt-3">
              <label className="field">Título<input value={item.titulo} maxLength={240}
                onChange={(e) => replaceCase(index, { titulo: e.target.value })} /></label>
              <label className="field">Passos<textarea rows={3} value={item.passos} maxLength={20000}
                onChange={(e) => replaceCase(index, { passos: e.target.value })} /></label>
              <label className="field">Resultado esperado<textarea rows={3} value={item.esperado} maxLength={20000}
                onChange={(e) => replaceCase(index, { esperado: e.target.value })} /></label>
              <label className="field">Observações<textarea rows={2} value={item.observacoes} maxLength={20000}
                onChange={(e) => replaceCase(index, { observacoes: e.target.value })} /></label>
            </div>
          </details>
        </article>)}
        <Button isDisabled={!chosen.length || busySave || generating} onPress={() => void attachCases()}>
          <Send size={16} /> Anexar {chosen.length} caso(s) à TF
        </Button>
      </div>}
    </section>}
    {message && <p className="notice mt-4" role="status">{message}</p>}
    {error && <p className="notice error mt-4" role="alert">{error}</p>}
  </section>;
}
