import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth, ROLES } from "./context/AuthContext";

// ── Layout ────────────────────────────────────────────────────────────────────
import Sidebar         from "./components/layout/Sidebar";
import Topbar          from "./components/layout/Topbar";
import Footer          from "./components/layout/Footer";


// ── pages/ (racine) ──────────────────────────────────────────────────────────
import LandingPage           from "./pages/LandingPage";
import Login               from "./pages/Login";
import DashboardKPI        from "./pages/DashboardKPI";
import ProjectsPage        from "./pages/ProjectsPage";
import CommitsPage         from "./pages/CommitsPage";
import MergePage           from "./pages/MergePage";
import ExtractionPage      from "./pages/ExtractionPage";
import Profile             from "./pages/Profile";
import UsersPage           from "./pages/UsersPage";
import AlertsPage          from "./pages/AlertsPage";
import KpiAnalysisPage     from "./pages/KpiAnalysisPage";
// [NEW] Page profil développeur — heatmap + KPIs individuels
import DeveloperProfilePage from "./pages/DeveloperProfilePage";
// [NEW] Hub développeurs — vue developer-centrique (réponse remarque encadrant)
import DevelopersHubPage      from "./pages/DevelopersHubPage";
// [PHASE-1] Team Management — workflow manager : constituer équipe, assigner site/groupe
import TeamManagementPage     from "./pages/TeamManagementPage";
// [NEW] Fast-Track Onboarding Wizard
import SetupWizardPage        from "./pages/SetupWizardPage";
// [NEW] Phase 6: Comparaison côte-à-côte de 2 développeurs
import DeveloperComparisonPage from "./pages/DeveloperComparisonPage";
// [NEW] Priorité 3 — Page Analyse de Performance 360° (Bus Factor, Velocity, Churn, Percentile)
import DeveloperPerformancePage from "./pages/DeveloperPerformancePage";
// [NEW][SENIOR] Pilotage Stratégique — Comparaison multi-sites et multi-équipes
import ComparativeAnalyticsPage from "./pages/ComparativeAnalyticsPage";


// ── pages/admin/ ─────────────────────────────────────────────────────────────
import DevelopersPage       from "./pages/admin/DevelopersPage";
import PeriodsPage          from "./pages/admin/PeriodsPage";
import GitLabConfigPage     from "./pages/admin/GitLabConfigPage";
import DashboardsAdminPage  from "./pages/admin/DashboardsAdminPage";
import ExtractionLotsPage   from "./pages/admin/ExtractionLotsPage";
import AdminProjectsPage    from "./pages/admin/AdminProjectsPage";
import KpiThresholdPage     from "./pages/admin/KpiThresholdPage";
import SitesPage            from "./pages/admin/SitesPage";
import KpiDefinitionsPage   from "./pages/admin/KpiDefinitionsPage";
import AuditLogPage         from "./pages/admin/AuditLogPage";
import DevelopersImportPage from "./pages/admin/DevelopersImportPage";

function AppLayout() {
  return (
    <div id="layout-wrapper">
      <Topbar />
      <Sidebar />

      <div className="main-content">
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
 * Guard : super_admin, site_manager OU team_lead
 * Gestion des développeurs (création, validation, import).
 */
function TeamLeadRoute() {
  const { user } = useAuth();
  const allowed = [ROLES.SUPER_ADMIN, ROLES.SITE_MANAGER, ROLES.TEAM_LEAD];
  return allowed.includes(user?.role)
    ? <Outlet />
    : <Navigate to="/" replace />;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── Public ── */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />

        {/* ── Privé (tout utilisateur connecté) ── */}
        <Route element={<PrivateRoute />}>
          <Route element={<AppLayout />}>

            {/* Pages accessibles à tous les rôles connectés */}
            <Route path="/dashboard"    element={<DashboardKPI />} />
            <Route path="/projects"     element={<ProjectsPage />} />
            <Route path="/commits"      element={<CommitsPage />} />
            <Route path="/merge"        element={<MergePage />} />
            <Route path="/profile"      element={<Profile />} />
            <Route path="/alerts"       element={<AlertsPage />} />
            <Route path="/kpi-analysis" element={<KpiAnalysisPage />} />

            {/* [NEW] Hub développeurs — point d'entrée developer-centrique */}
            {/* Réponse directe à la remarque encadrant : focus sur les développeurs */}
            <Route path="/developers" element={<DevelopersHubPage />} />

            {/* [NEW] Phase 6: Comparaison côte-à-côte de 2 développeurs */}
            <Route path="/developers/compare" element={<DeveloperComparisonPage />} />

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
            </Route>

            {/* ── Site Manager ou supérieur ── */}
            <Route element={<ManagerRoute />}>
              <Route path="/extraction"           element={<ExtractionPage />} />
              <Route path="/setup"                element={<SetupWizardPage />} />
              <Route path="/admin/periods"        element={<PeriodsPage />} />
              <Route path="/admin/projects"       element={<AdminProjectsPage />} />
              <Route path="/admin/kpi-thresholds" element={<KpiThresholdPage />} />
              <Route path="/admin/dashboards"     element={<DashboardsAdminPage />} />
               {/* [PHASE-1] Gestion d'équipe — vision centrée-développeur */}
              <Route path="/team"                 element={<TeamManagementPage />} />
              
              {/* [NEW][SENIOR] Dashboard de Pilotage — Comparaison Stratégique Sites/Équipes */}
              <Route path="/analytics/comparison" element={<ComparativeAnalyticsPage />} />
            </Route>


            {/* ── Super Admin uniquement ── */}
            <Route element={<SuperAdminRoute />}>
              <Route path="/admin/users"           element={<UsersPage />} />
              <Route path="/admin/gitlab-configs"  element={<GitLabConfigPage />} />
              <Route path="/admin/sites"           element={<SitesPage />} />
              <Route path="/admin/kpi-definitions" element={<KpiDefinitionsPage />} />
              <Route path="/admin/audit-log"       element={<AuditLogPage />} />
            </Route>

          </Route>
        </Route>

        {/* Fallback → Dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}
