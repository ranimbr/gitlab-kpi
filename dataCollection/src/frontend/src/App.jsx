import { useState, useEffect, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth, ROLES } from "./context/AuthContext";

// ── Layout ────────────────────────────────────────────────────────────────────
import Sidebar         from "./components/layout/Sidebar";
import Topbar          from "./components/layout/Topbar";
import Footer          from "./components/layout/Footer";

// ── Context for sidebar collapse state ───────────────────────────────────────
const SidebarCollapseContext = createContext({
  isCollapsed: false,
  toggleCollapse: () => {}
});

function SidebarCollapseProvider({ children }) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('sidebar-collapsed', String(newValue));
      return newValue;
    });
  };

  return (
    <SidebarCollapseContext.Provider value={{ isCollapsed, toggleCollapse }}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export const useSidebarCollapse = () => useContext(SidebarCollapseContext);


// ── pages/ (racine) ──────────────────────────────────────────────────────────
import LandingPage           from "./pages/LandingPage";
import Login               from "./pages/Login";
import ForgotPassword       from "./pages/ForgotPassword";
import ResetPassword        from "./pages/ResetPassword";
// ✅ [REMOVED] DashboardKPI - Page principale supprimée
// import DashboardKPI        from "./pages/DashboardKPI";
import ProjectsPage        from "./pages/ProjectsPage";
import CommitsPage         from "./pages/CommitsPage";
import MergePage           from "./pages/MergePage";
import ExtractionPage      from "./pages/ExtractionPage";
import Profile             from "./pages/Profile";
import UsersPage           from "./pages/UsersPage";
// ✅ [REMOVED] AlertsPage - Non fonctionnelle
// import AlertsPage          from "./pages/AlertsPage";
// ✅ [REMOVED] KpiAnalysisPage - Non fonctionnelle
// import KpiAnalysisPage     from "./pages/KpiAnalysisPage";
// [NEW] Page profil développeur — heatmap + KPIs individuels
import DeveloperProfilePage from "./pages/DeveloperProfilePage";
// [NEW] Hub développeurs — vue developer-centrique (réponse remarque encadrant)
import DevelopersHubPage      from "./pages/DevelopersHubPage";
// ✅ [REMOVED] Team Management - Business Units page supprimée
// import TeamManagementPage     from "./pages/TeamManagementPage";
// [NEW] Fast-Track Onboarding Wizard
import SetupWizardPage        from "./pages/SetupWizardPage";
// ✅ [REMOVED] DeveloperComparisonPage - Non fonctionnelle
// import DeveloperComparisonPage from "./pages/DeveloperComparisonPage";
// [NEW] Priorité 3 — Page Analyse de Performance 360° (Bus Factor, Velocity, Churn, Percentile)
import DeveloperPerformancePage from "./pages/DeveloperPerformancePage";
// [NEW][SENIOR] Pilotage Stratégique — Comparaison multi-sites et multi-équipes
import ComparativeAnalyticsPage from "./pages/ComparativeAnalyticsPage";
// ✅ [REMOVED] DiagnosticPage - Non fonctionnelle
// import DiagnosticPage           from "./pages/DiagnosticPage";


// ── pages/admin/ ─────────────────────────────────────────────────────────────
import DevelopersPage       from "./pages/admin/DevelopersPage";
import PeriodsPage          from "./pages/admin/PeriodsPage";
import GitLabConfigPage     from "./pages/admin/GitLabConfigPage";
import ExtractionLotsPage   from "./pages/admin/ExtractionLotsPage";
import AdminProjectsPage    from "./pages/admin/AdminProjectsPage";
// ✅ [REMOVED] KpiThresholdPage - Seuils KPI page supprimée
// import KpiThresholdPage     from "./pages/admin/KpiThresholdPage";
import SitesPage            from "./pages/admin/SitesPage";
import KpiDefinitionsPage   from "./pages/admin/KpiDefinitionsPage";
import AuditLogPage         from "./pages/admin/AuditLogPage";
import DevelopersImportPage from "./pages/admin/DevelopersImportPage";
import SchedulerAdminPage    from "./pages/admin/SchedulerAdminPage";
import ProfileManagementPage from "./pages/admin/ProfileManagementPage";
import RolesPage            from "./pages/admin/RolesPage";

// ── guards ─────────────────────────────────────────────────────────────────────
import PermissionGuard       from "./components/guards/PermissionGuard";

function AppLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  // Listen for custom event from Sidebar
  useEffect(() => {
    const handleSidebarToggle = (event) => {
      setIsSidebarCollapsed(event.detail);
    };

    window.addEventListener('sidebar-toggle', handleSidebarToggle);

    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle);
    };
  }, []);

  return (
    <div id="layout-wrapper" className={isSidebarCollapsed ? 'sidebar-collapsed' : ''}>
      <Topbar />
      <Sidebar />

      <div
        className="main-content"
        style={{
          marginLeft: isSidebarCollapsed ? '64px' : '240px',
          width: isSidebarCollapsed ? 'calc(100% - 64px)' : 'calc(100% - 240px)'
        }}
      >
        <Outlet />
        <Footer />
      </div>
    </div>
  );
}

// ─── Guard : utilisateur connecté ────────────────────────────────────────────
function PrivateRoute() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

/**
 * Guard : super_admin uniquement
 * Opérations critiques : gestion utilisateurs, config GitLab,
 * KPI definitions, audit log, sites.
 */
function SuperAdminRoute() {
  const { user } = useAuth();
  return user?.role === ROLES.SUPER_ADMIN
    ? <Outlet />
    : <Navigate to="/" replace />;
}

/**
 * Guard : super_admin OU site_manager
 * Gestion opérationnelle : extraction, périodes, seuils KPI, dashboards.
 */
function ManagerRoute() {
  const { user } = useAuth();
  const allowed = [ROLES.SUPER_ADMIN, ROLES.SITE_MANAGER];
  return allowed.includes(user?.role)
    ? <Outlet />
    : <Navigate to="/" replace />;
}

/**
 * Guard : super_admin, site_manager, team_lead, project_manager OU viewer
 * Gestion des développeurs (création, validation, import) et analyse stratégique.
 */
function TeamLeadRoute() {
  const { user } = useAuth();
  const allowed = [ROLES.SUPER_ADMIN, ROLES.SITE_MANAGER, ROLES.TEAM_LEAD, ROLES.PROJECT_MANAGER, ROLES.VIEWER];
  return allowed.includes(user?.role)
    ? <Outlet />
    : <Navigate to="/" replace />;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <SidebarCollapseProvider>
        <Routes>

          {/* ── Public ── */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* ── Privé (tout utilisateur connecté) ── */}
          <Route element={<PrivateRoute />}>
            <Route element={<AppLayout />}>

            {/* Pages accessibles à tous les rôles connectés */}
            {/* ✅ [REMOVED] DashboardKPI route - Page principale supprimée */}
            {/* <Route path="/dashboard"    element={<DashboardKPI />} /> */}
            <Route path="/projects"     element={<ProjectsPage />} />
            <Route path="/commits"      element={<CommitsPage />} />
            <Route path="/merge"        element={<MergePage />} />
            <Route path="/profile"      element={<Profile />} />
            {/* ✅ [REMOVED] AlertsPage - Non fonctionnelle */}
            {/* <Route path="/alerts"       element={<AlertsPage />} /> */}
            {/* ✅ [REMOVED] KpiAnalysisPage - Non fonctionnelle */}
            {/* <Route path="/kpi-analysis" element={<KpiAnalysisPage />} /> */}

            {/* [NEW] Hub développeurs — point d'entrée developer-centrique */}
            {/* Réponse directe à la remarque encadrant : focus sur les développeurs */}
            <Route path="/developers" element={<DevelopersHubPage />} />

            {/* ✅ [REMOVED] DeveloperComparisonPage - Non fonctionnelle */}
            {/* <Route path="/developers/compare" element={<DeveloperComparisonPage />} /> */}

            {/* [NEW] Profil développeur — heatmap + KPIs individuels */}
            {/* Accessible à tous les rôles connectés */}
            {/* URL : /developers/42?project_id=1 */}
            <Route path="/developers/:id" element={<DeveloperProfilePage />} />

            {/* [NEW] Analyse de Performance 360° — Bus Factor, Velocity, Churn, Percentile */}
            {/* URL : /developers/42/performance?project_id=1 */}
            <Route path="/developers/:id/performance" element={<DeveloperPerformancePage />} />

            {/* Extraction Lots — lecture seule, tous rôles */}
            <Route path="/extraction-lots" element={<ExtractionLotsPage />} />

            {/* ── Team Lead ou supérieur ── */}
            <Route element={<TeamLeadRoute />}>
              <Route path="/admin/developers"        element={<DevelopersPage />} />
              <Route path="/admin/developers/import" element={<DevelopersImportPage />} />
              {/* [NEW][SENIOR] Dashboard de Pilotage — Comparaison Stratégique Sites/Équipes */}
              <Route path="/analytics/comparison" element={<ComparativeAnalyticsPage />} />
              {/* ✅ [REMOVED] DiagnosticPage - Non fonctionnelle */}
              {/* <Route path="/analytics/diagnostic" element={<DiagnosticPage />} /> */}
            </Route>

            {/* ── Site Manager ou supérieur ── */}
            <Route element={<ManagerRoute />}>
              <Route path="/extraction"           element={<ExtractionPage />} />
              <Route path="/setup"                element={<SetupWizardPage />} />
              <Route path="/admin/periods"        element={<PeriodsPage />} />
              <Route path="/admin/projects"       element={<AdminProjectsPage />} />
              {/* ✅ [REMOVED] KpiThresholdPage - Seuils KPI page supprimée */}
              {/* <Route path="/admin/kpi-thresholds" element={<KpiThresholdPage />} /> */}
              <Route path="/admin/scheduler"      element={<SchedulerAdminPage />} />
               {/* ✅ [REMOVED] Gestion d'équipe - Business Units page supprimée */}
              {/* <Route path="/team"                 element={<TeamManagementPage />} /> */}
            </Route>


            {/* ── Super Admin uniquement ── */}
            <Route element={<SuperAdminRoute />}>
              <Route path="/admin/users"           element={<UsersPage />} />
              <Route path="/admin/gitlab-configs"  element={<GitLabConfigPage />} />
              <Route path="/admin/sites"           element={<SitesPage />} />
              <Route path="/admin/kpi-definitions" element={<KpiDefinitionsPage />} />
              <Route path="/admin/audit-log"       element={<AuditLogPage />} />
              <Route path="/admin/profiles"       element={<ProfileManagementPage />} />
              <Route path="/admin/roles"          element={<RolesPage />} />
            </Route>

          </Route>
        </Route>

        {/* Fallback → Dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
      </SidebarCollapseProvider>
    </BrowserRouter>
  );
}
