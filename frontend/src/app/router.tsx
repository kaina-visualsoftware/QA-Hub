import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createHashHistory, createRootRoute, createRoute, createRouter,
  Link, Outlet, useRouterState
} from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { ArrowLeft, BookOpen, ExternalLink, LayoutList, LogOut, Plus, ShieldCheck } from "lucide-react";
import { useAuth, AuthScreen, RecoveryScreen } from "../features/auth/AuthProvider";
import { useFocus } from "../stores/focus";
import { supabase } from "../lib/supabase";
import { Workspace } from "../pages/Workspace";
import { getAdminRole } from "../lib/data";

const TaskPage = lazy(() => import("../pages/TaskPage"));
const AdminPage = lazy(() => import("../pages/AdminPage"));
const PublicPage = lazy(() => import("../features/public/PublicPage"));

function AppLayout() {
  const { user, loading, recovering } = useAuth();
  const taskId = useFocus((s) => s.taskId);
  const publicView = useRouterState({ select: (state) => state.location.pathname === "/publicas" });
  const recoveryView = useRouterState({ select: (state) => state.location.pathname === "/recuperar" });
  const adminRole = useQuery({
    queryKey: ["role", user?.id ?? ""], queryFn: () => getAdminRole(user!.id),
    enabled: Boolean(user?.id) && !publicView
  });
  // An intentionally public route must work before authentication resolves.
  if (publicView) return <Outlet />;
  if (loading) return <div className="screen-status" role="status">Carregando sessão…</div>;
  if (user && (recovering || recoveryView)) return <RecoveryScreen />;
  if (!user) return <AuthScreen />;

  return <div className="app-shell">
    <button type="button" className="skip-link"
      onClick={() => document.getElementById("main")?.focus()}>Pular para o conteúdo</button>
    <aside className="sidebar">
      <Link to="/" className="brand"><span className="brand-icon">Q.</span><span>
        <strong>QA Hub</strong><small>TEST MANAGEMENT</small></span></Link>
      <div className="sidebar-section">WORKSPACE</div>
      <nav aria-label="Navegação">
        <Link to="/" activeProps={{ className: "nav-link active" }}
          aria-label="Tarefas de teste" className="nav-link">
          <LayoutList size={18} /> Tarefas
        </Link>
        <Link to="/" search={{ newTask: true }} className="nav-link">
          <Plus size={18} /> Nova TF
        </Link>
      </nav>
      <div className="sidebar-section mt-8">CONSULTAS</div>
      <nav aria-label="Biblioteca e administração">
        <Link to="/publicas" search={{}} aria-label="TFs públicas" className="nav-link">
          <BookOpen size={18} /> Públicas
        </Link>
        {adminRole.data === true &&
          <Link to="/admin" className="nav-link">
            <ShieldCheck size={18} /> Administração
          </Link>}
      </nav>
      <div className="sidebar-section mt-8">COMPATIBILIDADE</div>
      <nav aria-label="Versão anterior">
        <a className="nav-link" href="/QA-Hub/qa-legacy.html">
          <ExternalLink size={17} /> Abrir versão anterior
        </a>
      </nav>
      <button type="button" className="qa-mobile-logout" aria-label="Sair"
        onClick={() => void supabase.auth.signOut()} title="Sair">
        <LogOut size={19} aria-hidden="true"/>
      </button>
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
          {taskId && <Link to="/tarefa/$taskId" params={{ taskId }} className="focus-pill">
            Abrir TF em foco
          </Link>}
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
  validateSearch: (search: Record<string, unknown>): { newScenario?: boolean; resume?: boolean } => ({
    newScenario: search.newScenario === true || search.newScenario === "1"
      ? true : undefined,
    resume: search.resume === true || search.resume === "1"
      ? true : undefined
  }),
  component: () => <Suspense fallback={<p role="status">Abrindo TF…</p>}><TaskPage /></Suspense>
});
const publicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/publicas",
  validateSearch: (search: Record<string, unknown>): { tf?: string } => ({
    tf: typeof search.tf === "string" ? search.tf : undefined
  }),
  component: () => <Suspense fallback={<p role="status" className="screen-status">Carregando biblioteca…</p>}>
    <PublicPage />
  </Suspense>
});
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: () => <Suspense fallback={<p role="status" className="notice">Carregando administração…</p>}>
    <AdminPage />
  </Suspense>
});
const recoveryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recuperar",
  component: RecoveryScreen
});
const routeTree = rootRoute.addChildren([
  homeRoute, taskRoute, publicRoute, adminRoute, recoveryRoute
]);

export const router = createRouter({ routeTree, history: createHashHistory() });
declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
