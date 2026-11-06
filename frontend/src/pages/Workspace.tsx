import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowRight, CheckCheck, Filter, Plus, Search, X } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { createTask, getAdminRole, listTasks } from "../lib/data";
import { taskDraftSchema, taskStatusLabels } from "../lib/contracts";
import type { TaskDraft } from "../lib/contracts";
import { useFocus } from "../stores/focus";

export function Workspace() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [showForm, setShowForm] = useState(false);
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
  const form = useForm<TaskDraft>({
    resolver: zodResolver(taskDraftSchema),
    defaultValues: { titulo: "", descricao: "", codigo: "", tipo_teste: "BUILD", sistema: "", versao: "" }
  });
  const create = useMutation({
    mutationFn: (draft: TaskDraft) => createTask(userId, draft),
    onSuccess: async (task) => {
      setFocused(task.id);
      await queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      setShowForm(false);
      form.reset();
      await navigate({ to: "/tarefa/$taskId", params: { taskId: task.id } });
    }
  });

  useEffect(() => {
    if (window.location.hash === "#nova") setShowForm(true);
  }, []);

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

    {showForm && <section className="panel editor-panel" aria-labelledby="new-task-title">
      <div className="section-heading">
        <div><p className="eyebrow">CADASTRO RÁPIDO</p><h2 id="new-task-title">Nova TF</h2>
          <p className="text-muted">Somente o essencial agora. Detalhe os cenários depois.</p></div>
        <button aria-label="Fechar cadastro" onClick={() => setShowForm(false)}><X size={18} /></button>
      </div>
      <form onSubmit={form.handleSubmit((values) => void create.mutateAsync(values))} className="stack mt-5">
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
          <textarea rows={4} placeholder="Cole aqui o contexto que você já tem. Não precisa preencher todos os campos."
            {...form.register("descricao")} />
        </label>
        <div className="flex items-center gap-3 justify-end">
          <span className="text-muted text-sm mr-auto">O registro inicia como rascunho.</span>
          <Button type="button" variant="secondary" onPress={() => setShowForm(false)}>Cancelar</Button>
          <Button type="submit" isDisabled={create.isPending}>Salvar e abrir TF</Button>
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
