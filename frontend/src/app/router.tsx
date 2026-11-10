import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createHashHistory, createRootRoute, createRoute, createRouter,
  Link, Outlet, useRouterState
} from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { ArrowLeft, BookOpen, ChartNoAxesCombined, LayoutList, LogOut, Settings2, ShieldCheck, Wrench } from "lucide-react";
import { useAuth, AuthScreen, RecoveryScreen } from "../features/auth/AuthProvider";
import { useFocus } from "../stores/focus";
import { supabase } from "../lib/supabase";
import { Workspace } from "../pages/Workspace";
import { getAdminRole } from "../lib/data";
import { navigationFromMetadata } from "../features/profile/navigation-preferences";

const TaskPage = lazy(() => import("../pages/TaskPage"));
const AdminPage = lazy(() => import("../pages/AdminPage"));
const PublicPage = lazy(() => import("../features/public/PublicPage"));
const ProfilePage = lazy(() => import("../features/profile/ProfilePage"));
const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const ToolsPage = lazy(() => import("../pages/ToolsPage"));

function AppLayout() {
  const { user, loading, recovering } = useAuth();
  const taskId = useFocus((s) => s.taskId);
  const navigation = navigationFromMetadata(user?.user_metadata);
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
      <div className="sidebar-section">PRINCIPAL</div>
      <nav aria-label="Navegação" className="qa-primary-nav">
        <Link to="/" activeProps={{ className: "nav-link active" }}
          aria-label="Tarefas de teste" className="nav-link">
          <LayoutList size={18} /> Tarefas
        </Link>
        {navigation.dashboard&&<Link to="/painel" activeProps={{className:"nav-link active"}}
          className="nav-link"><ChartNoAxesCombined size={18}/> Visão geral</Link>}
        {navigation.tools&&<Link to="/ferramentas" activeProps={{className:"nav-link active"}}
          className="nav-link"><Wrench size={18}/> Ferramentas</Link>}
        {navigation.public&&<Link to="/publicas" search={{}} aria-label="TFs públicas"
          className="nav-link"><BookOpen size={18}/> Públicas</Link>}
        {adminRole.data === true&&navigation.admin&&
          <Link to="/admin" activeProps={{className:"nav-link active"}} className="nav-link">
            <ShieldCheck size={18}/> Administração</Link>}
      </nav>
      <div className="qa-sidebar-account">
        <Link to="/perfil" activeProps={{className:"qa-account-button active"}}
          className="qa-account-button">
          <span className="qa-account-avatar" aria-hidden="true">
            {(user.email?.slice(0,1)||"Q").toUpperCase()}
          </span>
          <span className="qa-account-details"><strong>Meu perfil</strong>
            <small>{user.email}</small></span>
          <Settings2 size={17} aria-hidden="true"/>
        </Link>
      </div>
      <Link to="/perfil" className="qa-mobile-profile" aria-label="Perfil e configurações">
        <Settings2 size={19} aria-hidden="true"/>
      </Link>
      <button type="button" className="qa-mobile-logout" aria-label="Sair"
        onClick={() => void supabase.auth.signOut()} title="Sair">
        <LogOut size={19} aria-hidden="true"/>
      </button>
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
          <Link to="/perfil" className="qa-topbar-profile" aria-label="Abrir perfil e configurações">
            <Settings2 size={16}/> Configurações
          </Link>
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
const dashboardRoute = createRoute({
  getParentRoute:()=>rootRoute,
  path:"/painel",
  component:()=> <Suspense fallback={<p role="status">Carregando visão geral…</p>}>
    <DashboardPage/></Suspense>
});
const toolsRoute = createRoute({
  getParentRoute:()=>rootRoute,
  path:"/ferramentas",
  component:()=> <Suspense fallback={<p role="status">Carregando ferramentas…</p>}>
    <ToolsPage/></Suspense>
});
const profileRoute = createRoute({
  getParentRoute:()=>rootRoute,
  path:"/perfil",
  component:()=> <Suspense fallback={<p role="status">Carregando perfil…</p>}>
    <ProfileWithRole/></Suspense>
});
function ProfileWithRole(){
  const {user}=useAuth();
  const role=useQuery({queryKey:["role",user?.id??""],
    queryFn:()=>getAdminRole(user!.id),enabled:!!user?.id});
  return <ProfilePage isAdmin={role.data===true}/>;
}
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
  homeRoute, taskRoute, dashboardRoute, toolsRoute, profileRoute,
  publicRoute, adminRoute, recoveryRoute
]);

export const router = createRouter({ routeTree, history: createHashHistory() });
declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
