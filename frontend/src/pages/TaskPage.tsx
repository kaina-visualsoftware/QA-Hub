import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowLeft, BookText, Check, CircleHelp, ClipboardList, ExternalLink, FileText, GitBranchPlus, GitMerge, ListChecks, Plus, Share2, X, WandSparkles, FilePenLine, Workflow, Sparkles } from "lucide-react";
import type { GeneratorMode } from "../features/generators/stream";
import { useAuth } from "../features/auth/AuthProvider";
import {
  addScenario, getAdminRole, listScenarios, listTasks, saveScenarioResult, updateTask,
  editScenario, removeScenario, removeTask, setTaskStatus
} from "../lib/data";
import {
  scenarioDraftSchema, taskDraftSchema, scenarioStatusLabels, taskStatusLabels, taskStatuses, progressOf
} from "../lib/contracts";
import type { Scenario, ScenarioDraft, TaskDraft, ExecutionResult } from "../lib/contracts";
import { useFocus } from "../stores/focus";
import { publicSharingEnabled, updatePublication } from "../features/public/public-data";
import {
  needsObservationResetConfirmation, quickExecutionResult
} from "../features/executions/quick-result";
import { useModalFocus } from "../lib/useModalFocus";

const DiagramPanel = lazy(() => import("../features/diagrams/DiagramPanel"));
const GeneratorPanel = lazy(() => import("../features/generators/GeneratorPanel"));
const DocumentsPanel = lazy(() => import("../features/documents/DocumentsPanel"));
const RequirementsPanel = lazy(() => import("../features/requirements/RequirementsPanel"));
const EvidencePanel = lazy(() => import("../features/evidence/EvidencePanel"));
const LinksPanel = lazy(() => import("../features/links/LinksPanel"));

export default function TaskPage() {
  const { taskId } = useParams({ from: "/tarefa/$taskId" });
  const { newScenario, resume } = useSearch({ from: "/tarefa/$taskId" });
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const navigate = useNavigate();
  const focusTask = useFocus((s) => s.setTask);
  const queryClient = useQueryClient();
  const role = useQuery({ queryKey: ["role", userId], queryFn: () => getAdminRole(userId), enabled: !!userId });
  const tasks = useQuery({
    queryKey: ["tasks", userId, role.data],
    queryFn: () => listTasks(userId, role.data ?? false),
    enabled: !!userId && role.data !== undefined
  });
  const task = tasks.data?.find((record) => record.id === taskId);
  const scenarios = useQuery({
    queryKey: ["scenarios", userId, taskId], queryFn: () => listScenarios(taskId),
    enabled: Boolean(task)
  });
  const [editing, setEditing] = useState(false);
  const [showScenarioForm, setShowScenarioForm] = useState(false);
  const [showDiagrams, setShowDiagrams] = useState(false);
  const [focusDiagramAi, setFocusDiagramAi] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [focusReport, setFocusReport] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [generatorMode, setGeneratorMode] = useState<GeneratorMode | null>(null);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [nextStatus, setNextStatus] = useState<(typeof taskStatuses)[number]>("rascunho");
  const [importWarning, setImportWarning] = useState("");
  const [pending, setPending] = useState<{ scenario: Scenario; status: ExecutionResult["status"] } | null>(null);
  const [observed, setObserved] = useState("");
  const observedModalRef = useModalFocus(Boolean(pending), () => {
    if (!saveResult.isPending) setPending(null);
  }, "textarea");
  const [filter, setFilter] = useState<"all" | "pending" | "failed">("all");
  const [saved, setSaved] = useState("");
  const [focusNextPending, setFocusNextPending] = useState(false);
  const [resumeFocus, setResumeFocus] = useState(false);
  const editorRef = useRef<HTMLElement | null>(null);
  const executionRef = useRef<HTMLElement | null>(null);
  const generatorRef = useRef<HTMLDivElement | null>(null);
  const pendingCount = (scenarios.data ?? []).filter((item) =>
    item.status === "nao_executado").length;

  useEffect(() => {
    if (!showScenarioForm) return;
    const frame = requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      editorRef.current?.querySelector<HTMLInputElement>('input[name="titulo"]')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [showScenarioForm, editingScenario?.id]);

  useEffect(() => {
    if (!generatorMode) return;
    const frame = requestAnimationFrame(() => {
      generatorRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      generatorRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [generatorMode]);

  function startScenario() {
    setEditingScenario(null);
    scenarioForm.reset();
    setShowScenarioForm(true);
  }

  function openDiagramAi() {
    setShowDiagrams(true); setFocusDiagramAi(true);
    setGeneratorMode(null); setShowDocuments(false);
    requestAnimationFrame(() => {
      const target = document.getElementById("diagram-ai-heading");
      target?.scrollIntoView({ behavior:"auto", block:"start" });
      target?.focus({ preventScroll:true });
    });
  }

  function startPendingExecution() {
    setFilter("pending");
    setSaved(pendingCount ? "" :
      "Não há casos pendentes. Adicione um cenário ou escolha outro filtro.");
    requestAnimationFrame(() => {
      const target = executionRef.current?.querySelector<HTMLButtonElement>(
        '[data-qa-next-pending="true"]'
      ) ?? executionRef.current?.querySelector<HTMLButtonElement>(
        '[data-qa-filter="pending"]'
      );
      target?.scrollIntoView({ behavior: "auto", block: "center" });
      target?.focus({ preventScroll: true });
    });
  }


  const taskForm = useForm<TaskDraft>({
    resolver: zodResolver(taskDraftSchema),
    defaultValues: { titulo: "", descricao: "", tipo_teste: "BUILD", codigo: "", sistema: "", versao: "" }
  });
  const scenarioForm = useForm<ScenarioDraft>({
    resolver: zodResolver(scenarioDraftSchema),
    defaultValues: { titulo: "", passos: "", esperado: "", observacoes: "" }
  });

  // The one-time next step is encoded in the route, not stored in session state.
  // Clear it with replace so a refresh or Back cannot reopen an obsolete editor.
  useEffect(() => {
    if (!newScenario || !task || task.user_id !== userId) return;
    setEditingScenario(null);
    scenarioForm.reset();
    setShowScenarioForm(true);
    void navigate({
      to: "/tarefa/$taskId",
      params: { taskId },
      search: { newScenario: undefined },
      replace: true
    });
  }, [newScenario, task?.id, task?.user_id, userId, taskId, navigate, scenarioForm.reset]);

  // A one-shot "Continue tests" link from the workspace never executes
  // a scenario. It only selects pending cases and focuses the first action.
  // Consume this route intent so refresh and browser Back do not repeat it.
  useEffect(() => {
    if (!resume || !task || !scenarios.isSuccess || task.user_id !== userId) return;
    setFilter("pending");
    setResumeFocus(true);
    setSaved(pendingCount ? "" :
      "Não há casos pendentes nesta TF. Adicione um cenário ou consulte outros filtros.");
    void navigate({
      to: "/tarefa/$taskId",
      params: { taskId },
      search: { resume: undefined, newScenario: undefined },
      replace: true
    });
  }, [resume, task?.id, task?.user_id, userId, scenarios.isSuccess, pendingCount,
    taskId, navigate]);

  useEffect(() => {
    if (!resumeFocus || filter !== "pending" || !scenarios.isSuccess) return;
    const frame = requestAnimationFrame(() => {
      const target = executionRef.current?.querySelector<HTMLButtonElement>(
        '[data-qa-next-pending="true"]'
      ) ?? executionRef.current?.querySelector<HTMLButtonElement>(
        '[data-qa-filter="pending"]'
      );
      target?.scrollIntoView({ behavior: "auto", block: "center" });
      target?.focus({ preventScroll: true });
      setResumeFocus(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [resumeFocus, filter, scenarios.isSuccess, scenarios.data]);

  useEffect(() => { focusTask(taskId); }, [taskId, focusTask]);
  useEffect(() => {
    try {
      const key = "qa-react-import-warning:" + taskId;
      const message = sessionStorage.getItem(key);
      if (message) { setImportWarning(message); sessionStorage.removeItem(key); }
    } catch { /* optional browser storage */ }
  }, [taskId]);
  useEffect(() => { if (task) setNextStatus(task.status); }, [task?.status]);
  useEffect(() => {
    if (!task) return;
    taskForm.reset({
      titulo: task.titulo, descricao: task.descricao || "", tipo_teste: task.tipo_teste,
      codigo: task.codigo || "", sistema: task.sistema || "", versao: task.versao || "",
      explicacao: task.explicacao || "", causa: task.causa || "", correcao: task.correcao || "",
      conclusao: task.conclusao || "", observacoes: task.observacoes || "",
      ambiente: task.ambiente || "", base_teste: task.base_teste || "",
      empresa: task.empresa || "", testador: task.testador || ""
    });
  }, [task, taskForm.reset]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks", userId] }),
      queryClient.invalidateQueries({ queryKey: ["scenarios", userId, taskId] }),
      queryClient.invalidateQueries({ queryKey: ["task-progress", userId] })
    ]);
  };
  const saveTask = useMutation({
    mutationFn: (data: TaskDraft) => updateTask(taskId, data),
    onSuccess: async () => { setEditing(false); setSaved("Alterações da TF salvas."); await invalidate(); }
  });
  const createScenario = useMutation({
    mutationFn: ({ draft }: { draft: ScenarioDraft; another: boolean }) => editingScenario
      ? editScenario(taskId, editingScenario.id, draft)
      : addScenario(taskId, userId, draft,
          Math.max(0, ...(scenarios.data ?? []).map((item) => item.ordem)) + 1),
    onSuccess: async (_result, { another }) => {
      const keepEditing = another && !editingScenario;
      scenarioForm.reset();
      if (!keepEditing) { setShowScenarioForm(false); setEditingScenario(null); }
      setSaved(keepEditing ? "Cenário salvo. Preencha o próximo." : "Cenário salvo.");
      await invalidate();
      if (keepEditing) requestAnimationFrame(() => {
        editorRef.current?.querySelector<HTMLInputElement>('input[name="titulo"]')
          ?.focus({ preventScroll: true });
      });
    }
  });
  const saveResult = useMutation({
    mutationFn: (input: { scenario: Scenario; status: ExecutionResult["status"]; obtido: string }) =>
      saveScenarioResult(taskId, input.scenario.id, { status: input.status, obtido: input.obtido }),
    onSuccess: async (_result, input) => {
      setPending(null); setObserved("");
      setSaved("Execução registrada. A situação da TF não foi alterada automaticamente.");
      // Only advance after a confirmed server write and a refreshed scenario list.
      // Never treat a failed mutation as a completed execution.
      setFocusNextPending(filter === "pending" && input.status !== "nao_executado");
      await invalidate();
    }
  });

  const updateStatus = useMutation({
    mutationFn: (status: (typeof taskStatuses)[number]) => setTaskStatus(taskId, status),
    onSuccess: async () => { setSaved("Situação da TF alterada manualmente."); await invalidate(); }
  });
  const publication = useMutation({
    mutationFn: (publish: boolean) => updatePublication(taskId, userId, publish),
    onSuccess: async (published) => {
      setSaved(published ? "TF publicada por sua confirmação." : "Publicação desativada.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks", userId] }),
        queryClient.invalidateQueries({ queryKey: ["public-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["public-task", taskId] })
      ]);
    }
  });
  const deleteTaskMutation = useMutation({
    mutationFn: () => removeTask(taskId),
    onSuccess: async () => {
      focusTask(null);
      await queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      await navigate({ to: "/" });
    }
  });
  const deleteScenarioMutation = useMutation({
    mutationFn: (id: string) => removeScenario(taskId, id),
    onSuccess: async () => { setSaved("Cenário excluído."); await invalidate(); }
  });

  useEffect(() => {
    if (!focusNextPending || saveResult.isPending || scenarios.isFetching) return;
    const target = executionRef.current?.querySelector<HTMLButtonElement>(
      '[data-qa-next-pending="true"]'
    ) ?? executionRef.current?.querySelector<HTMLButtonElement>(
      '[data-qa-filter="pending"]'
    );
    target?.scrollIntoView({ behavior: "auto", block: "center" });
    target?.focus({ preventScroll: true });
    setFocusNextPending(false);
  }, [focusNextPending, saveResult.isPending, scenarios.isFetching, scenarios.data]);

  const progress = progressOf(scenarios.data || []);
  const passedCount = (scenarios.data ?? []).filter(s => s.status==="aprovado").length;
  const failedCount = (scenarios.data ?? []).filter(s => s.status==="reprovado").length;
  const blockedCount = (scenarios.data ?? []).filter(s => s.status==="bloqueado").length;
  const progressPercent = progress.total ? Math.round(progress.executed/progress.total*100) : 0;
  const visible = useMemo(() => (scenarios.data || []).filter((scenario) =>
    filter === "all" || filter === "pending" && scenario.status === "nao_executado" ||
    filter === "failed" && (scenario.status === "reprovado" || scenario.status === "bloqueado")
  ), [scenarios.data, filter]);

  function choose(scenario: Scenario, status: ExecutionResult["status"]) {
    setSaved("");
    if (status === "reprovado" || status === "bloqueado") {
      setPending({ scenario, status }); setObserved(scenario.status === status ? scenario.obtido : "");
      return;
    }
    const result = quickExecutionResult(scenario, status);
    if (needsObservationResetConfirmation(scenario, status) &&
      !window.confirm("Esta ação substituirá o resultado observado anterior. Deseja continuar?")) {
      return;
    }
    saveResult.mutate({ scenario, ...result });
  }
  if (tasks.isPending || role.isPending) return <p className="screen-status" role="status">Carregando TF…</p>;
  if (tasks.isError || role.isError) return <p className="notice error" role="alert">Erro ao abrir TF: {tasks.error?.message || role.error?.message}</p>;
  if (!task) return <div className="empty-state"><h1>TF não encontrada ou sem acesso</h1><Link to="/">Voltar</Link></div>;

  return <div className="page">
    <Link to="/" className="back-link"><ArrowLeft size={16} /> Todas as TFs</Link>
    <header className="qa-task-hero mt-4" aria-label="Resumo da TF">
      <div className="qa-task-hero-top">
        <div className="qa-task-identity">
          <p className="qa-task-eyebrow">{task.codigo ? "TF · " + task.codigo : "TAREFA DE TESTE"}</p>
          <h1>{task.titulo}</h1>
          <div className="qa-task-meta">
            <span>{task.tipo_teste}</span><span>{task.sistema || "Sem módulo"}</span>
            <span>{task.versao || "Sem versão"}</span>
          </div>
        </div>
        <div className="qa-task-hero-controls">
          <span className={"status-chip " + task.status}>{taskStatusLabels[task.status]}</span>
          <Button variant="secondary" onPress={() => setEditing((value) => !value)}>
            <FilePenLine size={16} /> {editing ? "Fechar edição" : "Editar TF"}
          </Button>
        </div>
      </div>
      <div className="qa-task-snapshot" aria-label="Indicadores da execução">
        <div><strong>{progress.executed}<span>/{progress.total}</span></strong><small>Executados</small></div>
        <div><strong>{pendingCount}</strong><small>Pendentes</small></div>
        <div><strong>{passedCount}</strong><small>Aprovados</small></div>
        <div><strong>{failedCount + blockedCount}</strong><small>Falha ou bloqueio</small></div>
      </div>
      <div className="qa-task-hero-progress">
        <div className="qa-task-progress-label">
          <span>Andamento da validação</span><strong>{progressPercent}%</strong>
        </div>
        <div className="qa-task-hero-meter" role="progressbar"
          aria-label="Cenários executados" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={progressPercent}>
          <span style={{width:progressPercent+"%"}} />
        </div>
      </div>
    </header>
    <section className="qa-quickflow mt-4" aria-label="Fluxo rápido de QA">
      <div className="qa-quickflow-heading">
        <div>
          <p className="eyebrow">ÁREA DE TRABALHO</p>
          <h2>Da TF ao resultado, sem etapas desnecessárias</h2>
          <p className="text-muted text-sm">Crie ou gere conteúdo, execute os casos e registre somente resultados reais.</p>
        </div>
        <span className="count-pill">{pendingCount} pendente(s)</span>
      </div>
      <div className="qa-action-strip">
        <Button onPress={startScenario}><Plus size={17} /> Adicionar cenário</Button>
        <Button variant="secondary" onPress={startPendingExecution} isDisabled={scenarios.isPending}>
          <ListChecks size={17} /> Testar pendentes
        </Button>
        <Button variant="secondary" isDisabled={scenarios.isPending || scenarios.isError || scenarios.isFetching}
          onPress={() => {
            setGeneratorMode(null); setShowDocuments(true); setFocusReport(true);
            requestAnimationFrame(() => {
              document.getElementById("documents-heading")?.focus({ preventScroll: true });
              document.getElementById("documents-heading")?.scrollIntoView({ behavior:"auto", block:"start" });
            });
          }}><FileText size={17} /> Conferir relatório</Button>
      </div>
      <div className="qa-ai-section-heading">
        <p className="eyebrow">GERAÇÃO ASSISTIDA</p>
        <p>Escolha o que criar com a IA, utilizando os dados desta TF.</p>
      </div>
      <div className="qa-ai-action-grid" role="group" aria-label="Ferramentas de IA">
        <button type="button" className="qa-ai-action" aria-label="Gerar casos com IA"
          onClick={() => { setGeneratorMode("teste"); setShowDocuments(false); }}>
          <span className="qa-ai-icon"><ListChecks size={19} /></span>
          <span><strong>Gerar casos com IA</strong><small>Roteiro e cenários revisáveis para executar</small></span>
          <WandSparkles size={17} className="qa-ai-arrow" />
        </button>
        <button type="button" className="qa-ai-action" aria-label="Gerar post com IA"
          onClick={() => { setGeneratorMode("post"); setShowDocuments(false); }}>
          <span className="qa-ai-icon"><FileText size={19} /></span>
          <span><strong>Gerar post com IA</strong><small>Comunicado no padrão e versão na TF</small></span>
          <WandSparkles size={17} className="qa-ai-arrow" />
        </button>
        <button type="button" className="qa-ai-action" aria-label="Gerar diagrama com IA"
          onClick={openDiagramAi}>
          <span className="qa-ai-icon"><Workflow size={19} /></span>
          <span><strong>Gerar diagrama com IA</strong><small>Fluxograma Mermaid com prévia e edição</small></span>
          <Sparkles size={17} className="qa-ai-arrow" />
        </button>
      </div>
      <details className="qa-more-tools">
        <summary>Requisitos, evidências, diagramas e outras ferramentas</summary>
        <div className="qa-more-tools-content">
          <button type="button" onClick={() => setShowRequirements((value) => !value)}
            className="secondary-link"><BookText size={16} /> {showRequirements ? "Ocultar requisitos" : "Requisitos e cobertura"}</button>
          <button type="button" onClick={() => setShowEvidence((value) => !value)}
            className="secondary-link"><ClipboardList size={16} /> {showEvidence ? "Ocultar evidências" : "Evidências e auditoria"}</button>
          <button type="button" onClick={() => setShowLinks((value) => !value)}
            className="secondary-link"><GitMerge size={16} /> {showLinks ? "Ocultar releases" : "Releases e referências"}</button>
          <button type="button" onClick={() => {
            setShowDocuments((value) => !value); setFocusReport(false); setGeneratorMode(null);
          }} className="secondary-link"><FileText size={16} /> {showDocuments ? "Ocultar documentos" : "Documentos / relatório"}</button>
          <button type="button" onClick={() => {
            setShowDiagrams((value) => !value); setFocusDiagramAi(false);
          }} className="secondary-link"><GitBranchPlus size={16} /> {showDiagrams ? "Ocultar diagramas" : "Editor de diagramas"}</button>
        </div>
      </details>
    </section>
    <section className="progress-panel mt-4" aria-label="Progresso da execução">
      <div><strong>{progress.executed}/{progress.total}</strong><span>cenários executados</span></div>
      <div className="progress-meter"><span style={{ width: progress.total ? (progress.executed / progress.total * 100) + "%" : "0%" }} /></div>
      <small>Somente resultados salvos contam como executados.</small>
    </section>
    {saved && <div className="notice mt-4" role="status">{saved}</div>}
    {importWarning && <div className="notice error mt-4" role="alert">{importWarning}</div>}

    {editing && <section className="panel mt-5">
      <div className="section-heading"><h2>Editar dados da TF</h2><button onClick={() => setEditing(false)} aria-label="Fechar edição"><X size={18} /></button></div>
      <form onSubmit={taskForm.handleSubmit((values) => void saveTask.mutateAsync(values))} className="stack mt-4">
        <div className="form-grid">
          <label className="field grow-2">Título<input {...taskForm.register("titulo")} />
            {taskForm.formState.errors.titulo && <small className="text-error">{taskForm.formState.errors.titulo.message}</small>}</label>
          <label className="field">Tipo<select {...taskForm.register("tipo_teste")}><option>BUILD</option><option>RELEASE</option></select></label>
          <label className="field">Código<input {...taskForm.register("codigo")} /></label>
          <label className="field">Módulo<input {...taskForm.register("sistema")} /></label>
          <label className="field">Versão<input {...taskForm.register("versao")} /></label>
        </div>
        <label className="field">Descrição<textarea rows={5} {...taskForm.register("descricao")} /></label>
        <details className="generator-context">
          <summary>Análise técnica e informações adicionais</summary>
          <div className="form-grid mt-4">
            <label className="field">Ambiente<input {...taskForm.register("ambiente")} /></label>
            <label className="field">Base de teste<input {...taskForm.register("base_teste")} /></label>
            <label className="field">Empresa<input {...taskForm.register("empresa")} /></label>
            <label className="field">Testador<input {...taskForm.register("testador")} /></label>
          </div>
          <div className="stack mt-4">
            <label className="field">Como funciona / análise<textarea rows={3} {...taskForm.register("explicacao")} /></label>
            <label className="field">Causa identificada<textarea rows={3} {...taskForm.register("causa")} /></label>
            <label className="field">Correção realizada<textarea rows={3} {...taskForm.register("correcao")} /></label>
            <label className="field">Conclusão<textarea rows={3} {...taskForm.register("conclusao")} /></label>
            <label className="field">Observações<textarea rows={3} {...taskForm.register("observacoes")} /></label>
          </div>
        </details>
        <Button type="submit" isDisabled={saveTask.isPending}>Salvar alterações</Button>
        {saveTask.isError && <p className="notice error" role="alert">{saveTask.error.message}</p>}
      </form>
    </section>}



    {showRequirements && <Suspense fallback={<p role="status" className="notice mt-4">Carregando requisitos…</p>}>
      <RequirementsPanel key={task.id} task={task} userId={userId}
        scenarios={scenarios.data || []} onClose={() => setShowRequirements(false)} />
    </Suspense>}
    {showEvidence && <Suspense fallback={<p role="status" className="notice mt-4">Carregando evidências…</p>}>
      <EvidencePanel key={task.id} task={task} userId={userId}
        scenarios={scenarios.data || []} onClose={() => setShowEvidence(false)} />
    </Suspense>}
    {showLinks && <Suspense fallback={<p role="status" className="notice mt-4">Carregando releases…</p>}>
      <LinksPanel key={task.id} task={task} userId={userId} onClose={() => setShowLinks(false)} />
    </Suspense>}
    {generatorMode && <div ref={generatorRef} tabIndex={-1}
      role="region" aria-label="Gerador de conteúdo com IA" className="mt-4 qa-workflow-anchor">
      <Suspense fallback={<p role="status" className="notice">Carregando gerador…</p>}>
        <GeneratorPanel key={task.id + generatorMode} task={task} userId={userId}
          scenarios={scenarios.data || []} mode={generatorMode} onClose={() => setGeneratorMode(null)} />
      </Suspense>
    </div>}
    {showDocuments && <Suspense fallback={<p role="status" className="notice mt-4">Carregando documentos…</p>}>
      <DocumentsPanel task={task} scenarios={scenarios.data || []} userId={userId}
        focusOnOpen={focusReport} />
    </Suspense>}
    {showDiagrams && <Suspense fallback={<p role="status" className="notice mt-4">Carregando editor de diagramas…</p>}>
      <DiagramPanel task={task} scenarios={scenarios.data || []} userId={userId}
        focusAi={focusDiagramAi} />
    </Suspense>}
    {showScenarioForm && <section ref={editorRef} className="panel mt-5 qa-workflow-anchor"
      aria-label={editingScenario ? "Editar cenário" : "Novo cenário"}>
      <div className="section-heading"><div><p className="eyebrow">NOVO CASO</p><h2>{editingScenario ? "Editar cenário" : "Cadastrar cenário"}</h2></div>
        <button onClick={() => setShowScenarioForm(false)} aria-label="Fechar"><X size={18} /></button></div>
      <form className="stack mt-4" onSubmit={scenarioForm.handleSubmit((values, event) => {
        const submitter = (event?.nativeEvent as SubmitEvent | undefined)?.submitter;
        void createScenario.mutateAsync({
          draft: values,
          another: !editingScenario && submitter?.getAttribute("data-next") === "another"
        });
      })}>
        <label className="field">Título<input placeholder="Ex.: Aplicar desconto em item desdobrado" {...scenarioForm.register("titulo")} />
          {scenarioForm.formState.errors.titulo && <small role="alert" className="text-error">{scenarioForm.formState.errors.titulo.message}</small>}</label>
        <label className="field">Passos<textarea rows={4} {...scenarioForm.register("passos")} />
          {scenarioForm.formState.errors.passos && <small role="alert" className="text-error">{scenarioForm.formState.errors.passos.message}</small>}</label>
        <label className="field">Resultado esperado<textarea rows={3} {...scenarioForm.register("esperado")} />
          {scenarioForm.formState.errors.esperado && <small role="alert" className="text-error">{scenarioForm.formState.errors.esperado.message}</small>}</label>
        <label className="field">Observações (opcional)<textarea rows={2} {...scenarioForm.register("observacoes")} /></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onPress={() => setShowScenarioForm(false)}>Cancelar</Button>
          {!editingScenario && <Button type="submit" variant="secondary"
            data-next="another" isDisabled={createScenario.isPending}>Salvar e criar outro</Button>}
          <Button type="submit" isDisabled={createScenario.isPending}>
            {editingScenario ? "Salvar cenário" : "Adicionar cenário"}
          </Button>
        </div>
        {createScenario.isError && <p role="alert" className="notice error">{createScenario.error.message}</p>}
      </form>
    </section>}

    <section ref={executionRef} className="panel mt-5 qa-workflow-anchor" aria-label="Execução dos cenários">
      <div className="section-heading"><div><p className="eyebrow">EXECUÇÃO</p><h2>Cenários</h2>
        <p className="text-muted">Registre somente o que foi efetivamente testado.</p></div>
        <span className="count-pill">{scenarios.data?.length ?? 0} casos</span></div>
      <div className="filter-line mt-4" role="group" aria-label="Filtrar cenários">
        {([["all", "Todos"], ["pending", "Pendentes"], ["failed", "Falha / bloqueio"]] as const).map(([value, label]) =>
          <button key={value} data-qa-filter={value}
            className={"filter-chip " + (filter === value ? "selected" : "")}
            onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}
      </div>
      {scenarios.isPending && <p role="status" className="empty-state">Carregando cenários…</p>}
      {scenarios.isError && <p role="alert" className="notice error">{scenarios.error.message}</p>}
      {scenarios.isSuccess && visible.length === 0 && <p className="empty-state">
        {scenarios.data.length ? "Nenhum cenário neste filtro." : "Esta TF ainda não possui cenários. Cadastre o primeiro."}
      </p>}
      <div className="scenarios">
        {visible.map((scenario, index) => <article className="scenario" key={scenario.id}>
          <div className="scenario-heading"><div><span className="eyebrow">CENÁRIO {String(index + 1).padStart(2, "0")}</span>
              <h3>{scenario.titulo}</h3></div><span className={"status-chip " + scenario.status}>
                {scenarioStatusLabels[scenario.status]}</span></div>
          <div className="flex gap-2 mt-3">
            <button className="secondary-link" onClick={() => {
              setEditingScenario(scenario);
              scenarioForm.reset({
                titulo: scenario.titulo, passos: scenario.passos,
                esperado: scenario.esperado, observacoes: scenario.observacoes
              });
              setShowScenarioForm(true);
              window.scrollTo({ top: 280, behavior: "smooth" });
            }}>Editar cenário</button>
            <button className="secondary-link" disabled={deleteScenarioMutation.isPending} onClick={() => {
              if (window.confirm("Excluir permanentemente este cenário?"))
                void deleteScenarioMutation.mutateAsync(scenario.id);
            }}>Excluir</button>
          </div>
          <div className="scenario-result-actions" role="group" aria-label={"Resultado de " + scenario.titulo}>
            <button data-qa-next-pending={filter === "pending" && index === 0 ? "true" : undefined}
              disabled={saveResult.isPending} onClick={() => choose(scenario, "aprovado")}><Check size={16} /> Funcionou</button>
            <button disabled={saveResult.isPending} onClick={() => choose(scenario, "reprovado")}>Não funcionou</button>
            <button disabled={saveResult.isPending} onClick={() => choose(scenario, "bloqueado")}>Bloqueado</button>
            <button disabled={saveResult.isPending} onClick={() => choose(scenario, "nao_executado")}>Desfazer execução</button>
          </div>
          {scenario.obtido && <p className="result-note"><strong>Observado:</strong> {scenario.obtido}</p>}
          <details className="scenario-details"><summary><CircleHelp size={16} /> Passos e resultado esperado</summary>
            <div><strong>Passos</strong><p>{scenario.passos || "Não informado"}</p></div>
            <div><strong>Esperado</strong><p>{scenario.esperado || "Não informado"}</p></div>
            {scenario.observacoes && <div><strong>Observações</strong><p>{scenario.observacoes}</p></div>}
          </details>
        </article>)}
      </div>
      {(saveResult.isError || deleteScenarioMutation.isError) && <p className="notice error mt-4" role="alert">
        {saveResult.error?.message || deleteScenarioMutation.error?.message}
      </p>}
    </section>

    <div className="qa-task-settings-heading">
      <p className="eyebrow">ADMINISTRAÇÃO DA TF</p>
      <h2>Estado e compartilhamento</h2>
      <p className="text-muted text-sm">Configurações separadas da execução para evitar mudanças acidentais.</p>
    </div>
    <section className="panel mt-4" aria-label="Situação da tarefa">
      <div className="flex flex-wrap items-end gap-3">
        <label className="field" style={{ minWidth: 190 }}>Situação da TF
          <select value={nextStatus} onChange={(e) =>
            setNextStatus(taskStatuses.find((value) => value === e.target.value) ?? "rascunho")}>
            {taskStatuses.map((value) => <option value={value} key={value}>{taskStatusLabels[value]}</option>)}
          </select>
        </label>
        <Button variant="secondary" onPress={() => void updateStatus.mutateAsync(nextStatus)}
          isDisabled={nextStatus === task.status || updateStatus.isPending}>Atualizar situação</Button>
        <div className="ml-auto">
          <Button variant="secondary" isDisabled={deleteTaskMutation.isPending} onPress={() => {
            if (window.confirm("Excluir permanentemente esta TF e seus cenários?")) void deleteTaskMutation.mutateAsync();
          }}>Excluir TF</Button>
        </div>
      </div>
      {(updateStatus.isError || deleteTaskMutation.isError) &&
        <p role="alert" className="notice error mt-3">
          {updateStatus.error?.message || deleteTaskMutation.error?.message}
        </p>}
    </section>
    <section className="panel mt-4" aria-label="Compartilhamento público">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PRIVACIDADE E VISIBILIDADE</p>
          <h2>Compartilhamento da TF</h2>
          <p className="text-muted text-sm mt-2">
            {task.publica ? "Publicada — qualquer visitante pode consultar o resumo, os cenários, os resultados observados e os diagramas."
              : "Privada — esta TF ainda não foi compartilhada publicamente."}
          </p>
        </div>
        <span className={"status-chip " + (task.publica ? "aprovado" : "rascunho")}>
          {task.publica ? "Pública" : "Privada"}
        </span>
      </div>
      {task.user_id === userId ? <div className="flex flex-wrap gap-3 items-center mt-4">
        <Button variant="secondary" isDisabled={publication.isPending || (!task.publica && !publicSharingEnabled)}
          onPress={() => {
            const next = !task.publica;
            const label = next
              ? "Publicar esta TF? Título, descrição, análise técnica, cenários, resultados observados e diagramas ficarão acessíveis sem login. Revise dados internos antes de confirmar."
              : "Retirar esta TF da biblioteca pública? Links compartilhados deixarão de funcionar após a alteração.";
            if (window.confirm(label)) void publication.mutateAsync(next);
          }}>
          <Share2 size={16}/> {task.publica ? "Retirar publicação" : "Publicar TF"}
        </Button>
        {!task.publica && !publicSharingEnabled && <p role="status" className="text-sm text-muted">
          Novas publicações desativadas até a homologação das permissões de acesso.
        </p>}
        {task.publica && <Link to="/publicas" search={{ tf: task.id }} className="secondary-link">
          <ExternalLink size={16}/> Abrir visão pública
        </Link>}
      </div> : <p className="text-muted text-sm mt-3">
        A publicação só pode ser alterada pelo autor da TF, inclusive em consulta administrativa.
      </p>}
      {publication.isError && <p className="notice error mt-3" role="alert">{publication.error.message}</p>}
    </section>

    {pending && <div className="dialog-backdrop" role="presentation">
      <section ref={observedModalRef} className="dialog-card" role="dialog" aria-modal="true"
        aria-labelledby="observed-heading" tabIndex={-1}>
        <h2 id="observed-heading">{pending.status === "reprovado" ? "Registrar falha" : "Registrar bloqueio"}</h2>
        <p className="text-muted mt-2">{pending.scenario.titulo}. Descreva o resultado observado.</p>
        <form className="stack mt-4" onSubmit={(event) => {
          event.preventDefault();
          saveResult.mutate({ scenario: pending.scenario, status: pending.status, obtido: observed });
        }}>
          <label className="field">Comportamento observado
            <textarea required rows={5} value={observed} onChange={(e) => setObserved(e.target.value)}
              placeholder="O que ocorreu durante a execução?" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" isDisabled={saveResult.isPending}
              onPress={() => setPending(null)}>Cancelar</Button>
            <Button type="submit" isDisabled={saveResult.isPending || !observed.trim()}>Salvar resultado</Button>
          </div>
        </form>
      </section>
    </div>}
  </div>;
}
