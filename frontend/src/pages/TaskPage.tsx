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
import { QAModal } from "../components/ui/QAModal";

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
  const [showSettings,setShowSettings]=useState(false);
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
  const [filter, setFilter] = useState<"all" | "pending" | "failed">("all");
  const [saved, setSaved] = useState("");
  function closeSettings(){
    if(updateStatus.isPending||publication.isPending||deleteTaskMutation.isPending)return;
    if(nextStatus!==task?.status && !window.confirm("Descartar a situação selecionada sem atualizar?"))return;
    setShowSettings(false);
  }
  function closeResult(){
    if(saveResult.isPending)return;
    if(observed.trim() && !window.confirm("Descartar a observação ainda não salva?"))return;
    setPending(null);setObserved("");
  }
  const [focusNextPending, setFocusNextPending] = useState(false);
  const [resumeFocus, setResumeFocus] = useState(false);
  const editorRef = useRef<HTMLElement | null>(null);
  const executionRef = useRef<HTMLElement | null>(null);
  const pendingCount = (scenarios.data ?? []).filter((item) =>
    item.status === "nao_executado").length;

  function closeToolPanels() {
    setShowDiagrams(false);setShowDocuments(false);setShowRequirements(false);
    setShowEvidence(false);setShowLinks(false);setGeneratorMode(null);
  }
  function openTool(kind:"diagrams"|"documents"|"requirements"|"evidence"|"links"|"post"|"teste") {
    closeToolPanels();
    setEditing(false);setShowScenarioForm(false);setShowSettings(false);
    if(kind==="diagrams")setShowDiagrams(true);
    else if(kind==="documents")setShowDocuments(true);
    else if(kind==="requirements")setShowRequirements(true);
    else if(kind==="evidence")setShowEvidence(true);
    else if(kind==="links")setShowLinks(true);
    else setGeneratorMode(kind);
  }
  function closeTaskEditor(){
    if(saveTask.isPending)return;
    if(taskForm.formState.isDirty&&!window.confirm("Descartar as alterações não salvas da TF?"))return;
    setEditing(false);
  }
  function closeScenarioEditor(){
    if(createScenario.isPending)return;
    if(scenarioForm.formState.isDirty&&!window.confirm("Descartar o cenário ainda não salvo?"))return;
    setShowScenarioForm(false);setEditingScenario(null);
    scenarioForm.reset();
  }

  function startScenario() {
    if(task?.user_id!==userId)return;
    closeToolPanels();setEditing(false);setShowSettings(false);
    setEditingScenario(null);
    scenarioForm.reset();
    setShowScenarioForm(true);
  }

  function openDiagramAi() {
    setFocusDiagramAi(true);openTool("diagrams");
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
    closeToolPanels();setEditing(false);setShowSettings(false);
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
          <Button variant="secondary" onPress={() => {
            closeToolPanels();setShowScenarioForm(false);setShowSettings(false);
            setEditing(true);
          }}>
            <FilePenLine size={16} /> Editar TF
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
        <Button onPress={startScenario} isDisabled={task.user_id!==userId}><Plus size={17} /> Adicionar cenário</Button>
        <Button variant="secondary" onPress={startPendingExecution} isDisabled={scenarios.isPending}>
          <ListChecks size={17} /> Testar pendentes
        </Button>
        <Button variant="secondary" isDisabled={scenarios.isPending || scenarios.isError || scenarios.isFetching}
          onPress={() => {setFocusReport(true);openTool("documents");}}><FileText size={17} /> Conferir relatório</Button>
      </div>
      <div className="qa-ai-section-heading">
        <p className="eyebrow">GERAÇÃO ASSISTIDA</p>
        <p>Escolha o que criar com a IA, utilizando os dados desta TF.</p>
      </div>
      <div className="qa-ai-action-grid" role="group" aria-label="Ferramentas de IA">
        <button type="button" className="qa-ai-action" 
          onClick={() => openTool("teste")}>
          <span className="qa-ai-icon"><ListChecks size={19} /></span>
          <span><strong>Gerar casos com IA</strong><small>Roteiro e cenários revisáveis para executar</small></span>
          <WandSparkles size={17} className="qa-ai-arrow" />
        </button>
        <button type="button" className="qa-ai-action" 
          onClick={() => openTool("post")}>
          <span className="qa-ai-icon"><FileText size={19} /></span>
          <span><strong>Gerar post com IA</strong><small>Comunicado no padrão e versão na TF</small></span>
          <WandSparkles size={17} className="qa-ai-arrow" />
        </button>
        <button type="button" className="qa-ai-action" 
          onClick={openDiagramAi}>
          <span className="qa-ai-icon"><Workflow size={19} /></span>
          <span><strong>Gerar diagrama com IA</strong><small>Fluxograma Mermaid com prévia e edição</small></span>
          <Sparkles size={17} className="qa-ai-arrow" />
        </button>
      </div>
      <div className="qa-workbench-tools" role="group" aria-label="Ferramentas da TF">
        <div className="qa-workbench-tools-heading">
          <p className="eyebrow">OUTRAS FERRAMENTAS</p>
          <p className="text-muted text-sm">Abra somente a ferramenta que precisa, sem sair da execução.</p>
        </div>
        <div className="qa-workbench-tools-grid">
          <button type="button" onClick={() => openTool("requirements")}
            className="qa-workbench-tool"><BookText size={17} /> Requisitos e cobertura</button>
          <button type="button" onClick={() => openTool("evidence")}
            className="qa-workbench-tool"><ClipboardList size={17} /> Evidências e auditoria</button>
          <button type="button" onClick={() => openTool("links")}
            className="qa-workbench-tool"><GitMerge size={17} /> Releases e referências</button>
          <button type="button" onClick={() => {setFocusReport(false);openTool("documents");}}
            className="qa-workbench-tool"><FileText size={17} /> Documentos / relatório</button>
          <button type="button" onClick={() => {setFocusDiagramAi(false);openTool("diagrams");}}
            className="qa-workbench-tool"><GitBranchPlus size={17} /> Editor de diagramas</button>
        </div>
      </div>
    </section>
    {saved && <div className="notice mt-4" role="status">{saved}</div>}
    {importWarning && <div className="notice error mt-4" role="alert">{importWarning}</div>}

    {editing && <QAModal open={editing} title="Editar TF" eyebrow="DADOS DO REGISTRO"
      description="Atualize os dados do chamado sem sair da execução." size="lg"
      busy={saveTask.isPending} initialFocus={'input[name="titulo"]'} onClose={closeTaskEditor}>
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
        <div className="qa-modal-actions">
          <Button type="button" variant="secondary" onPress={closeTaskEditor}>Cancelar</Button>
          <Button type="submit" isDisabled={saveTask.isPending||task.user_id!==userId}>Salvar alterações</Button>
        </div>
        {saveTask.isError && <p className="notice error" role="alert">{saveTask.error.message}</p>}
      </form>
    </QAModal>}



    <QAModal open={showRequirements} keepMounted title="Requisitos e cobertura"
      eyebrow="RASTREABILIDADE" size="full" onClose={()=>setShowRequirements(false)}>
      <Suspense fallback={<p role="status" className="notice">Carregando requisitos…</p>}>
        <RequirementsPanel key={task.id} task={task} userId={userId}
          scenarios={scenarios.data || []} onClose={() => setShowRequirements(false)}/>
      </Suspense>
    </QAModal>
    <QAModal open={showEvidence} keepMounted title="Evidências e auditoria"
      eyebrow="REGISTROS" size="full" onClose={()=>setShowEvidence(false)}>
      <Suspense fallback={<p role="status" className="notice">Carregando evidências…</p>}>
        <EvidencePanel key={task.id} task={task} userId={userId}
          scenarios={scenarios.data || []} onClose={() => setShowEvidence(false)}/>
      </Suspense>
    </QAModal>
    <QAModal open={showLinks} keepMounted title="Releases e referências"
      eyebrow="VÍNCULOS" size="full" onClose={()=>setShowLinks(false)}>
      <Suspense fallback={<p role="status" className="notice">Carregando releases…</p>}>
        <LinksPanel key={task.id} task={task} userId={userId} onClose={() => setShowLinks(false)}/>
      </Suspense>
    </QAModal>
    {generatorMode && <QAModal open={Boolean(generatorMode)}
      title={generatorMode==="post"?"Gerar post com IA":"Gerar casos com IA"}
      eyebrow="ASSISTENTE DE IA" size="full" onClose={()=>setGeneratorMode(null)}>
      <Suspense fallback={<p role="status" className="notice">Carregando gerador…</p>}>
        <GeneratorPanel key={task.id + generatorMode} task={task} userId={userId}
          scenarios={scenarios.data || []} mode={generatorMode}
          onClose={() => setGeneratorMode(null)} />
      </Suspense>
    </QAModal>}
    <QAModal open={showDocuments} keepMounted title="Documentos e relatório"
      eyebrow="ENTREGÁVEIS" size="full" initialFocus="#documents-heading" onClose={()=>setShowDocuments(false)}>
      <Suspense fallback={<p role="status" className="notice">Carregando documentos…</p>}>
        <DocumentsPanel task={task} scenarios={scenarios.data || []} userId={userId}
          focusOnOpen={focusReport}/>
      </Suspense>
    </QAModal>
    <QAModal open={showDiagrams} keepMounted title="Diagramas da TF"
      eyebrow="DOCUMENTAÇÃO VISUAL" size="full" initialFocus="#diagram-ai-heading" onClose={()=>setShowDiagrams(false)}>
      <Suspense fallback={<p role="status" className="notice">Carregando editor de diagramas…</p>}>
        <DiagramPanel task={task} scenarios={scenarios.data || []} userId={userId}
          focusAi={focusDiagramAi}/>
      </Suspense>
    </QAModal>
    {showScenarioForm && <QAModal open={showScenarioForm}
      title={editingScenario?"Editar cenário":"Cadastrar cenário"} eyebrow="CASOS DE TESTE"
      description="Documente os passos e o resultado esperado; a execução fica separada."
      initialFocus={'input[name="titulo"]'} busy={createScenario.isPending} onClose={closeScenarioEditor}>
      <section ref={editorRef} className="qa-modal-editor">
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
        <div className="qa-modal-actions">
          <Button type="button" variant="secondary" onPress={closeScenarioEditor}>Cancelar</Button>
          {!editingScenario && <Button type="submit" variant="secondary"
            data-next="another" isDisabled={createScenario.isPending}>Salvar e criar outro</Button>}
          <Button type="submit" isDisabled={createScenario.isPending}>
            {editingScenario ? "Salvar cenário" : "Adicionar cenário"}
          </Button>
        </div>
        {createScenario.isError && <p role="alert" className="notice error">{createScenario.error.message}</p>}
      </form>
      </section>
    </QAModal>}

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
          <div className="scenario-heading"><div><span className="eyebrow">CENÁRIO {String(scenario.ordem).padStart(2, "0")}</span>
              <h3>{scenario.titulo}</h3></div><span className={"status-chip " + scenario.status}>
                {scenarioStatusLabels[scenario.status]}</span></div>
          {task.user_id===userId && <div className="flex gap-2 mt-3">
            <button className="secondary-link" onClick={() => {
              setEditingScenario(scenario);
              scenarioForm.reset({
                titulo: scenario.titulo, passos: scenario.passos,
                esperado: scenario.esperado, observacoes: scenario.observacoes
              });
              closeToolPanels();setEditing(false);setShowSettings(false);
              setShowScenarioForm(true);
            }}>Editar cenário</button>
            <button className="secondary-link" disabled={deleteScenarioMutation.isPending} onClick={() => {
              if (window.confirm("Excluir permanentemente este cenário?"))
                void deleteScenarioMutation.mutateAsync(scenario.id);
            }}>Excluir</button>
          </div>}
          <div className="scenario-result-actions" role="group" aria-label={"Resultado de " + scenario.titulo}>
            <button data-qa-next-pending={filter === "pending" && index === 0 ? "true" : undefined}
              disabled={saveResult.isPending || task.user_id!==userId} onClick={() => choose(scenario, "aprovado")}><Check size={16} /> Funcionou</button>
            <button disabled={saveResult.isPending || task.user_id!==userId} onClick={() => choose(scenario, "reprovado")}>Não funcionou</button>
            <button disabled={saveResult.isPending || task.user_id!==userId} onClick={() => choose(scenario, "bloqueado")}>Bloqueado</button>
            <button disabled={saveResult.isPending || task.user_id!==userId} onClick={() => choose(scenario, "nao_executado")}>Desfazer execução</button>
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

    <section className="qa-settings-teaser mt-5" aria-label="Estado e compartilhamento">
      <div>
        <p className="eyebrow">CONTROLE DA TF</p>
        <h2>Estado e compartilhamento</h2>
        <p className="text-muted text-sm">Situação atual: {taskStatusLabels[task.status]} ·
          {task.publica ? " Pública" : " Privada"}. Alterações somente com confirmação.</p>
      </div>
      <Button variant="secondary" onPress={() => setShowSettings(true)}>
        <Share2 size={16}/> Configurações da TF
      </Button>
    </section>
    {showSettings && <QAModal open={showSettings} title="Estado e compartilhamento"
      eyebrow="CONFIGURAÇÕES" size="lg" onClose={closeSettings}
      busy={updateStatus.isPending||publication.isPending||deleteTaskMutation.isPending}>
    <section className="panel mt-4" aria-label="Situação da tarefa">
      <div className="flex flex-wrap items-end gap-3">
        <label className="field" style={{ minWidth: 190 }}>Situação da TF
          <select disabled={task.user_id!==userId} value={nextStatus} onChange={(e) =>
            setNextStatus(taskStatuses.find((value) => value === e.target.value) ?? "rascunho")}>
            {taskStatuses.map((value) => <option value={value} key={value}>{taskStatusLabels[value]}</option>)}
          </select>
        </label>
        <Button variant="secondary" onPress={() => void updateStatus.mutateAsync(nextStatus)}
          isDisabled={nextStatus === task.status || updateStatus.isPending || task.user_id!==userId}>Atualizar situação</Button>
        <div className="ml-auto">
          <Button variant="secondary" isDisabled={deleteTaskMutation.isPending || task.user_id!==userId} onPress={() => {
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


    </QAModal>}

    {pending && <QAModal open={Boolean(pending)}
      title={pending.status === "reprovado"?"Registrar falha":"Registrar bloqueio"}
      eyebrow="EXECUÇÃO DE CENÁRIO" size="sm" onClose={closeResult}
      busy={saveResult.isPending} initialFocus="textarea"
      description={pending.scenario.titulo+" · Registre exatamente o comportamento observado."}>
      <form className="stack" onSubmit={(event)=>{
        event.preventDefault();
        if(!saveResult.isPending)saveResult.mutate({
          scenario:pending.scenario,status:pending.status,obtido:observed
        });
      }}>
        <label className="field">Comportamento observado
          <textarea required rows={5} value={observed}
            onChange={(e)=>setObserved(e.target.value)}
            placeholder="O que ocorreu durante a execução?"/>
        </label>
        <div className="qa-modal-actions">
          <Button type="button" variant="secondary" isDisabled={saveResult.isPending}
            onPress={closeResult}>Cancelar</Button>
          <Button type="submit" isDisabled={saveResult.isPending||!observed.trim()}>Salvar resultado</Button>
        </div>
        {saveResult.isError&&<p role="alert" className="notice error">{saveResult.error.message}</p>}
      </form>
    </QAModal>}
  </div>;
}
