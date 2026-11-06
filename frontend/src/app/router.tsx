import { lazy, Suspense } from "react";
import {
  createHashHistory, createRootRoute, createRoute, createRouter,
  Link, Outlet
} from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { ArrowLeft, ExternalLink, LayoutList, LogOut, Plus, ShieldCheck } from "lucide-react";
import { useAuth, AuthScreen, RecoveryScreen } from "../features/auth/AuthProvider";
import { useFocus } from "../stores/focus";
import { supabase } from "../lib/supabase";
import { Workspace } from "../pages/Workspace";

const TaskPage = lazy(() => import("../pages/TaskPage"));

function AppLayout() {
  const { user, loading, recovering } = useAuth();
  const taskId = useFocus((s) => s.taskId);
  if (loading) return <div className="screen-status" role="status">Carregando sessão…</div>;
  if (recovering && user) return <RecoveryScreen />;
  if (!user) return <AuthScreen />;

  return <div className="app-shell">
    <a className="skip-link" href="#main">Pular para o conteúdo</a>
    <aside className="sidebar">
      <Link to="/" className="brand"><span className="brand-icon">Q.</span><span>
        <strong>QA Hub</strong><small>TEST MANAGEMENT</small></span></Link>
      <div className="sidebar-section">WORKSPACE</div>
      <nav aria-label="Navegação">
        <Link to="/" activeProps={{ className: "nav-link active" }} className="nav-link">
          <LayoutList size={18} /> Tarefas de teste
        </Link>
        <Link to="/" search={{ newTask: true }} className="nav-link">
          <Plus size={18} /> Nova TF
        </Link>
      </nav>
      <div className="sidebar-section mt-8">RECURSOS EXISTENTES</div>
      <nav aria-label="Ferramentas na versão atual">
        <a className="nav-link" href="https://kaina-visualsoftware.github.io/QA-Hub/qa.html#/ferramentas/post">
          <ExternalLink size={17} /> Posts e relatórios
        </a>
        <a className="nav-link" href="https://kaina-visualsoftware.github.io/QA-Hub/qa.html#/ferramentas/teste">
          <ExternalLink size={17} /> Gerar casos com IA
        </a>
      </nav>
      <div className="sidebar-footer"><ShieldCheck size={17} /> Dados vinculados à sua conta</div>
    </aside>
    <div className="content-column">
      <header className="topbar">
        <div className="topbar-heading">
          <Link to="/" className="mobile-back" aria-label="Voltar às TFs"><ArrowLeft size={20} /></Link>
          <span className="topbar-kicker">QUALIDADE DE SOFTWARE</span>
          <strong>Área de trabalho</strong>
        </div>
        <div className="topbar-tools">
          {taskId && <span className="focus-pill" title={taskId}>TF em foco</span>}
          <span className="account-email">{user.email}</span>
          <Button size="sm" variant="secondary" onPress={() => void supabase.auth.signOut()}>
            <LogOut size={16} /> Sair
          </Button>
        </div>
      </header>
      <main id="main" className="main-area" tabIndex={-1}><Outlet /></main>
    </div>
  </div>;
}

const rootRoute = createRootRoute({ component: AppLayout });
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): { newTask?: boolean } => ({
    newTask: search.newTask === true || search.newTask === "1" ? true : undefined
  }),
  component: Workspace
});
const taskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tarefa/$taskId",
  component: () => <Suspense fallback={<p role="status">Abrindo TF…</p>}><TaskPage /></Suspense>
});
const routeTree = rootRoute.addChildren([homeRoute, taskRoute]);

export const router = createRouter({ routeTree, history: createHashHistory() });
declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
