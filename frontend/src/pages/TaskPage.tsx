import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowLeft, Check, CircleHelp, ExternalLink, FileText, GitBranchPlus, Plus, X } from "lucide-react";
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

const DiagramPanel = lazy(() => import("../features/diagrams/DiagramPanel"));

function legacyLink(taskId: string, tab: string) {
  return "https://kaina-visualsoftware.github.io/QA-Hub/qa.html#/tarefa/" +
    encodeURIComponent(taskId) + "?tab=" + encodeURIComponent(tab);
}

export default function TaskPage() {
  const { taskId } = useParams({ from: "/tarefa/$taskId" });
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
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [nextStatus, setNextStatus] = useState<(typeof taskStatuses)[number]>("rascunho");
  const [importWarning, setImportWarning] = useState("");
  const [pending, setPending] = useState<{ scenario: Scenario; status: ExecutionResult["status"] } | null>(null);
  const [observed, setObserved] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "failed">("all");
  const [saved, setSaved] = useState("");

  const taskForm = useForm<TaskDraft>({
    resolver: zodResolver(taskDraftSchema),
    defaultValues: { titulo: "", descricao: "", tipo_teste: "BUILD", codigo: "", sistema: "", versao: "" }
  });
  const scenarioForm = useForm<ScenarioDraft>({
    resolver: zodResolver(scenarioDraftSchema),
    defaultValues: { titulo: "", passos: "", esperado: "", observacoes: "" }
  });

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
      codigo: task.codigo || "", sistema: task.sistema || "", versao: task.versao || ""
    });
  }, [task, taskForm.reset]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks", userId] }),
      queryClient.invalidateQueries({ queryKey: ["scenarios", userId, taskId] })
    ]);
  };
  const saveTask = useMutation({
    mutationFn: (data: TaskDraft) => updateTask(taskId, data),
    onSuccess: async () => { setEditing(false); setSaved("Alterações da TF salvas."); await invalidate(); }
  });
  const createScenario = useMutation({
    mutationFn: (draft: ScenarioDraft) => editingScenario
      ? editScenario(taskId, editingScenario.id, draft)
      : addScenario(taskId, userId, draft,
          Math.max(0, ...(scenarios.data ?? []).map((item) => item.ordem)) + 1),
    onSuccess: async () => {
      scenarioForm.reset(); setShowScenarioForm(false); setEditingScenario(null); setSaved("Cenário salvo.");
      await invalidate();
    }
  });
  const saveResult = useMutation({
    mutationFn: (input: { scenario: Scenario; status: ExecutionResult["status"]; obtido: string }) =>
      saveScenarioResult(taskId, input.scenario.id, { status: input.status, obtido: input.obtido }),
    onSuccess: async () => {
      setPending(null); setObserved(""); setSaved("Execução registrada. A situação da TF não foi alterada automaticamente.");
      await invalidate();
    }
  });

  const updateStatus = useMutation({
    mutationFn: (status: (typeof taskStatuses)[number]) => setTaskStatus(taskId, status),
    onSuccess: async () => { setSaved("Situação da TF alterada manualmente."); await invalidate(); }
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

  const progress = progressOf(scenarios.data || []);
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
    void saveResult.mutateAsync({ scenario, status, obtido: status === "nao_executado" ? "" : scenario.obtido });
  }
  if (tasks.isPending || role.isPending) return <p className="screen-status" role="status">Carregando TF…</p>;
  if (tasks.isError || role.isError) return <p className="notice error" role="alert">Erro ao abrir TF: {tasks.error?.message || role.error?.message}</p>;
  if (!task) return <div className="empty-state"><h1>TF não encontrada ou sem acesso</h1><Link to="/">Voltar</Link></div>;

  return <div className="page">
    <Link to="/" className="back-link"><ArrowLeft size={16} /> Todas as TFs</Link>
    <div className="page-heading mt-4">
      <div><p className="eyebrow">{task.codigo ? "TF · " + task.codigo : "TAREFA DE TESTE"}</p>
        <h1>{task.titulo}</h1>
        <p className="text-muted">{task.tipo_teste} · {task.sistema || "Sem módulo"} · {task.versao || "Sem versão"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={"status-chip " + task.status}>{taskStatusLabels[task.status]}</span>
        <Button variant="secondary" onPress={() => setEditing((value) => !value)}>{editing ? "Fechar edição" : "Editar TF"}</Button>
      </div>
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
        <Button type="submit" isDisabled={saveTask.isPending}>Salvar alterações</Button>
        {saveTask.isError && <p className="notice error" role="alert">{saveTask.error.message}</p>}
      </form>
    </section>}

    <section className="action-rail mt-5" aria-label="Próximas ações">
      <div><p className="eyebrow">CONTINUE POR AQUI</p><h2>Execução e documentação</h2></div>
      <Button onPress={() => { setEditingScenario(null); scenarioForm.reset(); setShowScenarioForm(true); }}><Plus size={16} /> Adicionar cenário</Button>
      <button type="button" onClick={() => setShowDiagrams((value) => !value)} className="secondary-link"><GitBranchPlus size={16} /> {showDiagrams ? "Ocultar diagramas" : "Diagramas"}</button>
      <a href={legacyLink(taskId, "documentos")} className="secondary-link"><FileText size={16} /> Posts / documentos <ExternalLink size={13} /></a>
    </section>

    {showDiagrams && <Suspense fallback={<p role="status" className="notice mt-4">Carregando editor de diagramas…</p>}>
      <DiagramPanel taskId={taskId} userId={userId} />
    </Suspense>}
    {showScenarioForm && <section className="panel mt-5" aria-label="Novo cenário">
      <div className="section-heading"><div><p className="eyebrow">NOVO CASO</p><h2>{editingScenario ? "Editar cenário" : "Cadastrar cenário"}</h2></div>
        <button onClick={() => setShowScenarioForm(false)} aria-label="Fechar"><X size={18} /></button></div>
      <form className="stack mt-4" onSubmit={scenarioForm.handleSubmit((values) => void createScenario.mutateAsync(values))}>
        <label className="field">Título<input placeholder="Ex.: Aplicar desconto em item desdobrado" {...scenarioForm.register("titulo")} />
          {scenarioForm.formState.errors.titulo && <small role="alert" className="text-error">{scenarioForm.formState.errors.titulo.message}</small>}</label>
        <label className="field">Passos<textarea rows={4} {...scenarioForm.register("passos")} />
          {scenarioForm.formState.errors.passos && <small role="alert" className="text-error">{scenarioForm.formState.errors.passos.message}</small>}</label>
        <label className="field">Resultado esperado<textarea rows={3} {...scenarioForm.register("esperado")} />
          {scenarioForm.formState.errors.esperado && <small role="alert" className="text-error">{scenarioForm.formState.errors.esperado.message}</small>}</label>
        <label className="field">Observações (opcional)<textarea rows={2} {...scenarioForm.register("observacoes")} /></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onPress={() => setShowScenarioForm(false)}>Cancelar</Button>
          <Button type="submit" isDisabled={createScenario.isPending}>{editingScenario ? "Salvar cenário" : "Adicionar cenário"}</Button>
        </div>
        {createScenario.isError && <p role="alert" className="notice error">{createScenario.error.message}</p>}
      </form>
    </section>}

    <section className="panel mt-5">
      <div className="section-heading"><div><p className="eyebrow">EXECUÇÃO</p><h2>Cenários</h2>
        <p className="text-muted">Registre somente o que foi efetivamente testado.</p></div>
        <span className="count-pill">{scenarios.data?.length ?? 0} casos</span></div>
      <div className="filter-line mt-4" role="group" aria-label="Filtrar cenários">
        {([["all", "Todos"], ["pending", "Pendentes"], ["failed", "Falha / bloqueio"]] as const).map(([value, label]) =>
          <button key={value} className={"filter-chip " + (filter === value ? "selected" : "")}
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
            <button disabled={saveResult.isPending} onClick={() => choose(scenario, "aprovado")}><Check size={16} /> Funcionou</button>
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

    {pending && <div className="dialog-backdrop" role="presentation">
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="observed-heading">
        <h2 id="observed-heading">{pending.status === "reprovado" ? "Registrar falha" : "Registrar bloqueio"}</h2>
        <p className="text-muted mt-2">{pending.scenario.titulo}. Descreva o resultado observado.</p>
        <form className="stack mt-4" onSubmit={(event) => {
          event.preventDefault();
          void saveResult.mutateAsync({ scenario: pending.scenario, status: pending.status, obtido: observed });
        }}>
          <label className="field">Comportamento observado
            <textarea required autoFocus rows={5} value={observed} onChange={(e) => setObserved(e.target.value)}
              placeholder="O que ocorreu durante a execução?" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onPress={() => setPending(null)}>Cancelar</Button>
            <Button type="submit" isDisabled={saveResult.isPending || !observed.trim()}>Salvar resultado</Button>
          </div>
        </form>
      </section>
    </div>}
  </div>;
}
