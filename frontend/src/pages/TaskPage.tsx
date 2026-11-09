import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {ToastNotice,notify} from "../components/ui/Toasts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowLeft, Check, CircleHelp, ExternalLink, FilePenLine, ListChecks, Plus, Settings2, Share2, Rows3, ScanEye, BookCopy, Sparkles } from "lucide-react";
import GuidedExecution from "../features/executions/GuidedExecution";
import {
  TaskViewTabs, TaskOverview, TaskDeliverables
} from "../features/tasks/TaskWorkspaceSections";
import type { TaskTab } from "../features/tasks/TaskWorkspaceSections";
import {
  applyTaskAiFields,freshTaskAiScenarios,generateTaskAiDraft,onlyNewTaskAiSelections
} from "../features/tasks/task-ai";
import type {SuggestedScenario} from "../features/tasks/task-ai";
import {TaskQuickActions} from "../features/tasks/TaskQuickActions";
import type {QuickActionId} from "../features/tasks/TaskQuickActions";
import { AiStudioTabs } from "../features/generators/AiStudioTabs";
import type { AiStudioMode } from "../features/generators/AiStudioTabs";
import { useAuth } from "../features/auth/AuthProvider";
import {
  addScenario, addExtractedScenarios, getAdminRole, listScenarios, saveScenarioResult, updateTask,
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
import {getTaskById} from "../features/tasks/task-search-data";
import {getTaskRights} from "../features/collaboration/team-data";
import type {TaskRights} from "../features/collaboration/team-data";

const DiagramPanel = lazy(() => import("../features/diagrams/DiagramPanel"));
const DiagramLibrary = lazy(() => import("../features/diagrams/DiagramLibrary").then(
  module=>({default:module.DiagramLibrary})
));
const DocumentLibrary = lazy(() => import("../features/documents/DocumentLibrary").then(
  module=>({default:module.DocumentLibrary})
));
const GeneratorPanel = lazy(() => import("../features/generators/GeneratorPanel"));
const DocumentsPanel = lazy(() => import("../features/documents/DocumentsPanel"));
const RequirementsPanel = lazy(() => import("../features/requirements/RequirementsPanel"));
const EvidencePanel = lazy(() => import("../features/evidence/EvidencePanel"));
const LinksPanel = lazy(() => import("../features/links/LinksPanel"));
const ExecutionHistoryPanel = lazy(() => import("../features/history/ExecutionHistoryPanel"));
const TaskCollaborationPanel = lazy(() => import("../features/collaboration/TaskCollaborationPanel"));
const ScenarioLibraryPanel=lazy(()=>import("../features/scenario-library/ScenarioLibraryPanel"));

export default function TaskPage() {
  const { taskId } = useParams({ from: "/tarefa/$taskId" });
  const { newScenario, resume } = useSearch({ from: "/tarefa/$taskId" });
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const navigate = useNavigate();
  const focusTask = useFocus((s) => s.setTask);
  const queryClient = useQueryClient();
  const role = useQuery({ queryKey: ["role", userId], queryFn: () => getAdminRole(userId), enabled: !!userId });
  const tasks=useQuery({
    queryKey:["task",userId,taskId],
    queryFn:()=>getTaskById(taskId,userId,role.data??false),
    enabled:!!userId && role.data!==undefined
  });
  const task=tasks.data;
  const own=task?.user_id===userId;
  const rightsQuery=useQuery({
    queryKey:["f5-rights",userId,taskId],
    queryFn:()=>getTaskRights(taskId,userId,task!.user_id),
    enabled:!!task&&!own&&!role.data,
    staleTime:15000
  });
  const rights:TaskRights=own?{role:"dono",canExecute:true,canComment:true,canManage:true}:
    rightsQuery.data??{role:"nenhum",canExecute:false,canComment:false,canManage:false};
  const canExecute=rights.canExecute;
  const scenarios = useQuery({
    queryKey: ["scenarios", userId, taskId], queryFn: () => listScenarios(taskId),
    enabled: Boolean(task)
  });
  const [activeTab, setActiveTab] = useState<TaskTab>("summary");
  const [executionMode, setExecutionMode] = useState<"list"|"guided">("list");
  const [evidenceTarget, setEvidenceTarget] = useState<string|null>(null);
  const [evidenceRequest, setEvidenceRequest] = useState(0);
  const [editing, setEditing] = useState(false);
  const [taskAiConsent,setTaskAiConsent]=useState<string|null>(null);
  const [taskAiBusy,setTaskAiBusy]=useState(false);
  const [taskAiScenarios,setTaskAiScenarios]=useState<SuggestedScenario[]>([]);
  const [taskAiPreviewSource,setTaskAiPreviewSource]=useState<string|null>(null);
  const [showSettings,setShowSettings]=useState(false);
  const [showScenarioForm, setShowScenarioForm] = useState(false);
  const [aiMode, setAiMode] = useState<AiStudioMode|null>(null);
  const [visitedAi, setVisitedAi] = useState<AiStudioMode[]>([]);
  const [focusDiagramAi, setFocusDiagramAi] = useState(false);
  const [editingDiagramId,setEditingDiagramId]=useState<string|null>(null);
  const [diagramEditorRevision,setDiagramEditorRevision]=useState(0);
  const [showDocuments, setShowDocuments] = useState(false);
  const [focusReport, setFocusReport] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [showCollaboration,setShowCollaboration]=useState(false);
  const [showLibrary,setShowLibrary]=useState(false);

  // TanStack Router reuses this page instance when navigating from one TF to
  // another. Never carry an open tool (or another TF's draft) to the new task.
  useEffect(()=>{
    setActiveTab("summary");setExecutionMode("list");
    setEvidenceTarget(null);setEvidenceRequest(0);
    setEditing(false);setShowScenarioForm(false);setShowSettings(false);
    setTaskAiConsent(null);setTaskAiScenarios([]);setTaskAiPreviewSource(null);
    setAiMode(null);setVisitedAi([]);setFocusDiagramAi(false);
    setEditingDiagramId(null);setDiagramEditorRevision(0);
    setShowDocuments(false);
    setFocusReport(false);setShowRequirements(false);setShowEvidence(false);
    setShowLinks(false);setShowHistory(false);setShowCollaboration(false);
    setShowLibrary(false);
    setEditingScenario(null);setPending(null);setObserved("");
  },[taskId]);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [nextStatus, setNextStatus] = useState<(typeof taskStatuses)[number]>("rascunho");
  const [importWarning, setImportWarning] = useState("");
  const [pending, setPending] = useState<{ scenario: Scenario; status: ExecutionResult["status"] } | null>(null);
  const [observed, setObserved] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "failed">("all");
  const setSaved = notify.success;
  // TanStack Router reuses TaskPage for different TF IDs. Do not display a
  // previous task's success notice or keep its pending-focus state.
  useEffect(()=>{
    setSaved("");setFocusNextPending(false);setResumeFocus(false);
    setImportWarning("");
  },[taskId]);
  function closeSettings(){
    if(updateStatus.isPending||publication.isPending||deleteTaskMutation.isPending)return;
    if(nextStatus!==task?.status && !window.confirm("Descartar a situação selecionada sem atualizar?"))return;
    if(task)setNextStatus(task.status);
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
    setAiMode(null);setShowDocuments(false);setShowRequirements(false);
    setShowEvidence(false);setShowLinks(false);setShowHistory(false);setShowCollaboration(false);
    setShowLibrary(false);
  }
  function openTool(kind:"diagrams"|"documents"|"requirements"|"evidence"|"links"|"post"|"teste"|"history"|"collaboration") {
    closeToolPanels();
    setEditing(false);setShowScenarioForm(false);setShowSettings(false);
    if(kind==="diagrams"||kind==="post"||kind==="teste") {
      setAiMode(kind);
      setVisitedAi(previous=>previous.includes(kind)?previous:[...previous,kind]);
    } else if(kind==="documents")setShowDocuments(true);
    else if(kind==="requirements")setShowRequirements(true);
    else if(kind==="evidence")setShowEvidence(true);
    else if(kind==="links")setShowLinks(true);
    else if(kind==="history")setShowHistory(true);
    else if(kind==="collaboration")setShowCollaboration(true);
  }
  function closeTaskEditor(){
    if(saveTask.isPending)return;
    if(taskForm.formState.isDirty){
      if(!window.confirm("Descartar as alterações não salvas da TF?"))return;
      taskForm.reset();
    }
    setEditing(false);setTaskAiScenarios([]);setTaskAiConsent(null);
    setTaskAiPreviewSource(null);
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

  function openDiagramEditor(id?:string) {
    setEditingDiagramId(id??null);
    setDiagramEditorRevision(value=>value+1);
    setFocusDiagramAi(!id);
    openTool("diagrams");
  }
  function openReportEditor() {
    if(!own)return;
    setFocusReport(true);
    openTool("documents");
  }

  function quickAction(id:QuickActionId){
    switch(id){
      case "run":startPendingExecution();break;
      case "scenario":startScenario();break;
      case "cases":openTool("teste");break;
      case "post":openTool("post");break;
      case "diagram":openDiagramEditor();break;
      case "report":openReportEditor();break;
      case "view-diagrams":setActiveTab("deliverables");break;
      case "documents":setActiveTab("deliverables");break;
      case "evidence":openTool("evidence");break;
      case "requirements":openTool("requirements");break;
      case "links":openTool("links");break;
      case "history":openTool("history");break;
      case "collaboration":openTool("collaboration");break;
    }
  }

  function startPendingExecution() {
    setActiveTab("tests");
    setExecutionMode("guided");
    if(!pendingCount)notify.info(
      "Não há casos pendentes. Adicione um cenário ou consulte os resultados registrados.");
  }

  function openGuidedEvidence(scenario: Scenario) {
    if(task?.user_id!==userId)return;
    setEvidenceTarget(scenario.id);
    setEvidenceRequest(n=>n+1);
    openTool("evidence");
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
    setActiveTab("tests");
    setExecutionMode("guided");
    setFilter("pending");
    setResumeFocus(true);
    if(!pendingCount)notify.info(
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
    if (!resumeFocus || activeTab !== "tests" || !scenarios.isSuccess) return;
    const frame = requestAnimationFrame(() => {
      const target = executionMode==="guided"
        ? document.querySelector<HTMLButtonElement>('[data-qa-guided-primary="true"]')
        : executionRef.current?.querySelector<HTMLButtonElement>('[data-qa-next-pending="true"]')
          ?? executionRef.current?.querySelector<HTMLButtonElement>('[data-qa-filter="pending"]');
      target?.scrollIntoView({ behavior: "auto", block: "center" });
      target?.focus({ preventScroll: true });
      setResumeFocus(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [resumeFocus, activeTab, filter, executionMode, scenarios.isSuccess, scenarios.data]);

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
      queryClient.invalidateQueries({ queryKey: ["task", userId, taskId] }),
      queryClient.invalidateQueries({ queryKey: ["task-search", userId] }),
      queryClient.invalidateQueries({ queryKey: ["task-stats", userId] }),
      queryClient.invalidateQueries({ queryKey: ["tasks", userId] }),
      queryClient.invalidateQueries({ queryKey: ["scenarios", userId, taskId] }),
      queryClient.invalidateQueries({ queryKey: ["task-progress", userId] }),
      queryClient.invalidateQueries({ queryKey: ["execution-history", userId, taskId] }),
      queryClient.invalidateQueries({ queryKey: ["task-change-history", userId, taskId] })
    ]);
  };
  const saveTask = useMutation({
    mutationFn: async ({draft,suggested}:{
      draft:TaskDraft;suggested:SuggestedScenario[]
    })=>{
      // Save the current form first, regardless of how it was populated.
      const updated=await updateTask(taskId,draft);
      let warning="";
      let appended=0;
      if(suggested.length){
        try{
          const current=await listScenarios(taskId);
          const fresh=onlyNewTaskAiSelections(suggested,current);
          if(fresh.length){
            const nextOrder=Math.max(0,...current.map(item=>item.ordem))+1;
            await addExtractedScenarios(taskId,userId,fresh,nextOrder);
            appended=fresh.length;
          }
        }catch(reason){
          warning=reason instanceof Error?reason.message:"Falha ao salvar os cenários sugeridos.";
        }
      }
      return {updated,warning,appended};
    },
    onSuccess:async ({warning,appended})=>{
      await invalidate();
      if(warning){
        notify.warning("Dados da TF salvos, mas os cenários sugeridos não foram adicionados: "+
          warning+". Revise e tente salvar novamente.");
        // Keep the editor and selected candidates so they can be retried.
        return;
      }
      setEditing(false);setTaskAiScenarios([]);setTaskAiConsent(null);
      setTaskAiPreviewSource(null);
      setSaved("Alterações da TF salvas."+(appended?
        " "+appended+" cenário(s) novo(s) adicionado(s).":""));
    }
  });

  async function regenerateTaskWithAi(){
    if(!own||taskAiBusy||saveTask.isPending)return;
    const source=taskForm.getValues("descricao");
    if(!source.trim()||source.length>20000){
      notify.error("Informe uma descrição de até 20.000 caracteres para usar a IA.");
      return;
    }
    if(taskAiConsent!==source){
      notify.warning("Autorize o envio da descrição atual à NVIDIA.");
      return;
    }
    if(taskForm.formState.isDirty&&!window.confirm(
      "A geração pode substituir campos já alterados neste formulário. Deseja continuar?"
    ))return;
    setTaskAiBusy(true);
    try{
      const result=await generateTaskAiDraft(source);
      if(taskForm.getValues("descricao")!==source){
        notify.warning("A descrição mudou durante a análise. Gere novamente antes de aplicar.");
        return;
      }
      const applied=applyTaskAiFields(taskForm,result,{cleanDescription:source});
      const suggestions=freshTaskAiScenarios(result,scenarios.data??[]);
      setTaskAiScenarios(suggestions);setTaskAiPreviewSource(source);
      notify.success(applied+" campo(s) preenchido(s) pela IA."+
        (suggestions.length?" "+suggestions.length+" cenário(s) novo(s) para revisar.":""));
    }catch(reason){
      notify.error(reason instanceof Error?reason.message:"Falha ao regerar a TF com IA.");
    }finally{
      setTaskAiBusy(false);setTaskAiConsent(null);
    }
  }
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
      setFocusNextPending(executionMode === "list" && filter === "pending" &&
        input.status !== "nao_executado");
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
        queryClient.invalidateQueries({ queryKey: ["task", userId, taskId] }),
        queryClient.invalidateQueries({ queryKey: ["task-search", userId] }),
        queryClient.invalidateQueries({ queryKey: ["task-stats", userId] }),
        queryClient.invalidateQueries({ queryKey: ["public-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["public-task", taskId] })
      ]);
    }
  });
  const deleteTaskMutation = useMutation({
    mutationFn: () => removeTask(taskId),
    onSuccess: async () => {
      focusTask(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks", userId] }),
        queryClient.invalidateQueries({ queryKey: ["task-search", userId] }),
        queryClient.invalidateQueries({ queryKey: ["task-stats", userId] })
      ]);
      await navigate({ to: "/" });
    }
  });
  const deleteScenarioMutation = useMutation({
    mutationFn: (id: string) => removeScenario(taskId, id),
    onSuccess: async () => { setSaved("Cenário excluído."); await invalidate(); }
  });

  useEffect(() => {
    if (!focusNextPending || activeTab !== "tests" || saveResult.isPending || scenarios.isFetching) return;
    const target = executionRef.current?.querySelector<HTMLButtonElement>(
      '[data-qa-next-pending="true"]'
    ) ?? executionRef.current?.querySelector<HTMLButtonElement>(
      '[data-qa-filter="pending"]'
    );
    target?.scrollIntoView({ behavior: "auto", block: "center" });
    target?.focus({ preventScroll: true });
    setFocusNextPending(false);
  }, [focusNextPending, activeTab, saveResult.isPending, scenarios.isFetching, scenarios.data]);

  const progress = progressOf(scenarios.data || []);
  const failedCount = (scenarios.data ?? []).filter(s => s.status==="reprovado").length;
  const blockedCount = (scenarios.data ?? []).filter(s => s.status==="bloqueado").length;
  const progressPercent = progress.total ? Math.round(progress.executed/progress.total*100) : 0;
  const visible = useMemo(() => (scenarios.data || []).filter((scenario) =>
    filter === "all" || filter === "pending" && scenario.status === "nao_executado" ||
    filter === "failed" && (scenario.status === "reprovado" || scenario.status === "bloqueado")
  ), [scenarios.data, filter]);

  async function saveGuidedResult(scenario:Scenario, status:ExecutionResult["status"],note:string){
    if(!canExecute||saveResult.isPending)return false;
    const quick = status==="aprovado"||status==="nao_executado";
    if(quick && needsObservationResetConfirmation(scenario,status) &&
      !window.confirm("Esta ação substituirá o resultado observado anterior. Deseja continuar?")){
      return false;
    }
    const obtained=quick ? quickExecutionResult(scenario,status).obtido : note.trim();
    if(!quick && obtained.length<3)return false;
    await saveResult.mutateAsync({scenario,status,obtido:obtained});
    return true;
  }

  function choose(scenario: Scenario, status: ExecutionResult["status"]) {
    if(!canExecute)return;
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

  return <div className={"page"+(activeTab==="tests" && executionMode==="guided"
    ? " qa-guided-active":"")}>
    <Link to="/" className="back-link"><ArrowLeft size={16} /> Todas as TFs</Link>
    <header className="qa-task-hero mt-4" aria-label="Resumo da TF">
      <div className="qa-task-hero-top">
        <div className="qa-task-identity">
          <p className="qa-task-eyebrow">{task.codigo ? "TF · " + task.codigo : "TAREFA DE TESTE"}</p>
          <h1>{task.titulo}</h1>
          <div className="qa-task-meta">
            <span>{task.tipo_teste}</span>{task.sistema&&<span>{task.sistema}</span>}
            {task.versao&&<span>{task.versao}</span>}
          </div>
        </div>
        <div className="qa-task-hero-controls">
          <span className={"status-chip " + task.status}>{taskStatusLabels[task.status]}</span>
          <Button variant="secondary" isDisabled={task.user_id!==userId} onPress={() => {
            closeToolPanels();setShowScenarioForm(false);setShowSettings(false);
            setTaskAiScenarios([]);setTaskAiPreviewSource(null);setTaskAiConsent(null);
            setEditing(true);
          }}>
            <FilePenLine size={16} /> Editar TF
          </Button>
          <button type="button" className="qa-task-config-button"
            aria-label="Configurações da TF" title="Configurações da TF"
            onClick={() => setShowSettings(true)}>
            <Settings2 size={17} aria-hidden="true"/>
          </button>
        </div>
      </div>
      <div className="qa-task-snapshot qa-task-compact-status" aria-label="Indicadores da execução">
        <span><strong>{progress.executed}/{progress.total}</strong> executados</span>
        <span><strong>{pendingCount}</strong> pendentes</span>
        {(failedCount+blockedCount)>0&&<span><strong>{failedCount+blockedCount}</strong> com problema</span>}
      </div>
      <div className="qa-task-hero-progress">
        <div className="qa-task-hero-meter" role="progressbar"
          aria-label="Cenários executados" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={progressPercent}>
          <span style={{width:progressPercent+"%"}} />
        </div>
      </div>
    </header>
    <TaskViewTabs value={activeTab} onChange={setActiveTab}
      scenarioCount={scenarios.data?.length ?? 0}/>
    <TaskQuickActions key={task.id} owner={!!own} canExecute={canExecute}
      onAction={quickAction}/>
    <section id="qa-task-panel-summary" role="tabpanel" aria-labelledby="qa-task-tab-summary"
      className="qa-task-panel" hidden={activeTab !== "summary"}>
      <TaskOverview description={task.descricao} cause={task.causa} correction={task.correcao}
        pendingCount={pendingCount} total={scenarios.data?.length ?? 0}
        onViewTests={()=>setActiveTab("tests")}/>
    </section>

    <ToastNotice message={importWarning} tone="error"/>

    {editing && <QAModal open={editing} title="Editar TF" eyebrow="DADOS DO REGISTRO"
      description="Atualize os dados do chamado sem sair da execução." size="lg"
      busy={saveTask.isPending||taskAiBusy} initialFocus={'input[name="titulo"]'} onClose={closeTaskEditor}>
      <form onSubmit={taskForm.handleSubmit((values) => {
        if(saveTask.isPending||taskAiBusy)return;
        void saveTask.mutateAsync({draft:values,suggested:taskAiScenarios.filter(item=>item.selected)});
      })} className="stack mt-4">
        <div className="form-grid">
          <label className="field grow-2">Título<input {...taskForm.register("titulo")} />
            {taskForm.formState.errors.titulo && <small className="text-error">{taskForm.formState.errors.titulo.message}</small>}</label>
          <label className="field">Tipo<select {...taskForm.register("tipo_teste")}><option>BUILD</option><option>RELEASE</option></select></label>
          <label className="field">Código<input {...taskForm.register("codigo")} /></label>
          <label className="field">Módulo<input {...taskForm.register("sistema")} /></label>
          <label className="field">Versão<input {...taskForm.register("versao")} /></label>
        </div>
        <label className="field">Descrição<textarea rows={5} {...taskForm.register("descricao")} /></label>
        <details className="qa-task-ai-regenerate">
          <summary><Sparkles size={17} aria-hidden="true"/> Regerar dados da TF com IA</summary>
          <div className="qa-task-ai-regenerate-body">
            <p>Use a descrição atual para preencher novamente título, código, módulo,
              análise, causa e correção. Os campos retornados pela IA serão mostrados
              neste formulário para revisão, mas só serão gravados ao salvar.</p>
            <p className="text-muted text-sm">A descrição original será preservada.
              Cenários já existentes não serão alterados e os novos poderão ser selecionados.</p>
            <label className="qa-tf-consent">
              <input type="checkbox"
                checked={taskAiConsent!==null&&taskAiConsent===taskForm.watch("descricao")}
                disabled={taskAiBusy||saveTask.isPending||
                  !taskForm.watch("descricao")?.trim()||
                  taskForm.watch("descricao").length>20000}
                onChange={event=>setTaskAiConsent(event.target.checked
                  ?taskForm.getValues("descricao"):null)}/>
              <span>Autorizo enviar a descrição atual à NVIDIA para regerar os dados.</span>
            </label>
            <Button type="button" variant="secondary"
              isDisabled={taskAiBusy||saveTask.isPending||
                taskAiConsent!==taskForm.watch("descricao")||
                !taskForm.watch("descricao")?.trim()||
                taskForm.watch("descricao").length>20000}
              onPress={()=>void regenerateTaskWithAi()}>
              <Sparkles size={16} aria-hidden="true"/>
              {taskAiBusy?"Gerando dados…":"Regerar TF com IA NVIDIA"}
            </Button>
            {taskForm.watch("descricao").length>20000&&
              <small className="text-error">Para usar a NVIDIA, reduza a descrição para 20.000 caracteres.</small>}
            {taskAiPreviewSource!==null&&<div className="qa-task-ai-result" role="region"
              aria-label="Revisão da regeração por IA">
              <strong>Dados preenchidos no formulário</strong>
              <p>Confira os campos acima e em “Análise técnica e informações adicionais”.
                Ao salvar, os campos editados e os cenários selecionados serão registrados.</p>
              {taskAiScenarios.length>0?
                <fieldset className="qa-task-ai-scenarios">
                  <legend>Novos cenários sugeridos — {taskAiScenarios.filter(item=>item.selected).length} selecionado(s)</legend>
                  <div className="qa-task-ai-select-actions" role="group" aria-label="Selecionar cenários sugeridos">
                    <button type="button" onClick={()=>setTaskAiScenarios(items=>items.map(item=>({...item,selected:true})))}>
                      Selecionar todos
                    </button>
                    <button type="button" onClick={()=>setTaskAiScenarios(items=>items.map(item=>({...item,selected:false})))}>
                      Limpar seleção
                    </button>
                  </div>
                  {taskAiScenarios.map((item,index)=><label className="qa-task-ai-scenario" key={index}>
                    <input type="checkbox" checked={item.selected}
                      onChange={event=>setTaskAiScenarios(items=>items.map((entry,i)=>
                        i===index?{...entry,selected:event.target.checked}:entry))}/>
                    <span><strong>{item.titulo}</strong>
                      <small>{item.passos.slice(0,150)}</small></span>
                  </label>)}
                </fieldset>
                :<p>Não foram identificados cenários novos. Os existentes permanecerão intactos.</p>}
            </div>}
          </div>
        </details>
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
          <Button type="submit" isDisabled={saveTask.isPending||taskAiBusy||task.user_id!==userId}>Salvar alterações</Button>
        </div>
        <ToastNotice message={saveTask.isError?saveTask.error.message:null} tone="error"/>
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
          scenarios={scenarios.data || []}
          prefillScenarioId={evidenceTarget} prefillRequest={evidenceRequest}/>
      </Suspense>
    </QAModal>
    <QAModal open={showCollaboration} keepMounted title="Equipe e integrações"
      eyebrow="COLABORAÇÃO" size="md" onClose={()=>setShowCollaboration(false)}>
      <Suspense fallback={<p role="status" className="notice">Carregando colaboração…</p>}>
        <TaskCollaborationPanel key={task.id} task={task}
          scenarios={scenarios.data||[]} userId={userId} rights={rights}
          onExecuted={invalidate}/>
      </Suspense>
    </QAModal>
    <QAModal open={showLibrary} title="Biblioteca de cenários" eyebrow="REUTILIZAÇÃO"
      size="lg" onClose={()=>setShowLibrary(false)}>
      <Suspense fallback={<p role="status" className="notice">Carregando biblioteca…</p>}>
        <ScenarioLibraryPanel key={task.id} task={task} userId={userId}
          scenarios={scenarios.data||[]} onImported={invalidate}/>
      </Suspense>
    </QAModal>
    <QAModal open={showHistory} keepMounted title="Histórico e comparações"
      eyebrow="RASTREABILIDADE" size="full" onClose={()=>setShowHistory(false)}>
      <Suspense fallback={<p role="status" className="notice">Carregando histórico…</p>}>
        <ExecutionHistoryPanel key={task.id} task={task}
          scenarios={scenarios.data||[]} userId={userId}/>
      </Suspense>
    </QAModal>
    <QAModal open={showLinks} keepMounted title="Releases e referências"
      eyebrow="VÍNCULOS" size="full" onClose={()=>setShowLinks(false)}>
      <Suspense fallback={<p role="status" className="notice">Carregando releases…</p>}>
        <LinksPanel key={task.id} task={task} userId={userId} onClose={() => setShowLinks(false)}/>
      </Suspense>
    </QAModal>
    <QAModal key={task.id+"-ai-studio"} open={aiMode!==null} keepMounted
      title={aiMode==="post"?"Gerar post com IA":
        aiMode==="diagrams"?(editingDiagramId?"Editar diagrama":"Criar diagrama"):"Gerar casos com IA"}
      eyebrow="CENTRAL DE IA" size={aiMode==="diagrams"?"lg":"full"}
      initialFocus={aiMode==="diagrams"?(editingDiagramId?"#diagram-code-editor":"#diagram-ai-heading"):undefined}
      onClose={()=>setAiMode(null)}>
      <AiStudioTabs active={aiMode??"teste"} onChange={mode=>{
        setAiMode(mode);
        setVisitedAi(previous=>previous.includes(mode)?previous:[...previous,mode]);
        setFocusDiagramAi(mode==="diagrams");
      }}/>
      {visitedAi.includes("teste")&&<div hidden={aiMode!=="teste"}
        className="qa-ai-studio-panel">
        <Suspense fallback={<p role="status" className="notice">Carregando casos…</p>}>
          <GeneratorPanel key={task.id+"-teste"} task={task} userId={userId}
            scenarios={scenarios.data||[]} mode="teste"
            />
        </Suspense>
      </div>}
      {visitedAi.includes("post")&&<div hidden={aiMode!=="post"}
        className="qa-ai-studio-panel">
        <Suspense fallback={<p role="status" className="notice">Carregando post…</p>}>
          <GeneratorPanel key={task.id+"-post"} task={task} userId={userId}
            scenarios={scenarios.data||[]} mode="post"
            />
        </Suspense>
      </div>}
      {visitedAi.includes("diagrams")&&<div hidden={aiMode!=="diagrams"}
        className="qa-ai-studio-panel">
        <Suspense fallback={<p role="status" className="notice">Carregando diagramas…</p>}>
          <DiagramPanel key={task.id+"-"+diagramEditorRevision}
            task={task} scenarios={scenarios.data||[]}
            userId={userId} editDiagramId={editingDiagramId}
            focusAi={aiMode==="diagrams"&&focusDiagramAi}/>
        </Suspense>
      </div>}
    </QAModal>
    <QAModal key={task.id+"-documents"} open={showDocuments} keepMounted title="Documentos e relatório"
      eyebrow="ENTREGÁVEIS" size="full" initialFocus="#documents-heading" onClose={()=>setShowDocuments(false)}>
      <Suspense fallback={<p role="status" className="notice">Carregando documentos…</p>}>
        <DocumentsPanel key={task.id} task={task} scenarios={scenarios.data || []} userId={userId}
          focusOnOpen={focusReport}/>
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
        <ToastNotice message={createScenario.isError?createScenario.error.message:null} tone="error"/>
      </form>
      </section>
    </QAModal>}

    <section id="qa-task-panel-tests" role="tabpanel" aria-labelledby="qa-task-tab-tests"
      className="qa-task-panel" hidden={activeTab !== "tests"}>
      <div className="qa-task-section-heading qa-tests-heading">
        <div><h2>Testes da TF</h2><p>Registre cada resultado no modo guiado ou consulte a lista.</p></div>
        <div className="qa-tests-tools">
          <Button onPress={startScenario} isDisabled={task.user_id!==userId}>
            <Plus size={16} aria-hidden="true"/> Cenário
          </Button>
          <Button variant="secondary" onPress={()=>openTool("teste")}>
            <ListChecks size={16} aria-hidden="true"/> Gerar casos
          </Button>
          {own&&<Button variant="secondary" onPress={()=>{
            closeToolPanels();setShowLibrary(true);
          }}><BookCopy size={16} aria-hidden="true"/> Biblioteca</Button>}
        </div>
      </div>
      <div className="qa-execution-switch" role="group" aria-label="Modo de execução">
        <button type="button" aria-pressed={executionMode==="guided"}
          className={executionMode==="guided"?"selected":""}
          onClick={()=>setExecutionMode("guided")}><ScanEye size={16} aria-hidden="true"/> Guiado</button>
        <button type="button" aria-pressed={executionMode==="list"}
          className={executionMode==="list"?"selected":""}
          onClick={()=>setExecutionMode("list")}><Rows3 size={16} aria-hidden="true"/> Lista</button>
      </div>
      <div hidden={executionMode!=="guided"} className="qa-guided-container">
        <GuidedExecution key={task.id} scenarios={scenarios.data ?? []} owner={canExecute}
          canCreateScenario={own} busy={saveResult.isPending} onSave={saveGuidedResult}
          onEvidence={openGuidedEvidence} onNewScenario={startScenario}/>
      </div>
    <section ref={executionRef} hidden={executionMode!=="list"}
      className="panel mt-5 qa-workflow-anchor" aria-label="Execução dos cenários">
      <div className="section-heading"><div><p className="eyebrow">EXECUÇÃO</p><h2>Cenários</h2></div>
        <span className="count-pill">{scenarios.data?.length ?? 0} casos</span></div>
      <div className="filter-line mt-4" role="group" aria-label="Filtrar cenários">
        {([["all", "Todos"], ["pending", "Pendentes"], ["failed", "Falha / bloqueio"]] as const).map(([value, label]) =>
          <button key={value} data-qa-filter={value}
            className={"filter-chip " + (filter === value ? "selected" : "")}
            onClick={() => {
              setFilter(value);
              if(value === "pending") requestAnimationFrame(() => {
                const next = executionRef.current?.querySelector<HTMLButtonElement>(
                  '[data-qa-next-pending="true"]');
                next?.focus({preventScroll:true});
              });
            }} aria-pressed={filter === value}>{label}</button>)}
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
          {task.user_id===userId && <details className="qa-scenario-more">
            <summary>Opções do cenário</summary>
            <div className="qa-scenario-menu">
              <button type="button" onClick={() => {
                setEditingScenario(scenario);
                scenarioForm.reset({
                  titulo: scenario.titulo, passos: scenario.passos,
                  esperado: scenario.esperado, observacoes: scenario.observacoes
                });
                closeToolPanels();setEditing(false);setShowSettings(false);
                setShowScenarioForm(true);
              }}>Editar cenário</button>
              <button type="button" disabled={deleteScenarioMutation.isPending} onClick={() => {
                if (window.confirm("Excluir permanentemente este cenário?"))
                  void deleteScenarioMutation.mutateAsync(scenario.id);
              }}>Excluir cenário</button>
            </div>
          </details>}
          <div className="scenario-result-actions" role="group" aria-label={"Resultado de " + scenario.titulo}>
            <button data-qa-next-pending={filter === "pending" && index === 0 ? "true" : undefined}
              disabled={saveResult.isPending || !canExecute} onClick={() => choose(scenario, "aprovado")}><Check size={16} /> Funcionou</button>
            <button disabled={saveResult.isPending || !canExecute} onClick={() => choose(scenario, "reprovado")}>Não funcionou</button>
            <button disabled={saveResult.isPending || !canExecute} onClick={() => choose(scenario, "bloqueado")}>Bloqueado</button>
            {scenario.status !== "nao_executado" && <button
              disabled={saveResult.isPending || !canExecute}
              onClick={() => choose(scenario, "nao_executado")}>Desfazer execução</button>}
          </div>
          {scenario.obtido && <p className="result-note"><strong>Observado:</strong> {scenario.obtido}</p>}
          <details className="scenario-details"><summary><CircleHelp size={16} /> Passos e resultado esperado</summary>
            <div><strong>Passos</strong><p>{scenario.passos || "Não informado"}</p></div>
            <div><strong>Esperado</strong><p>{scenario.esperado || "Não informado"}</p></div>
            {scenario.observacoes && <div><strong>Observações</strong><p>{scenario.observacoes}</p></div>}
          </details>
        </article>)}
      </div>
      <ToastNotice tone="error"
        message={saveResult.error?.message || deleteScenarioMutation.error?.message}/>
    </section>

    </section>
    <section id="qa-task-panel-deliverables" role="tabpanel"
      aria-labelledby="qa-task-tab-deliverables"
      className="qa-task-panel" hidden={activeTab !== "deliverables"}>
      {activeTab==="deliverables"&&<TaskDeliverables
        diagrams={<Suspense fallback={<p role="status">Carregando diagramas…</p>}>
          <DiagramLibrary taskId={task.id} userId={userId} owner={!!own}
            onCreate={()=>openDiagramEditor()}
            onEdit={id=>openDiagramEditor(id)}/>
        </Suspense>}
        documents={<Suspense fallback={<p role="status">Carregando documentos…</p>}>
          <DocumentLibrary taskId={task.id} userId={userId} owner={!!own}
            onCreate={openReportEditor}/>
        </Suspense>}/>}
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
      <ToastNotice tone="error"
        message={updateStatus.error?.message || deleteTaskMutation.error?.message}/>
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
      <ToastNotice message={publication.isError?publication.error.message:null} tone="error"/>
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
        <ToastNotice message={saveResult.isError?saveResult.error.message:null} tone="error"/>
      </form>
    </QAModal>}
  </div>;
}
