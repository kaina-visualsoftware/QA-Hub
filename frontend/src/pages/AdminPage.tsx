import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Eye, Filter, ShieldCheck } from "lucide-react";
import { getAdminRole, listTasks } from "../lib/data";
import { taskStatusLabels } from "../lib/contracts";
import { useAuth } from "../features/auth/AuthProvider";
import AiMonitoringPanel from "../features/ai-monitoring/AiMonitoringPanel";

export default function AdminPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState<"all" | "mine" | "others">("all");
  const [status, setStatus] = useState("");
  const role = useQuery({
    queryKey: ["role", userId],
    queryFn: () => getAdminRole(userId),
    enabled: Boolean(userId)
  });
  const tasks = useQuery({
    queryKey: ["tasks", userId, true],
    queryFn: () => listTasks(userId, true),
    enabled: role.data === true && Boolean(userId)
  });
  const filtered = useMemo(() => (tasks.data ?? []).filter((task) => {
    const belongs = task.user_id === userId;
    if (ownership === "mine" && !belongs) return false;
    if (ownership === "others" && belongs) return false;
    if (status && task.status !== status) return false;
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return !needle || [task.codigo, task.titulo, task.sistema, task.versao, task.descricao]
      .some((part) => (part ?? "").toLocaleLowerCase("pt-BR").includes(needle));
  }), [tasks.data, search, ownership, status, userId]);

  if (role.isPending) return <p role="status" className="notice">Validando permissão administrativa…</p>;
  if (role.isError) return <p role="alert" className="notice error">
    Não foi possível confirmar a permissão administrativa: {role.error.message}
  </p>;
  if (!role.data) return <div className="panel">
    <h1 className="text-xl font-semibold">Acesso restrito</h1>
    <p className="text-muted mt-2">Esta área requer uma autorização registrada pelo banco.
      O cadastro comum não concede acesso administrativo.</p>
    <Link to="/" className="secondary-link mt-4">Voltar às suas TFs</Link>
  </div>;

  const ownTasks = (tasks.data ?? []).filter((task) => task.user_id === userId);
  const others = (tasks.data ?? []).length - ownTasks.length;
  const publicCount = (tasks.data ?? []).filter((task) => task.publica).length;

  return <div className="page">
    <div className="page-heading">
      <div><p className="eyebrow">ACESSO ADMINISTRATIVO AUTORIZADO</p>
        <h1>Painel administrativo</h1>
        <p className="text-muted">Consulte as TFs permitidas pelas políticas do Supabase.
          Nenhuma alteração é realizada nesta tela.</p>
      </div>
      <span className="public-react-readonly"><ShieldCheck size={16} /> Permissão verificada</span>
    </div>
    {tasks.isPending && <p className="notice" role="status">Carregando TFs administrativas…</p>}
    {tasks.isError && <p role="alert" className="notice error">
      Falha ao consultar os dados autorizados: {tasks.error.message}
    </p>}
    {tasks.isSuccess && <>
      <div className="stat-strip">
        <div><span>TFs acessíveis</span><strong>{tasks.data.length}</strong></div>
        <div><span>Da minha conta</span><strong>{ownTasks.length}</strong></div>
        <div><span>De outros autores</span><strong>{others}</strong></div>
        <div><span>Publicadas</span><strong>{publicCount}</strong></div>
      </div>
      <section className="panel" aria-labelledby="admin-records">
        <div className="section-heading">
          <div><h2 id="admin-records">Consultar tarefas autorizadas</h2>
            <p className="text-muted text-sm">Ações administrativas existentes são realizadas
              na TF aberta, com as mesmas permissões do banco.</p></div>
          <span className="count-pill">{filtered.length} TF(s)</span>
        </div>
        <div className="form-grid mt-4">
          <label className="field grow-2">Buscar TF
            <input type="search" placeholder="Número, título, sistema ou versão"
              value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <label className="field">Autor
            <select aria-label="Filtrar por autor" value={ownership}
              onChange={(event) => setOwnership(event.target.value as typeof ownership)}>
              <option value="all">Todos os autores</option>
              <option value="mine">Minhas TFs</option>
              <option value="others">Outros autores</option>
            </select>
          </label>
          <label className="field">Situação
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todas as situações</option>
              {Object.entries(taskStatusLabels).map(([key, label]) =>
                <option value={key} key={key}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="admin-react-list mt-4">
          {!filtered.length && <p className="text-muted">Nenhuma TF encontrada.</p>}
          {filtered.map((task) => <Link key={task.id} to="/tarefa/$taskId"
            params={{ taskId: task.id }} className="task-row">
            <span className="task-initial"><Filter size={16}/></span>
            <span className="task-text"><strong>{task.titulo}</strong>
              <small>{task.codigo || "Sem código"} · {task.sistema || "Módulo não informado"} ·
                {task.user_id === userId ? " Minha conta" : " Outro autor"} ·
                {task.publica ? " Pública" : " Privada"}
              </small>
            </span>
            <span className={"status-chip " + task.status}>{taskStatusLabels[task.status]}</span>
            <ArrowRight className="row-arrow" size={18}/>
          </Link>)}
        </div>
      </section>
      <div className="panel mt-4 flex flex-wrap gap-3 items-start">
        <Eye size={18}/><p className="text-sm text-muted">O painel de administração
          não exibe emails, senhas, convites administrativos ou anexos privados.
          A visibilidade das tarefas é determinada pela RLS, não por dados editáveis do perfil.</p>
        <CheckCircle2 size={18}/>
      </div>
    </>}
    <AiMonitoringPanel />
  </div>;
}
