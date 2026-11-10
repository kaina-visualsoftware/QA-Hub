import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {ToastNotice,notify} from "../components/ui/Toasts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { ArrowLeft, Check, CircleHelp, ExternalLink, FilePenLine, ListChecks, Plus, Settings2, Share2, Rows3, ScanEye, BookCopy, Sparkles, Trash2, FileText, FileChartColumnIncreasing, GitBranchPlus, History } from "lucide-react";
import GuidedExecution from "../features/executions/GuidedExecution";
import {ScenarioEvidenceToggle} from "../features/evidence/ScenarioEvidencePanel";
import {
  TaskViewTabs, TaskOverview, TaskDeliverables, TaskResultsDashboard, TaskResourceTabs
} from "../features/tasks/TaskWorkspaceSections";
import type { TaskTab,TaskResourceView } from "../features/tasks/TaskWorkspaceSections";
import {
  archiveTaskAiSource,loadTaskAiSource,freshTaskAiScenarios,generateTaskAiDraft,onlyNewTaskAiSelections,taskAiFieldValues
} from "../features/tasks/task-ai";
import type {SuggestedScenario} from "../features/tasks/task-ai";
import type {LocalDraft} from "../lib/legacy/qa-assistant.mjs";
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
import { formatTaskVersionInput, normalizeTaskVersion } from "../lib/task-version";
import { useFocus } from "../stores/focus";
import {supabase} from "../lib/supabase";
import { publicSharingEnabled, updatePublication } from "../features/public/public-data";
import {
  needsObservationResetConfirmation, quickExecutionResult
} from "../features/executions/quick-result";
import { QAModal } from "../components/ui/QAModal";
import { AiStepFlow } from "../components/ui/AiStepFlow";
import { AiBusyStatus } from "../components/ui/AiBusyStatus";
import "../features/tasks/ai-proposal.css";
import {splitScenarioNotes} from "../lib/legacy/qa-assistant.mjs";
import {DeleteTaskDialog} from "../features/tasks/DeleteTaskDialog";
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
const TaskFilesWorkspace = lazy(() => import("../features/tasks/TaskFilesWorkspace"));
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
  const [resourceView,setResourceView]=useState<TaskResourceView>("requirements");
  const [showResourceImport,setShowResourceImport]=useState(false);
  const [resourceFileType,setResourceFileType]=useState<"sources"|"evidence">("sources");
  const [executionMode, setExecutionMode] = useState<"list"|"guided">("list");
  const [evidenceTarget, setEvidenceTarget] = useState<string|null>(null);
  const [evidenceRequest, setEvidenceRequest] = useState(0);
  const [editing, setEditing] = useState(false);
  const [taskAiConsent,setTaskAiConsent]=useState<string|null>(null);
  const [taskAiBusy,setTaskAiBusy]=useState(false);
  const [taskAiAppliedCount,setTaskAiAppliedCount]=useState(0);
  const [taskAiProposal,setTaskAiProposal]=useState<LocalDraft|null>(null);
  const [taskAiSelectedFields,setTaskAiSelectedFields]=useState<string[]>([]);
  const [taskAiStage,setTaskAiStage]=useState<"prepare"|"review"|"applied">("prepare");
  const [taskAiInitialDescription,setTaskAiInitialDescription]=useState("");
  const [taskAiScenarios,setTaskAiScenarios]=useState<SuggestedScenario[]>([]);
  const [taskAiPreviewSource,setTaskAiPreviewSource]=useState<string|null>(null);
  const [showSettings,setShowSettings]=useState(false);
  const [showDeleteTask,setShowDeleteTask]=useState(false);
  const [showScenarioForm, setShowScenarioForm] = useState(false);
  const [aiMode, setAiMode] = useState<AiStudioMode|null>(null);
  const [aiGeneratorBusy, setAiGeneratorBusy] = useState(false);
  const [focusDiagramAi, setFocusDiagramAi] = useState(false);
  const [editingDiagramId,setEditingDiagramId]=useState<string|null>(null);
  const [diagramEditorRevision,setDiagramEditorRevision]=useState(0);
  const [showDocuments, setShowDocuments] = useState(false);
  const [focusReport, setFocusReport] = useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [showLibrary,setShowLibrary]=useState(false);

  // TanStack Router reuses this page instance when navigating from one TF to
  // another. Never carry an open tool (or another TF's draft) to the new task.
  useEffect(()=>{
    setActiveTab("summary");setResourceView("requirements");setShowResourceImport(false);
    setResourceFileType("sources");setExecutionMode("list");
    setEvidenceTarget(null);setEvidenceRequest(0);
    setEditing(false);setShowScenarioForm(false);setShowSettings(false);setShowDeleteTask(false);
    setTaskAiConsent(null);setTaskAiScenarios([]);setTaskAiPreviewSource(null);
    setTaskAiAppliedCount(0);
    setAiMode(null);setAiGeneratorBusy(false);setFocusDiagramAi(false);
    setEditingDiagramId(null);setDiagramEditorRevision(0);
    setShowDocuments(false);
    setFocusReport(false);setShowHistory(false);
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
  const technicalDetailsRef=useRef<HTMLDetailsElement|null>(null);
  const executionRef = useRef<HTMLElement | null>(null);
  const pendingCount = (scenarios.data ?? []).filter((item) =>
    item.status === "nao_executado").length;

  // Create/edit operations use modals. Existing information is viewed
  // directly in its dedicated workspace tab, not in a second modal.
  function closeToolPanels() {
    setAiMode(null);setShowDocuments(false);setShowHistory(false);setShowLibrary(false);
  }
  function openTool(kind:"diagrams"|"documents"|"post"|"teste"|"history") {
    closeToolPanels();
    setEditing(false);setShowScenarioForm(false);setShowSettings(false);
    if(kind==="diagrams"||kind==="post"||kind==="teste")setAiMode(kind);
    else if(kind==="documents")setShowDocuments(true);
    else if(kind==="history")setShowHistory(true);
  }
  function closeTaskEditor(){
    if(saveTask.isPending)return;
    if(taskAiStage==="review"&&!window.confirm(
      "Descartar as sugestões da IA que ainda não foram aplicadas?"))return;
    if(taskForm.formState.isDirty){
      if(!window.confirm("Descartar as alterações não salvas da TF?"))return;
      taskForm.reset();
    }
    setEditing(false);setTaskAiScenarios([]);setTaskAiConsent(null);
    setTaskAiPreviewSource(null);setTaskAiAppliedCount(0);
    setTaskAiProposal(null);setTaskAiSelectedFields([]);setTaskAiStage("prepare");
  }
  function closeScenarioEditor(){
    if(createScenario.isPending)return;
    if(scenarioForm.formState.isDirty&&!window.confirm("Descartar o cenário ainda não salvo?"))return;
    setShowScenarioForm(false);setEditingScenario(null);
    scenarioForm.reset();
  }

  function openScenarioEditor(scenario:Scenario) {
    if(task?.user_id!==userId)return;
    setEditingScenario(scenario);
    scenarioForm.reset({
      titulo:scenario.titulo,passos:scenario.passos,
      esperado:scenario.esperado,observacoes:scenario.observacoes
    });
    closeToolPanels();setEditing(false);setShowSettings(false);
    setShowScenarioForm(true);
  }

  async function requestScenarioDeletion(scenario:Scenario) {
    if(task?.user_id!==userId||deleteScenarioMutation.isPending)return;
    const {data:files,error:fileError}=await supabase.from("qa_evidencia_arquivos")
      .select("id").eq("tarefa_id",taskId).eq("cenario_id",scenario.id).limit(101);
    if(fileError){notify.error("Não foi possível conferir as evidências. Tente novamente.");return;}
    const evidenceCount=files?.length??0;
    const explanation=evidenceCount
      ? "\n\n"+evidenceCount+" anexo(s) serão preservados na TF, mas desvinculados deste cenário"+
        ". A visibilidade continua acompanhando a TF"+"."
      : "";
    if(!window.confirm("Excluir definitivamente o cenário '"+scenario.titulo+"'?"+
      "\n\nO resultado, o histórico de execução e os vínculos de requisitos deste cenário serão excluídos."+
      explanation+"\n\nEsta ação não pode ser desfeita."))return;
    try{await deleteScenarioMutation.mutateAsync(scenario.id);}
    catch(reason){notify.error(reason instanceof Error?reason.message:"Falha ao excluir cenário.");}
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
    setResourceView("files");
    setResourceFileType("evidence");
    setActiveTab("resources");
    setShowResourceImport(true);
  }


  const taskForm = useForm<TaskDraft>({
    resolver: zodResolver(taskDraftSchema),
    defaultValues: { titulo: "", descricao: "", tipo_teste: "BUILD", codigo: "", sistema: "", versao: "" }
  });
  const savedAiSource=useQuery({
    queryKey:["task-ai-source",userId,taskId],
    queryFn:()=>loadTaskAiSource(taskId),
    enabled:!!own&&editing
  });
  const currentDescription=taskForm.watch("descricao");
  const sourceForAi=taskForm.formState.dirtyFields.descricao
    ?currentDescription:(savedAiSource.data||currentDescription);
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
      // Archive the original before replacing the report with a short summary.
      if(taskAiPreviewSource&&taskAiPreviewSource.trim()!==draft.descricao.trim()){
        await archiveTaskAiSource(taskId,userId,taskAiPreviewSource);
      }
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
      await queryClient.invalidateQueries({queryKey:["task-ai-source",userId,taskId]});
      if(warning){
        notify.warning("Dados da TF salvos, mas os cenários sugeridos não foram adicionados: "+
          warning+". Revise e tente salvar novamente.");
        // Keep the editor and selected candidates so they can be retried.
        return;
      }
      setEditing(false);setTaskAiScenarios([]);setTaskAiConsent(null);
      setTaskAiPreviewSource(null);setTaskAiAppliedCount(0);
      setTaskAiProposal(null);setTaskAiSelectedFields([]);setTaskAiStage("prepare");
      setSaved("Alterações da TF salvas."+(appended?
        " "+appended+" cenário(s) novo(s) adicionado(s).":""));
    }
  });

  async function regenerateTaskWithAi(){
    if(!own||taskAiBusy||saveTask.isPending)return;
    const source=sourceForAi;
    const descriptionAtStart=taskForm.getValues("descricao");
    if(!source.trim()){
      notify.error("Informe a descrição da tarefa para usar a IA.");
      return;
    }
    if(taskAiConsent!==source){
      notify.warning("Autorize o envio da descrição atual à NVIDIA.");
      return;
    }
    // This call only prepares a proposal: never mutate the form before review.
    setTaskAiBusy(true);
    try{
      const result=await generateTaskAiDraft(source);
      if(taskForm.getValues("descricao")!==descriptionAtStart){
        notify.warning("A descrição mudou durante a análise. Gere novamente antes de aplicar.");
        return;
      }
      const values=taskAiFieldValues(result);
      const suggestions=freshTaskAiScenarios(result,scenarios.data??[]);
      setTaskAiProposal(result);
      setTaskAiSelectedFields(Object.entries(values).filter(([name,value])=>
        !String(taskForm.getValues(name as keyof TaskDraft)||"").trim()&&Boolean(value)
      ).map(([name])=>name));
      setTaskAiScenarios(suggestions);
      setTaskAiInitialDescription(descriptionAtStart);
      setTaskAiPreviewSource(source);
      setTaskAiAppliedCount(0);
      setTaskAiStage("review");
      // The review screen itself communicates the result; avoid a toast covering it.
    }catch(reason){
      notify.error(reason instanceof Error?reason.message:"Falha ao regerar a TF com IA.");
    }finally{
      setTaskAiBusy(false);setTaskAiConsent(null);
    }
  }
  function applyReviewedTaskAi(){
    if(!taskAiProposal||taskAiStage!=="review")return;
    if(taskForm.getValues("descricao")!==taskAiInitialDescription){
      notify.warning("A descrição foi alterada após a geração. Gere novamente para evitar aplicar sugestões desatualizadas.");
      return;
    }
    const values=taskAiFieldValues(taskAiProposal);
    for(const name of taskAiSelectedFields){
      const value=values[name as keyof TaskDraft];
      if(value===undefined)continue;
      taskForm.setValue(name as keyof TaskDraft,value as never,{
        shouldValidate:true,shouldDirty:true,shouldTouch:true
      });
    }
    setTaskAiAppliedCount(taskAiSelectedFields.length);
    setTaskAiStage("applied");
    // The final stage and inline confirmation remain visible until saving.
  }

  useEffect(()=>{
    if(!editing||taskAiStage!=="review")return;
    const frame=requestAnimationFrame(()=>{
      const target=document.getElementById("qa-task-ai-review-heading");
      document.querySelector(".qa-task-ai-regenerate")
        ?.scrollIntoView({behavior:"auto",block:"start"});
      target?.focus({preventScroll:true});
    });
    return ()=>cancelAnimationFrame(frame);
  },[editing,taskAiStage]);

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
      setShowDeleteTask(false);
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
    onSuccess: async () => {
      setSaved("Cenário excluído. Os anexos preservados estão privados na TF.");
      await Promise.all([invalidate(),
        queryClient.invalidateQueries({queryKey:["evidence-files",userId,taskId]})]);
    }
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
            setTaskAiAppliedCount(0);
            setEditing(true);
          }}>
            <FilePenLine size={16} /> Editar TF
          </Button>
          {own && <button type="button" className="qa-task-header-delete"
            aria-label="Excluir TF" title="Excluir esta TF"
            disabled={deleteTaskMutation.isPending}
            onClick={() => {
              deleteTaskMutation.reset();
              setShowDeleteTask(true);
            }}>
            <Trash2 size={16} aria-hidden="true"/> Excluir TF
          </button>}
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
    <section id="qa-task-panel-summary" role="tabpanel" aria-labelledby="qa-task-tab-summary"
      className="qa-task-panel" hidden={activeTab !== "summary"}>
      {activeTab==="summary"&&<TaskOverview task={task}/>}
    </section>

    <ToastNotice message={importWarning} tone="error"/>

    {editing && <QAModal open={editing} title="Editar TF" eyebrow="DADOS DO REGISTRO"
      description="Atualize os dados do chamado sem sair da execução." size="lg"
      busy={saveTask.isPending||taskAiBusy} initialFocus={'input[name="titulo"]'} onClose={closeTaskEditor}>
      <form onSubmit={taskForm.handleSubmit((values) => {
        if(saveTask.isPending||taskAiBusy)return;
        if(taskAiStage==="review"){
          notify.warning("Revise e aplique ou descarte as sugestões da IA antes de salvar.");
          return;
        }
        void saveTask.mutateAsync({draft:values,suggested:taskAiStage==="applied"
          ?taskAiScenarios.filter(item=>item.selected):[]});
      })} className={"stack mt-4"+(taskAiStage==="review"?" qa-task-ai-review-form":"")}>
        {taskAiStage!=="review"&&<>
        <div className="form-grid">
          <label className="field grow-2">Título<input {...taskForm.register("titulo")} />
            {taskForm.formState.errors.titulo && <small className="text-error">{taskForm.formState.errors.titulo.message}</small>}</label>
          <label className="field">Tipo<select {...taskForm.register("tipo_teste")}><option>BUILD</option><option>RELEASE</option></select></label>
          <label className="field">Código<input {...taskForm.register("codigo")} /></label>
          <label className="field">Módulo<input {...taskForm.register("sistema")} /></label>
          <label className="field">Versão
            <Controller control={taskForm.control} name="versao" render={({field})=>
              <input {...field} value={field.value||""} inputMode="numeric"
                maxLength={13} placeholder="00.00.00.0000"
                onChange={event=>field.onChange(formatTaskVersionInput(event.target.value))}
                onBlur={event=>{
                  field.onChange(normalizeTaskVersion(event.target.value));
                  field.onBlur();
                }}/>
            }/>
            {taskForm.formState.errors.versao&&
              <small className="text-error">{taskForm.formState.errors.versao.message}</small>}
          </label>
        </div>
        <label className="field">Descrição<textarea rows={5} {...taskForm.register("descricao")} /></label>
        </>}
        <details className="qa-task-ai-regenerate"
          open={taskAiBusy||taskAiProposal!==null||taskAiStage!=="prepare"||undefined}>
          <summary onClick={event=>{
            if(taskAiStage==="review"||taskAiStage==="applied")event.preventDefault();
          }}>
            <Sparkles size={18} aria-hidden="true"/>
            <span>Regerar dados da TF com IA</span>
          </summary>
          <div className="qa-task-ai-regenerate-body">
            <AiStepFlow
              step={taskAiBusy?"processing":taskAiStage==="review"?"review":
                taskAiStage==="applied"?"finalize":"prepare"}
              label="Etapas da revisão da TF com IA"
              labels={["Solicitar à NVIDIA","Revisar sugestões","Aplicar e salvar"]}/>
            {taskAiStage==="prepare"&&<>
              <p className="qa-ai-helper-copy">A NVIDIA propõe um resumo, causa,
                correção e conclusão com base no texto original. Nada será
                aplicado aos campos nem salvo sem sua aprovação.</p>
              {taskAiProposal&&<button type="button" className="qa-ai-review-fields"
                onClick={()=>setTaskAiStage("review")}>
                Voltar às sugestões anteriores
              </button>}
              <div className="qa-task-ai-control-row">
                <label className="qa-ai-consent-compact">
                  <input type="checkbox"
                    checked={taskAiConsent!==null&&taskAiConsent===sourceForAi}
                    disabled={taskAiBusy||saveTask.isPending||
                      !sourceForAi?.trim()}
                    onChange={event=>setTaskAiConsent(event.target.checked
                      ?sourceForAi:null)}/>
                  <span>Autorizo enviar o texto-base da TF à NVIDIA.</span>
                </label>
                <Button type="button" className="qa-task-ai-generate"
                  isDisabled={taskAiBusy||saveTask.isPending||
                    taskAiConsent!==sourceForAi||
                    !sourceForAi?.trim()}
                  onPress={()=>void regenerateTaskWithAi()}>
                  <Sparkles size={16} aria-hidden="true"/>
                  {taskAiBusy?"Gerando sugestões…":"Gerar sugestões com IA"}
                </Button>
              </div>
              {taskAiBusy&&<AiBusyStatus title="Preparando sugestões para a TF"
                detail="Aguardando a NVIDIA identificar campos e cenários. Nenhuma alteração foi aplicada."/>}

            </>}
            {taskAiStage==="review"&&taskAiProposal&&
              <section className="qa-task-ai-result" role="region" aria-label="Revisão da regeração por IA">
                <div className="qa-task-ai-result-top">
                  <div>
                    <h3 id="qa-task-ai-review-heading" tabIndex={-1}>Revise antes de aplicar</h3>
                    <p>{Object.keys(taskAiFieldValues(taskAiProposal)).length} campo(s)
                      sugerido(s) e {taskAiScenarios.length} caso(s) novo(s).
                      Os valores atuais ainda não foram alterados.</p>
                  </div>
                </div>
                <fieldset className="qa-ai-proposal-fields">
                  <legend>Campos propostos pela IA</legend>
                  {Object.entries(taskAiFieldValues(taskAiProposal)).map(([name,value])=>
                    <label key={name} className="qa-ai-proposal-field">
                      <input type="checkbox" checked={taskAiSelectedFields.includes(name)}
                        onChange={event=>setTaskAiSelectedFields(items=>event.target.checked
                          ? [...items,name] : items.filter(item=>item!==name))}/>
                      <span>
                        <strong>{({titulo:"Título",descricao:"Descrição",tipo_teste:"Tipo de teste",
                          codigo:"Código",sistema:"Módulo",versao:"Versão",causa:"Causa",
                          correcao:"Correção",conclusao:"Conclusão",explicacao:"Análise",
                          observacoes:"Observações",ambiente:"Ambiente",base_teste:"Base de teste",
                          empresa:"Empresa",testador:"Testador"} as Record<string,string>)[name]||name}</strong>
                        <small>Atual: {String(taskForm.getValues(name as keyof TaskDraft)||"")||"Não informado"}</small>
                        <span className="qa-ai-proposal-new">Sugerido: {String(value)}</span>
                      </span>
                    </label>
                  )}
                </fieldset>
                {taskAiScenarios.length>0&&<fieldset className="qa-task-ai-scenarios">
                  <legend>Cenários sugeridos ({taskAiScenarios.filter(item=>item.selected).length} selecionado(s))</legend>
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
                </fieldset>}
                <div className="qa-ai-proposal-actions">
                  <Button variant="secondary" type="button" onPress={()=>{
                    setTaskAiStage("prepare");setTaskAiConsent(null);
                    // Keep the previous AI draft available without another API request.
                  }}>Voltar à configuração</Button>
                </div>
              </section>}
            {taskAiStage==="applied"&&<div className="qa-ai-proposal-finished" role="status">
              <Check size={18} aria-hidden="true"/>
              <div><strong>Revisão aprovada</strong>
                <p>{taskAiAppliedCount} campo(s) aplicados no formulário.
                  Os cenários selecionados serão anexados apenas ao clicar em
                  <b> Salvar alterações</b> no final desta janela.</p>
                <button type="button" className="qa-ai-review-fields"
                  onClick={()=>{const details=technicalDetailsRef.current;
                    if(details){details.open=true;details.scrollIntoView({block:"nearest"});}}}>
                  Conferir campos editáveis
                </button>
              </div>
            </div>}
          </div>
        </details>
        {taskAiStage!=="review"&&<details ref={technicalDetailsRef} className="generator-context">
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
        </details>}
        <div className="qa-modal-actions">
          <Button type="button" variant="secondary" onPress={closeTaskEditor}>Cancelar</Button>
          {taskAiStage==="review"&&<Button type="button"
            isDisabled={!taskAiSelectedFields.length&&!taskAiScenarios.some(item=>item.selected)}
            onPress={applyReviewedTaskAi}>
            <Check size={16} aria-hidden="true"/> Aplicar sugestões
          </Button>}
          {taskAiStage!=="review"&&<Button type="submit"
            isDisabled={saveTask.isPending||taskAiBusy||task.user_id!==userId}>
            Salvar alterações
          </Button>}
        </div>
        <ToastNotice message={saveTask.isError?saveTask.error.message:null} tone="error"/>
      </form>
    </QAModal>}



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
    <QAModal key={task.id+"-ai-studio"} open={aiMode!==null} keepMounted
      title={aiMode==="post"?"Gerar post com IA":
        aiMode==="diagrams"?(editingDiagramId?"Editar diagrama":"Criar diagrama"):"Gerar casos com IA"}
      eyebrow="CENTRAL DE IA" size="full" busy={aiGeneratorBusy}
      surface={aiMode==="post"?"post":aiMode==="diagrams"?"diagram":
        aiMode==="teste"?"cases":undefined}
      initialFocus={aiMode==="diagrams"?(editingDiagramId?"#diagram-code-editor":"#diagram-ai-heading"):undefined}
      onClose={()=>{if(!aiGeneratorBusy)setAiMode(null);}}>
      {aiMode==="teste"&&<div
        className="qa-ai-studio-panel">
        <Suspense fallback={<p role="status" className="notice">Carregando casos…</p>}>
          <GeneratorPanel key={task.id+"-teste"} task={task} userId={userId}
            scenarios={scenarios.data||[]} mode="teste"
            onBusyChange={setAiGeneratorBusy}/>
        </Suspense>
      </div>}
      {aiMode==="post"&&<div
        className="qa-ai-studio-panel">
        <Suspense fallback={<p role="status" className="notice">Carregando post…</p>}>
          <GeneratorPanel key={task.id+"-post"} task={task} userId={userId}
            scenarios={scenarios.data||[]} mode="post"
            onBusyChange={setAiGeneratorBusy}/>
        </Suspense>
      </div>}
      {aiMode==="diagrams"&&<div
        className="qa-ai-studio-panel">
        <Suspense fallback={<p role="status" className="notice">Carregando diagramas…</p>}>
          <DiagramPanel key={task.id+"-"+diagramEditorRevision}
            task={task} scenarios={scenarios.data||[]}
            userId={userId} editDiagramId={editingDiagramId}
            focusAi={aiMode==="diagrams"&&focusDiagramAi}
            onBusyChange={setAiGeneratorBusy}/>
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
          onClick={startPendingExecution}><ScanEye size={16} aria-hidden="true"/> Guiado</button>
        <button type="button" aria-pressed={executionMode==="list"}
          className={executionMode==="list"?"selected":""}
          onClick={()=>setExecutionMode("list")}><Rows3 size={16} aria-hidden="true"/> Lista</button>
      </div>
      <div hidden={executionMode!=="guided"} className="qa-guided-container">
        <GuidedExecution key={task.id} task={task} userId={userId} scenarios={scenarios.data ?? []} owner={canExecute}
          canCreateScenario={own} busy={saveResult.isPending} onSave={saveGuidedResult}
          onEvidence={openGuidedEvidence} onNewScenario={startScenario}
          canManage={own} onEdit={openScenarioEditor}
          onDelete={scenario=>void requestScenarioDeletion(scenario)}/>
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
        {visible.map((scenario, index) => {
          const notes=splitScenarioNotes(scenario.observacoes);
          return <article className="scenario" key={scenario.id}>
          <div className="scenario-heading"><div><span className="eyebrow">CENÁRIO {String(scenario.ordem).padStart(2, "0")}</span>
              <h3>{scenario.titulo}</h3></div><span className={"status-chip " + scenario.status}>
                {scenarioStatusLabels[scenario.status]}</span></div>
          {own && <div className="qa-scenario-crud-actions"
            role="group" aria-label={"Gerenciar "+scenario.titulo}>
            <button type="button" onClick={()=>openScenarioEditor(scenario)}>
              <FilePenLine size={15} aria-hidden="true"/> Editar cenário
            </button>
            <button type="button" className="qa-scenario-crud-danger"
              disabled={deleteScenarioMutation.isPending}
              onClick={()=>void requestScenarioDeletion(scenario)}>
              <Trash2 size={15} aria-hidden="true"/> Excluir cenário
            </button>
          </div>}
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
          {own&&<ScenarioEvidenceToggle task={task} userId={userId} scenario={scenario}/>}
          <details className="scenario-details"><summary><CircleHelp size={16} /> Passos e resultado esperado</summary>
            <div><strong>Passos</strong><p style={{whiteSpace:"pre-wrap"}}>{scenario.passos || "Não informado"}</p></div>
            <div><strong>Esperado</strong><p style={{whiteSpace:"pre-wrap"}}>
              {scenario.esperado ? scenario.esperado.split("\n").map(line=>
                /^[-•*]\s/.test(line)?line:"- "+line).join("\n") : "Não informado"}
            </p></div>
            {notes.objetivo && <div><strong>Objetivo</strong>
              <p style={{whiteSpace:"pre-wrap"}}>{notes.objetivo}</p></div>}
            {notes.observacoes && <div><strong>Observações</strong>
              <p style={{whiteSpace:"pre-wrap"}}>{notes.observacoes}</p></div>}
          </details>
        </article>;})}
      </div>
      <ToastNotice tone="error"
        message={saveResult.error?.message || deleteScenarioMutation.error?.message}/>
    </section>

    </section>
    <section id="qa-task-panel-deliverables" role="tabpanel"
      aria-labelledby="qa-task-tab-deliverables"
      className="qa-task-panel" hidden={activeTab !== "deliverables"}>
      {activeTab==="deliverables"&&<>
        <div className="qa-task-area-heading">
          <div>

            <h2>Relatórios e publicações</h2>
            <p>Analise os resultados registrados e consulte os documentos produzidos nesta TF.</p>
          </div>
        </div>
        <TaskResultsDashboard scenarios={scenarios.data??[]}/>
        {own&&<div className="qa-task-area-actions" role="group"
          aria-label="Criar relatórios e publicações">
          <Button onPress={openReportEditor}>
            <FileChartColumnIncreasing size={17} aria-hidden="true"/> Criar relatório
          </Button>
          <Button variant="secondary" onPress={()=>openTool("post")}>
            <FileText size={17} aria-hidden="true"/> Gerar post
          </Button>
          <Button variant="secondary" onPress={()=>openDiagramEditor()}>
            <GitBranchPlus size={17} aria-hidden="true"/> Criar diagrama
          </Button>
          <Button variant="secondary" onPress={()=>openTool("history")}>
            <History size={17} aria-hidden="true"/> Histórico de execuções
          </Button>
        </div>}
        <TaskDeliverables
          diagrams={<Suspense fallback={<p role="status">Carregando diagramas…</p>}>
            <DiagramLibrary taskId={task.id} userId={userId} owner={!!own}
              showCreate={false} onCreate={()=>openDiagramEditor()}
              onEdit={id=>openDiagramEditor(id)}/>
          </Suspense>}
          documents={<Suspense fallback={<p role="status">Carregando documentos…</p>}>
            <DocumentLibrary taskId={task.id} userId={userId} owner={!!own}
              showCreate={false} onCreate={openReportEditor}/>
          </Suspense>}/>
        {!own&&<Button variant="secondary" onPress={()=>openTool("history")}>
          <History size={17} aria-hidden="true"/> Histórico de execuções
        </Button>}
      </>}
    </section>
    <section id="qa-task-panel-resources" role="tabpanel"
      aria-labelledby="qa-task-tab-resources"
      className="qa-task-panel" hidden={activeTab!=="resources"}>
      {activeTab==="resources"&&<>
        <div className="qa-task-area-heading qa-resource-library-heading">
          <div>

            <h2>Arquivos e requisitos</h2>
            <p>Consulte os itens registrados. Use a ação desta seção para adicionar ou gerenciar seus registros.</p>
          </div>
          {(resourceView==="team"?rights.canManage||rights.canComment:own)&&
            <Button onPress={()=>{
              setResourceFileType("sources");
              setEvidenceTarget(null);
              setShowResourceImport(true);
            }}>
              <Plus size={17} aria-hidden="true"/>
              {resourceView==="team"?"Gerenciar equipe":resourceView==="files"?"Adicionar arquivo":resourceView==="requirements"?"Gerenciar requisitos":"Adicionar vínculo"}
            </Button>}
        </div>
        <TaskResourceTabs value={resourceView} onChange={setResourceView}/>
        <section id="qa-task-resource-panel-requirements" role="tabpanel"
          aria-labelledby="qa-task-resource-tab-requirements"
          hidden={resourceView!=="requirements"} className="qa-task-resource-panel">
          {resourceView==="requirements"&&!showResourceImport&&<Suspense fallback={
            <p role="status" className="notice">Carregando requisitos…</p>}>
            <RequirementsPanel key={task.id+"-read"} task={task} userId={userId}
              scenarios={scenarios.data??[]} readOnly/>
          </Suspense>}
        </section>
        <section id="qa-task-resource-panel-files" role="tabpanel"
          aria-labelledby="qa-task-resource-tab-files"
          hidden={resourceView!=="files"} className="qa-task-resource-panel">
          {resourceView==="files"&&!showResourceImport&&<Suspense fallback={
            <p role="status" className="notice">Carregando arquivos e evidências…</p>}>
            <TaskFilesWorkspace key={task.id+"-read"} task={task} userId={userId}
              scenarios={scenarios.data??[]} readOnly/>
          </Suspense>}
        </section>
        <section id="qa-task-resource-panel-references" role="tabpanel"
          aria-labelledby="qa-task-resource-tab-references"
          hidden={resourceView!=="references"} className="qa-task-resource-panel">
          {resourceView==="references"&&!showResourceImport&&<Suspense fallback={
            <p role="status" className="notice">Carregando releases e referências…</p>}>
            <LinksPanel key={task.id+"-read"} task={task} userId={userId} readOnly/>
          </Suspense>}
        </section>
        <section id="qa-task-resource-panel-team" role="tabpanel"
          aria-labelledby="qa-task-resource-tab-team"
          hidden={resourceView!=="team"} className="qa-task-resource-panel">
          {resourceView==="team"&&!showResourceImport&&<Suspense fallback={
            <p role="status" className="notice">Carregando equipe…</p>}>
            <TaskCollaborationPanel key={task.id+"-read"} task={task}
              scenarios={scenarios.data??[]} userId={userId} rights={rights}
              onExecuted={invalidate} readOnly/>
          </Suspense>}
        </section>
      </>}
    </section>
    <QAModal key={task.id+"-resource-import"} open={showResourceImport}
      title={resourceView==="requirements"?"Importar requisitos":
        resourceView==="files"?"Importar arquivos e evidências":
        resourceView==="references"?"Adicionar release ou referência":"Gerenciar equipe"}
      eyebrow="BIBLIOTECA DA TF" size="lg"
      description="As alterações só serão registradas após sua confirmação."
      onClose={()=>setShowResourceImport(false)}>
      {showResourceImport&&<Suspense fallback={<p role="status">Carregando ferramentas de importação…</p>}>
        {resourceView==="requirements"&&<RequirementsPanel
          key={task.id+"-edit"} task={task} userId={userId}
          scenarios={scenarios.data??[]}/>}
        {resourceView==="files"&&<div className="qa-resource-import-body">
          <div className="qa-resource-import-switch" role="group" aria-label="Tipo de anexo">
            <button type="button" aria-pressed={resourceFileType==="sources"}
              className={resourceFileType==="sources"?"selected":""}
              onClick={()=>setResourceFileType("sources")}>Documento da TF</button>
            <button type="button" aria-pressed={resourceFileType==="evidence"}
              className={resourceFileType==="evidence"?"selected":""}
              onClick={()=>setResourceFileType("evidence")}>Evidência do teste</button>
          </div>
          <div hidden={resourceFileType!=="sources"}>
            <TaskFilesWorkspace key={task.id+"-edit-sources"}
              task={task} userId={userId} scenarios={scenarios.data??[]}
              section="sources"/>
          </div>
          <div hidden={resourceFileType!=="evidence"}>
            <TaskFilesWorkspace key={task.id+"-edit-evidence"}
              task={task} userId={userId} scenarios={scenarios.data??[]}
              section="evidence"
              prefillScenarioId={evidenceTarget} prefillRequest={evidenceRequest}/>
          </div>
        </div>}
        {resourceView==="references"&&<LinksPanel
          key={task.id+"-edit"} task={task} userId={userId}/>}
        {resourceView==="team"&&<TaskCollaborationPanel
          key={task.id+"-edit"} task={task} scenarios={scenarios.data??[]}
          userId={userId} rights={rights} onExecuted={invalidate}/>}
      </Suspense>}
    </QAModal>
    <DeleteTaskDialog task={showDeleteTask && own ? task : null}
      busy={deleteTaskMutation.isPending}
      error={deleteTaskMutation.error?.message}
      scenarioCount={scenarios.data?.length}
      onClose={() => { if(!deleteTaskMutation.isPending) setShowDeleteTask(false); }}
      onConfirm={() => { if(own && !deleteTaskMutation.isPending) deleteTaskMutation.mutate(); }}/>
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
      </div>
      <ToastNotice tone="error"
        message={updateStatus.error?.message}/>
    </section>
    <section className="panel mt-4" aria-label="Compartilhamento público">
      <div className="section-heading">
        <div>

          <h2>Compartilhamento da TF</h2>
          <p className="text-muted text-sm mt-2">
            {task.publica ? "Pública — todo o conteúdo desta TF, incluindo imagens, arquivos, requisitos, relatórios e diagramas, fica acessível sem login."
              : "Privada — o conteúdo e todos os anexos desta TF exigem acesso autorizado."}
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
              ? "Publicar esta TF? Todo o conteúdo da TF, incluindo imagens, arquivos, requisitos, relatórios e diagramas, ficará acessível sem login. Novos anexos também acompanharão essa configuração."
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
