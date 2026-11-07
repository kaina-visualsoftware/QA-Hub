import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowRight, CheckCheck, Filter, Plus, Search, Sparkles, X } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { createTask, getAdminRole, listTasks, addExtractedScenarios } from "../lib/data";
import { extractLocalDraft } from "../lib/legacy/qa-assistant.mjs";
import type { LocalDraft } from "../lib/legacy/qa-assistant.mjs";
import type { LocalModelClient } from "../lib/legacy/qa-ai-open.mjs";
import { taskDraftSchema, taskStatusLabels } from "../lib/contracts";
import type { TaskDraft } from "../lib/contracts";
import { useFocus } from "../stores/focus";

export function Workspace() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [showForm, setShowForm] = useState(false);
  const [extracted, setExtracted] = useState<Array<{titulo:string;passos:string;esperado:string;observacoes:string;selected:boolean}>>([]);
  const [extractionNotice, setExtractionNotice] = useState("");
  const [localReview, setLocalReview] = useState<{source:string;draft:LocalDraft} | null>(null);
  const [allowModel, setAllowModel] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProgress, setAiProgress] = useState("");
  const modelRef = useRef<LocalModelClient | null>(null);
  const taskEditorRef = useRef<HTMLElement | null>(null);
  const aiRunRef = useRef(0);
  const { newTask } = useSearch({ from: "/" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const focusedId = useFocus((s) => s.taskId);
  const setFocused = useFocus((s) => s.setTask);
  const role = useQuery({ queryKey: ["role", userId], queryFn: () => getAdminRole(userId), enabled: !!userId });
  const tasks = useQuery({
    queryKey: ["tasks", userId, role.data],
    queryFn: () => listTasks(userId, role.data ?? false),
    enabled: !!userId && role.data !== undefined
  });
  useEffect(() => () => {
    aiRunRef.current++;
    modelRef.current?.dispose();
    modelRef.current = null;
  }, []);
  useEffect(() => {
    if (!showForm) return;
    const frame = requestAnimationFrame(() => {
      taskEditorRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      taskEditorRef.current?.querySelector<HTMLInputElement>('input[name="titulo"]')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [showForm]);

  function showReview(source: string, draft: LocalDraft, viaModel: boolean) {
    setLocalReview({ source, draft });
    setExtracted(draft.cenarios
      .filter((item) => item.titulo.trim().length >= 3 &&
        item.passos.trim().length > 0 && item.esperado.trim().length > 0)
      .map((item) => ({
        titulo: item.titulo.slice(0,240), passos: item.passos.slice(0,20000),
        esperado: item.esperado.slice(0,20000),
        observacoes: item.observacoes.slice(0,20000), selected: false
      })));
    setExtractionNotice(viaModel
      ? "Sugestão de IA preparada no seu dispositivo. Confira cada campo: a IA pode errar ou inventar informações."
      : "Prévia preparada localmente. Confirme os campos e selecione os cenários desejados.");
  }

  async function analyzeWithModel() {
    const source = form.getValues("descricao");
    if (!allowModel || aiBusy) return;
    if (!source.trim() || source.length > 6000) {
      setExtractionNotice("A IA local aceita entre 1 e 6.000 caracteres. Para textos maiores, use a extração sem IA.");
      return;
    }
    const run = ++aiRunRef.current;
    let activeClient: LocalModelClient | null = null;
    setAiBusy(true); setAiProgress("Preparando o worker local…");
    setLocalReview(null); setExtracted([]);
    try {
      const { createOpenModelClient } = await import("../lib/legacy/qa-ai-open.mjs");
      if (aiRunRef.current !== run) return;
      modelRef.current?.dispose();
      const client = createOpenModelClient();
      activeClient = client;
      modelRef.current = client;
      const draft = await client.extract(source, (message) => {
        if (aiRunRef.current === run) setAiProgress(message);
      });
      if (aiRunRef.current !== run) return;
      if (form.getValues("descricao") !== source) {
        setExtractionNotice("O texto mudou durante a análise. Execute a IA novamente para gerar uma prévia atualizada.");
        return;
      }
      showReview(source, draft, true);
    } catch (error) {
      if (aiRunRef.current === run) {
        setExtractionNotice(error instanceof Error ? error.message :
          "Não foi possível usar o modelo neste dispositivo. Use a extração sem IA.");
      }
    } finally {
      if (aiRunRef.current === run) {
        setAiBusy(false); setAiProgress("");
      }
      activeClient?.dispose();
      if (modelRef.current === activeClient) modelRef.current = null;
    }
  }

  function cancelModel() {
    aiRunRef.current++;
    modelRef.current?.dispose();
    modelRef.current = null;
    setAiBusy(false); setAiProgress("");
    setExtractionNotice("Análise com modelo local cancelada. Você pode usar a extração sem IA.");
  }

  const form = useForm<TaskDraft>({
    resolver: zodResolver(taskDraftSchema),
    defaultValues: { titulo: "", descricao: "", codigo: "", tipo_teste: "BUILD", sistema: "", versao: "" }
  });
  const create = useMutation({
    mutationFn: async ({ draft, openScenario }: { draft: TaskDraft; openScenario: boolean }) => {
      const task = await createTask(userId, draft);
      let warning = "";
      const selected = extracted.filter((item) => item.selected);
      if (selected.length) {
        try { await addExtractedScenarios(task.id, userId, selected); }
        catch (error) { warning = error instanceof Error ? error.message : "Falha ao salvar cenários extraídos"; }
      }
      return { task, warning, openScenario };
    },
    onSuccess: async ({ task, warning, openScenario }) => {
      if (warning) {
        try { sessionStorage.setItem("qa-react-import-warning:" + task.id,
          "TF salva, mas os cenários extraídos não foram adicionados: " + warning); } catch {}
      }
      setExtracted([]); setExtractionNotice(""); setLocalReview(null);
      setFocused(task.id);
      await queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      setShowForm(false);
      form.reset();
      await navigate({
        to: "/tarefa/$taskId",
        params: { taskId: task.id },
        search: { newScenario: openScenario || undefined }
      });
    }
  });

  useEffect(() => {
    if (newTask) setShowForm(true);
  }, [newTask]);

  useEffect(() => {
    if (focusedId && tasks.data && !tasks.data.some((task) => task.id === focusedId)) setFocused(null);
  }, [focusedId, tasks.data, setFocused]);

  const filtered = useMemo(() => (tasks.data ?? []).filter((task) => {
    const needle = search.toLocaleLowerCase("pt-BR").trim();
    const found = !needle || [task.titulo, task.codigo, task.sistema, task.versao, task.descricao]
      .some((value) => (value ?? "").toLocaleLowerCase("pt-BR").includes(needle));
    return found && (!status || task.status === status);
  }), [tasks.data, search, status]);
  const pending = (tasks.data ?? []).filter((item) => item.status === "rascunho" || item.status === "em_teste").length;
  const approved = (tasks.data ?? []).filter((item) => item.status === "aprovado").length;

  return <div className="page">
    <div className="page-heading">
      <div><p className="eyebrow">VISÃO OPERACIONAL</p>
        <h1>Suas tarefas de teste</h1>
        <p className="text-muted">Encontre uma TF, continue executando cenários ou registre uma nova em segundos.</p>
      </div>
      <Button onPress={() => setShowForm((value) => !value)}><Plus size={17} /> Nova TF</Button>
    </div>
    <section className="stat-strip" aria-label="Resumo">
      <div><span>TFs carregadas</span><strong>{tasks.data?.length ?? 0}</strong></div>
      <div><span>Em andamento</span><strong>{pending}</strong></div>
      <div><span>Aprovadas</span><strong>{approved}</strong></div>
      <div><span>Contexto atual</span><strong className="text-base">{focusedId ? "TF selecionada" : "Nenhuma TF"}</strong></div>
    </section>

    {showForm && <section ref={taskEditorRef} className="panel editor-panel" aria-labelledby="new-task-title">
      <div className="section-heading">
        <div><p className="eyebrow">CADASTRO RÁPIDO</p><h2 id="new-task-title">Nova TF</h2>
          <p className="text-muted">Somente o essencial agora. Detalhe os cenários depois.</p></div>
        <button aria-label="Fechar cadastro" onClick={() => {
          cancelModel(); setShowForm(false); setLocalReview(null); setExtracted([]);
        }}><X size={18} /></button>
      </div>
      <form onSubmit={form.handleSubmit((values, event) => {
        const submitter = (event?.nativeEvent as SubmitEvent | undefined)?.submitter;
        void create.mutateAsync({
          draft: values, openScenario: submitter?.getAttribute("data-next") === "scenario"
        });
      })} className="stack mt-5">
        <div className="form-grid">
          <label className="field grow-2">Título da tarefa
            <input placeholder="Ex.: Validar o desconto na devolução" {...form.register("titulo")} />
            {form.formState.errors.titulo && <small role="alert" className="text-error">{form.formState.errors.titulo.message}</small>}
          </label>
          <label className="field">Tipo
            <select {...form.register("tipo_teste")}><option>BUILD</option><option>RELEASE</option></select>
          </label>
          <label className="field">Código da TF<input placeholder="Opcional" {...form.register("codigo")} /></label>
          <label className="field">Sistema / módulo<input placeholder="Opcional" {...form.register("sistema")} /></label>
          <label className="field">Versão<input placeholder="Opcional" {...form.register("versao")} /></label>
        </div>
        <label className="field">Descrição / problema
          <textarea rows={6} placeholder="Cole um relatório completo ou descreva a TF. Não precisa preencher todos os campos."
            {...form.register("descricao")} />
        </label>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="secondary" type="button" onPress={() => {
            const source = form.getValues("descricao");
            try {
              const draft = extractLocalDraft(source);
              showReview(source, draft, false);
            } catch (error) {
              setLocalReview(null); setExtracted([]);
              setExtractionNotice(error instanceof Error ? error.message : "Falha na análise local.");
            }
          }}>Analisar texto localmente</Button>
          <span className="text-muted text-sm">Extração determinística no navegador, sem IA e sem envio externo.</span>
        </div>
        <div className="generator-context stack" aria-label="Assistente generativo no navegador">
          <div>
            <h3 className="font-semibold">IA generativa local (opcional)</h3>
            <p className="text-muted text-sm mt-2">
              O modelo público é baixado sob demanda e pode usar bastante memória e espaço no navegador.
              O relatório é processado no próprio dispositivo, sem ser enviado ao provedor do modelo.
              Só use após revisar o texto para não incluir dados sensíveis desnecessários.
            </p>
          </div>
          <label className="flex gap-2 items-start text-sm">
            <input type="checkbox" checked={allowModel} onChange={(event) =>
              setAllowModel(event.target.checked)} disabled={aiBusy} />
            Autorizo baixar o modelo público e executar a análise localmente.
          </label>
          <div className="flex gap-2 flex-wrap items-center">
            <Button type="button" variant="secondary"
              isDisabled={!allowModel || aiBusy}
              onPress={() => void analyzeWithModel()}>
              <Sparkles size={16} /> {aiBusy ? "Analisando no dispositivo…" : "Analisar com IA local"}
            </Button>
            {aiBusy && <Button type="button" variant="secondary"
              onPress={cancelModel}>Cancelar análise</Button>}
          </div>
          {aiProgress && <p role="status" aria-live="polite" className="text-muted text-sm">
            {aiProgress}
          </p>}
        </div>
        {extractionNotice && <p role="status" className="notice">{extractionNotice}</p>}
        {localReview && <section className="generator-context stack"
          aria-label="Prévia do preenchimento local">
          <h3 className="font-semibold">Conferir campos identificados</h3>
          <p className="text-muted text-sm">Nada será aplicado até você confirmar.
            Campos não identificados permanecem como estão.</p>
          <div className="local-preview-grid">
            {Object.entries(localReview.draft.fields)
              .filter(([key,value]) => key !== "descricao" && Boolean(value))
              .map(([key,value]) => <div key={key} className="local-preview-item">
                <strong>{key.replaceAll("_", " ")}</strong>
                <span>{value.slice(0,320)}</span>
              </div>)}
          </div>
          <p className="text-sm"><strong>{localReview.draft.cenarios.length}</strong> cenário(s)
            extraído(s), {extracted.length} com passos e resultado esperado suficientes.
            Os demais exigem preenchimento manual.</p>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" type="button" onPress={() => {
              if (form.getValues("descricao") !== localReview.source) {
                setExtractionNotice("O texto foi alterado. Analise novamente antes de preencher.");
                setLocalReview(null); setExtracted([]);
                return;
              }
              const textLimits: Record<string,number> = {
                titulo:240, descricao:30000, codigo:100, sistema:160, versao:100,
                ambiente:240, base_teste:240, empresa:240, testador:240,
                explicacao:30000, causa:30000, correcao:30000,
                conclusao:30000, observacoes:30000
              };
              const draft = localReview.draft;
              for (const [name,value] of Object.entries(draft.fields)) {
                if (!value || name === "tipo_teste" || !(name in textLimits)) continue;
                const key = name as Exclude<keyof TaskDraft,"tipo_teste">;
                form.setValue(key, value.slice(0,textLimits[name]), {
                  shouldValidate:true, shouldDirty:true
                });
              }
              if (draft.fields.tipo_teste === "BUILD" || draft.fields.tipo_teste === "RELEASE") {
                form.setValue("tipo_teste", draft.fields.tipo_teste, {
                  shouldValidate:true, shouldDirty:true
                });
              }
              setLocalReview(null);
              setExtractionNotice("Campos aplicados. Revise o formulário e selecione explicitamente os casos antes de salvar.");
            }}>Aplicar campos revisados</Button>
            <Button type="button" variant="secondary" onPress={() => {
              setLocalReview(null); setExtracted([]);
              setExtractionNotice("Análise descartada. O formulário não foi modificado.");
            }}>Descartar prévia</Button>
          </div>
        </section>}
        {extracted.length > 0 && <fieldset className="extracted-cases">
          <legend className="font-semibold">Cenários identificados — nenhum é anexado sem seleção</legend>
          {extracted.map((item, index) => <label key={index} className="extracted-case">
            <input type="checkbox" checked={item.selected} onChange={(e) =>
              setExtracted((items) => items.map((v, i) => i === index ? {...v, selected: e.target.checked} : v))} />
            <span><strong>{item.titulo}</strong><small>{item.passos.slice(0, 180)}</small></span>
          </label>)}
        </fieldset>}
        <div className="flex items-center gap-3 justify-end">
          <span className="text-muted text-sm mr-auto">O registro inicia como rascunho.</span>
          <Button type="button" variant="secondary" onPress={() => {
            cancelModel(); setShowForm(false); setLocalReview(null); setExtracted([]);
          }}>Cancelar</Button>
          <Button type="submit" variant="secondary" data-next="task"
            isDisabled={create.isPending}>Salvar e abrir TF</Button>
          <Button type="submit" data-next="scenario"
            isDisabled={create.isPending}>Salvar e adicionar cenário</Button>
        </div>
        {create.isError && <p className="notice error" role="alert">{create.error.message}</p>}
      </form>
    </section>}

    <section className="panel task-panel">
      <div className="section-heading"><div><h2>Base de TFs</h2><p className="text-muted">Selecione um registro para executar.</p></div>
        <span className="count-pill">{filtered.length} resultado(s)</span></div>
      <div className="filter-line">
        <label className="search-box"><Search size={18} aria-hidden="true" />
          <span className="sr-only">Pesquisar por título, código, módulo ou versão</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código, título, sistema, versão…" />
        </label>
        <label className="filter-select"><Filter size={17} aria-hidden="true" />
          <span className="sr-only">Filtrar situação</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas as situações</option>
            {Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {(role.isPending || tasks.isPending) && <p className="empty-state" role="status">Carregando tarefas…</p>}
      {(role.isError || tasks.isError) && <p className="notice error mt-4" role="alert">
        Não foi possível consultar o Supabase: {role.error?.message || tasks.error?.message}
      </p>}
      {tasks.isSuccess && filtered.length === 0 && <div className="empty-state">
        <CheckCheck size={28} /><strong>Nenhuma TF neste filtro</strong>
        <p>{search || status ? "Altere os filtros para consultar outras tarefas." : "Crie a primeira TF para começar."}</p>
      </div>}
      <div className="task-rows">
        {filtered.map((task) => <Link to="/tarefa/$taskId" params={{ taskId: task.id }}
          className="task-row" key={task.id} onClick={() => setFocused(task.id)}>
          <span className="task-initial">{(task.codigo || "TF").slice(0, 3).toUpperCase()}</span>
          <span className="task-text"><strong>{task.titulo}</strong>
            <small>{task.codigo || "Sem código"} · {task.tipo_teste} · {task.sistema || "Sem módulo"}
              {task.versao ? " · " + task.versao : ""}</small>
          </span>
          <span className={"status-chip " + task.status}>{taskStatusLabels[task.status]}</span>
          <ArrowRight className="row-arrow" size={18} />
        </Link>)}
      </div>
    </section>
  </div>;
}
