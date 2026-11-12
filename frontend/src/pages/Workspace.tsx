import { useEffect, useMemo, useState } from "react";
import { ToastNotice, notify } from "../components/ui/Toasts";
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { ArrowRight, Filter, Inbox, Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { getAdminRole, removeTask } from "../lib/data";
import { searchTasksPage,listSavedFilters,saveFilter,
  deleteFilter,normalizeTaskFilters } from "../features/tasks/task-search-data";
import { listTaskProgress } from "../lib/task-progress";
import { taskStatusLabels } from "../lib/contracts";
import type { Task } from "../lib/contracts";
import { DeleteTaskDialog } from "../features/tasks/DeleteTaskDialog";
import { NewTaskWizard } from "../features/tasks/NewTaskWizard";
import { QAModal } from "../components/ui/QAModal";
import { useFocus } from "../stores/focus";

export function Workspace() {
  const {user}=useAuth();
  const userId=user?.id??"";
  const [showForm,setShowForm]=useState(false);
  const [taskToDelete,setTaskToDelete]=useState<Pick<Task,"id"|"titulo"|"codigo">|null>(null);
  const {newTask}=useSearch({from:"/"});
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type,setType]=useState("");
  const [debouncedSearch,setDebouncedSearch]=useState("");
  const [filterName,setFilterName]=useState("");
  const [filterNotice,setFilterNotice]=useState("");
  const [filterNameError,setFilterNameError]=useState("");
  const [filterToDelete,setFilterToDelete]=useState<{id:string;nome:string}|null>(null);
  useEffect(()=>{
    const timeout=setTimeout(()=>setDebouncedSearch(search),280);
    return ()=>clearTimeout(timeout);
  },[search]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setFocused = useFocus((s) => s.setTask);
  const role = useQuery({ queryKey: ["role", userId], queryFn: () => getAdminRole(userId), enabled: !!userId });
  const filters=useMemo(()=>normalizeTaskFilters({
    search:debouncedSearch,status,type
  }),[debouncedSearch,status,type]);
  const tasks=useInfiniteQuery({
    queryKey:["task-search",userId,role.data,filters],
    queryFn:({pageParam})=>searchTasksPage(filters,pageParam),
    initialPageParam:0,
    getNextPageParam:(last,all)=>{
      const loaded=all.reduce((count,page)=>count+page.items.length,0);
      return loaded<last.total ? all.length : undefined;
    },
    enabled:!!userId && role.data!==undefined,
    staleTime:20000
  });
  const savedFilters=useQuery({
    queryKey:["task-saved-filters",userId],
    queryFn:()=>listSavedFilters(userId),
    enabled:!!userId
  });
  const saveSavedFilter=useMutation({
    mutationFn:()=>saveFilter(userId,filterName,{search,status,type}),
    onSuccess:async()=>{
      setFilterName("");setFilterNameError("");setFilterNotice("Filtro salvo para esta conta.");
      await queryClient.invalidateQueries({queryKey:["task-saved-filters",userId]});
    },
    onError:()=>notify.error("Não foi possível salvar o filtro. Tente novamente.")
  });
  const removeSavedFilter=useMutation({
    mutationFn:(id:string)=>deleteFilter(userId,id),
    onSuccess:async()=>{
      setFilterToDelete(null);setFilterNotice("Filtro removido.");
      await queryClient.invalidateQueries({queryKey:["task-saved-filters",userId]});
    },
    onError:()=>notify.error("Não foi possível excluir o filtro. Tente novamente.")
  });
  const deleteSelectedTask=useMutation({
    mutationFn:(selected:Pick<Task,"id"|"titulo"|"codigo">)=>removeTask(selected.id),
    onSuccess:async()=>{
      setTaskToDelete(null);
      setFocused(null);
      await Promise.all([
        queryClient.invalidateQueries({queryKey:["task-search",userId]}),
        queryClient.invalidateQueries({queryKey:["task-stats",userId]}),
        queryClient.invalidateQueries({queryKey:["tasks",userId]}),
        queryClient.invalidateQueries({queryKey:["public-tasks"]})
      ]);
      notify.success("TF excluída.");
    }
  });
  const visibleTasks=useMemo(()=>
    tasks.data?.pages.flatMap(page=>page.items)??[],[tasks.data]);
  const total=tasks.data?.pages[0]?.total??0;
  async function handleCreated(taskId:string,warning:string){
    if(warning){
      try{sessionStorage.setItem("qa-react-import-warning:"+taskId,
        "TF salva, mas parte dos arquivos ou cenários não foi registrada: "+warning);}
      catch{/* Storage may be disabled; the saved TF remains authoritative. */}
    }
    setFocused(taskId);
    await Promise.all([
      queryClient.invalidateQueries({queryKey:["task-search",userId]}),
      queryClient.invalidateQueries({queryKey:["task-stats",userId]})
    ]);
    setShowForm(false);
    await navigate({to:"/tarefa/$taskId",params:{taskId}});
  }
  useEffect(()=>{if(newTask)setShowForm(true);},[newTask]);

  // Do not clear a focused task simply because it is on a different page.
  // One independent progress query per fetched page. Loading page 4
  // never refetches earlier pages or crosses listTaskProgress's 80-ID cap.
  const progressPages=useQueries({
    queries:(tasks.data?.pages??[]).map(page=>{
      const ids=page.items.map(task=>task.id);
      return {
        queryKey:["task-progress",userId,ids.join(",")],
        queryFn:()=>listTaskProgress(ids),
        enabled:ids.length>0,
        staleTime:30000
      };
    })
  });
  const progress=Object.assign({},...progressPages.map(page=>page.data??{}));
  const progressError=progressPages.find(page=>page.isError);
  const hasActiveFilters=Boolean(search.trim()||status||type);
  const clearFilters=()=>{setSearch("");setDebouncedSearch("");setStatus("");setType("");};
  async function copyErrorDetails(value:string){
    try{await navigator.clipboard.writeText(value);notify.success("Detalhes copiados.");}
    catch{notify.error("Não foi possível copiar os detalhes neste navegador.");}
  }

  return <div className="page">
    <div className="page-heading">
      <div><h1>Suas tarefas de teste</h1></div>
      <Button onPress={() => setShowForm(true)}><Plus size={17} /> Nova TF</Button>
    </div>

    <NewTaskWizard open={showForm} userId={userId}
      onClose={()=>setShowForm(false)} onCreated={handleCreated}/>
    <section className="panel task-panel">
      <div className="section-heading"><div><h2>TFs</h2></div>
        <span className="count-pill" role="status" aria-live="polite">
          {tasks.isPending?"Consultando tarefas…":total+" resultado(s)"}
        </span></div>
      <div className="filter-line">
        <label className="search-box qa-filter-field">
          <span className="qa-filter-field-label">Buscar TF</span>
          <span className="qa-filter-input-row"><Search size={18} aria-hidden="true"/>
            <input type="search" aria-label="Pesquisar por título, código, módulo ou versão" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Ex.: 67866, desconto, v12.08"/>
          </span>
        </label>
        <label className="filter-select qa-filter-field">
          <span className="qa-filter-field-label">Situação</span>
          <span className="qa-filter-input-row"><Filter size={17} aria-hidden="true"/>
            <select value={status} onChange={e=>setStatus(e.target.value)}>
              <option value="">Todas as situações</option>
              {Object.entries(taskStatusLabels).map(([value,label])=>
                <option key={value} value={value}>{label}</option>)}
            </select>
          </span>
        </label>
        <label className="filter-select qa-filter-field">
          <span className="qa-filter-field-label">Tipo de teste</span>
          <span className="qa-filter-input-row">
            <select value={type} onChange={e=>setType(e.target.value)}>
              <option value="">Todos os tipos</option>
              <option value="BUILD">BUILD</option>
              <option value="RELEASE">RELEASE</option>
            </select>
          </span>
        </label>
      </div>
      <details className="qa-saved-filter-controls">
        <summary>Filtros salvos</summary>
        <div className="qa-saved-filters-content">
          <div className="qa-saved-filter-input">
            <label className="field">Nome do filtro
              <input value={filterName} maxLength={60}
                aria-invalid={Boolean(filterNameError)}
                aria-describedby={filterNameError?"qa-filter-name-error":undefined}
                placeholder="Ex.: Releases do financeiro"
                onChange={e=>{setFilterName(e.target.value);setFilterNameError("");}}/>
            </label>
            <Button variant="secondary" isDisabled={saveSavedFilter.isPending}
              onPress={()=>{
                if(filterName.trim().length<2){setFilterNameError("Informe pelo menos 2 caracteres.");return;}
                setFilterNameError("");saveSavedFilter.mutate();
              }}>Salvar filtro atual</Button>
          </div>
          {filterNameError&&<p id="qa-filter-name-error" className="notice error" role="alert">{filterNameError}</p>}
          {savedFilters.isPending&&<div role="status" className="qa-filter-loading">
            <span className="qa-skeleton-line" aria-hidden="true"/>
            <span className="qa-skeleton-line" aria-hidden="true"/>
            <span className="sr-only">Carregando filtros salvos…</span>
          </div>}
          {savedFilters.isError&&<div className="notice error" role="alert">
            <p>Não foi possível carregar seus filtros salvos.</p>
            <button type="button" onClick={()=>void savedFilters.refetch()}>Tentar novamente</button>
          </div>}
          {savedFilters.data?.length===0&&<p className="text-muted text-sm">
            Nenhum filtro salvo nesta conta.</p>}
          {savedFilters.data?.map(saved=><div className="qa-saved-filter-item" key={saved.id}>
            <button type="button" onClick={()=>{
              setSearch(saved.pesquisa);setDebouncedSearch(saved.pesquisa);
              setStatus(saved.situacao);setType(saved.tipo);
              setFilterNotice("Filtro aplicado: "+saved.nome);
            }}>{saved.nome}</button>
            <button type="button" className="qa-saved-filter-remove"
              aria-label={"Excluir filtro salvo: "+saved.nome}
              disabled={removeSavedFilter.isPending}
              onClick={()=>setFilterToDelete({id:saved.id,nome:saved.nome})}>Excluir</button>
          </div>)}
        </div>
      </details>
      <div className="qa-filter-notice" role="status" aria-live="polite">
        <ToastNotice message={filterNotice} tone="success"/>
      </div>
      <QAModal open={Boolean(filterToDelete)} size="sm"
        title="Excluir filtro salvo?" eyebrow="CONFIRMAÇÃO"
        description="O filtro será removido da conta. Suas TFs não serão excluídas."
        onClose={()=>{if(!removeSavedFilter.isPending)setFilterToDelete(null);}}
        busy={removeSavedFilter.isPending}
        initialFocus=".qa-filter-delete-cancel">
        <p>Deseja excluir o filtro <strong>{filterToDelete?.nome}</strong>?</p>
        {removeSavedFilter.isError&&<p role="alert" className="notice error">
          Não foi possível excluir o filtro. Tente novamente.
        </p>}
        <div className="qa-task-delete-actions">
          <Button variant="secondary" className="qa-filter-delete-cancel"
            isDisabled={removeSavedFilter.isPending}
            onPress={()=>setFilterToDelete(null)}>Cancelar</Button>
          <button type="button" className="qa-task-delete-confirm"
            disabled={removeSavedFilter.isPending||!filterToDelete}
            onClick={()=>filterToDelete&&removeSavedFilter.mutate(filterToDelete.id)}>
            <Trash2 size={16} aria-hidden="true"/>
            {removeSavedFilter.isPending?"Excluindo…":"Excluir filtro"}
          </button>
        </div>
      </QAModal>
      {(role.isPending||tasks.isPending)&&<div className="qa-task-list-skeleton" role="status" aria-busy="true">
        <span className="sr-only">Carregando tarefas…</span>
        {Array.from({length:4},(_,index)=><div className="qa-task-skeleton-row" key={index} aria-hidden="true">
          <span className="qa-skeleton-avatar"/>
          <span className="qa-skeleton-text"><span/><span/></span>
          <span className="qa-skeleton-badge"/>
        </div>)}
      </div>}
      {(role.isError||tasks.isError)&&<div className="notice error mt-4" role="alert">
        <p>Não foi possível carregar as TFs. Você pode tentar novamente.</p>
        <div className="qa-workspace-error-actions">
          <button type="button" onClick={()=>{void role.refetch();void tasks.refetch();}}>Tentar novamente</button>
          <button type="button" onClick={()=>void copyErrorDetails(
            role.error?.message||tasks.error?.message||"Falha desconhecida.")}>Copiar detalhes</button>
        </div>
      </div>}
      {tasks.isSuccess&&total===0&&<div className="empty-state">
        <Inbox size={28} aria-hidden="true"/>
        <strong>{hasActiveFilters?"Nenhuma TF encontrada com estes filtros":"Nenhuma TF cadastrada"}</strong>
        <p>{hasActiveFilters?"Remova os filtros para voltar a encontrar suas tarefas.":
          "Crie uma TF para registrar o primeiro teste."}</p>
        <div className="qa-workspace-empty-actions">
          {hasActiveFilters&&<Button variant="secondary" onPress={clearFilters}>Limpar filtros</Button>}
          <Button onPress={()=>setShowForm(true)}><Plus size={16} aria-hidden="true"/> Nova TF</Button>
        </div>
      </div>}
      {progressError && <p className="notice error mt-3" role="alert">
        Progresso temporariamente indisponível. As TFs ainda podem ser abertas normalmente.
      </p>}
      <div className="task-rows">
        {visibleTasks.map((task) => {
          const stats = progress[task.id];
          const own = task.user_id === userId;
          return <div className="task-list-entry" key={task.id}>
            <Link to="/tarefa/$taskId" params={{ taskId: task.id }}
              className="task-row task-row-main" onClick={() => setFocused(task.id)}>
              <span className="task-initial">{(task.codigo || "TF").slice(0, 3).toUpperCase()}</span>
              <span className="task-text"><strong>{task.titulo}</strong>
                <small>{task.codigo || "Sem código"} · {task.tipo_teste} · {task.sistema || "Sem módulo"}
                  {task.versao ? " · " + task.versao : ""}</small>
                {stats && <small className="task-progress-meta">
                  {stats.executed}/{stats.total} executados · {stats.pending} pendente(s)
                </small>}
              </span>
              <span className={"status-chip " + task.status}>{taskStatusLabels[task.status]}</span>
              <ArrowRight className="row-arrow" size={18} />
            </Link>
            {own && stats && (stats.pending > 0 || stats.total === 0) &&
              <Link to="/tarefa/$taskId" params={{ taskId: task.id }}
                search={stats.total === 0 ? { newScenario: true } : { resume: true }}
                onClick={() => setFocused(task.id)}
                className="task-resume-link">
                {stats.total === 0 ? "Adicionar primeiro caso" : "Continuar testes"}
              </Link>}
            {own && <button type="button" className="qa-task-row-delete"
              aria-label={"Excluir TF: "+task.titulo} title="Excluir TF"
              disabled={deleteSelectedTask.isPending}
              onClick={()=>{
                deleteSelectedTask.reset();
                setTaskToDelete({id:task.id,titulo:task.titulo,codigo:task.codigo});
              }}>
              <Trash2 size={16} aria-hidden="true"/>
            </button>}
          </div>;
        })}
      </div>
      <DeleteTaskDialog task={taskToDelete} busy={deleteSelectedTask.isPending}
        error={deleteSelectedTask.error?.message}
        onClose={()=>{if(!deleteSelectedTask.isPending)setTaskToDelete(null);}}
        onConfirm={()=>{
          if(taskToDelete && !deleteSelectedTask.isPending)
            deleteSelectedTask.mutate(taskToDelete);
        }}/>
      {tasks.hasNextPage&&<div className="qa-task-more">
        <p className="text-muted text-sm">Exibindo {visibleTasks.length} de {total} TFs</p>
        <Button variant="secondary" isDisabled={tasks.isFetchingNextPage}
          onPress={()=>void tasks.fetchNextPage()}>
          {tasks.isFetchingNextPage?"Carregando…":
            "Mostrar mais TFs ("+(total-visibleTasks.length)+" restantes)"}
        </Button>
      </div>}
      {tasks.isFetchNextPageError&&<p role="alert" className="notice error">
        Falha ao carregar mais TFs. Tente novamente.</p>}
    </section>
  </div>;
}
