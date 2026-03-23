import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

// ── Layout ────────────────────────────────────────────────────────────────────
import Sidebar         from "./components/layout/Sidebar";
import Topbar          from "./components/layout/Topbar";
import Footer          from "./components/layout/Footer";
import ThemeCustomizer from "./components/layout/ThemeCustomizer";

// ── pages/ (racine) ──────────────────────────────────────────────────────────
import Login          from "./pages/Login";
import DashboardKPI   from "./pages/DashboardKPI";
import ProjectsPage   from "./pages/ProjectsPage";
import CommitsPage    from "./pages/CommitsPage";
import MergePage      from "./pages/MergePage";
import ExtractionPage from "./pages/ExtractionPage";
import Profile        from "./pages/Profile";
import UsersPage      from "./pages/UsersPage";
import AlertsPage     from "./pages/AlertsPage";

// [NEW] Page d'analyse KPI avec filtres par projet / site / développeur
import KpiAnalysisPage from "./pages/KpiAnalysisPage";

// ── pages/admin/ ─────────────────────────────────────────────────────────────
import DevelopersPage      from "./pages/admin/DevelopersPage";
import PeriodsPage         from "./pages/admin/PeriodsPage";
import GitLabConfigPage    from "./pages/admin/GitLabConfigPage";
import DashboardsAdminPage from "./pages/admin/DashboardsAdminPage";
import ExtractionLotsPage  from "./pages/admin/ExtractionLotsPage";
import AdminProjectsPage   from "./pages/admin/AdminProjectsPage";
import KpiThresholdPage    from "./pages/admin/KpiThresholdPage";
import SitesPage           from "./pages/admin/SitesPage";
import KpiDefinitionsPage  from "./pages/admin/KpiDefinitionsPage";
import AuditLogPage        from "./pages/admin/AuditLogPage";

// ─── Layout wrapper ───────────────────────────────────────────────────────────
function AppLayout() {
  return (
    <div id="layout-wrapper">
      <Topbar />
      <Sidebar />
      <div className="main-content">
        <Outlet />
        <Footer />
      </div>
      <ThemeCustomizer />
    </div>
  );
}

// ─── Guard routes privées ─────────────────────────────────────────────────────
function PrivateRoute() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

// ─── Guard routes admin ───────────────────────────────────────────────────────
function AdminRoute() {
  const { user } = useAuth();
  return user?.role === "admin" ? <Outlet /> : <Navigate to="/" replace />;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── Public ── */}
        <Route path="/login" element={<Login />} />

        {/* ── Privé (tout utilisateur connecté) ── */}
        <Route element={<PrivateRoute />}>
          <Route element={<AppLayout />}>

            {/* Pages utilisateur */}
            <Route path="/"          element={<DashboardKPI />} />
            <Route path="/dashboard" element={<DashboardKPI />} />
            <Route path="/projects"  element={<ProjectsPage />} />
            <Route path="/commits"   element={<CommitsPage />} />
            <Route path="/merge"     element={<MergePage />} />
            <Route path="/profile"   element={<Profile />} />
            <Route path="/alerts"    element={<AlertsPage />} />

            {/* [NEW] Analyse KPI interactive — accessible à tous les utilisateurs */}
            <Route path="/kpi-analysis" element={<KpiAnalysisPage />} />

            {/* Extraction Lots — lecture seule */}
            <Route path="/extraction-lots" element={<ExtractionLotsPage />} />

            {/* ── Admin uniquement ── */}
            <Route element={<AdminRoute />}>
              <Route path="/admin/users"           element={<UsersPage />} />
              <Route path="/developers"            element={<DevelopersPage />} />
              <Route path="/extraction"            element={<ExtractionPage />} />
              <Route path="/admin/periods"         element={<PeriodsPage />} />
              <Route path="/admin/gitlab-configs"  element={<GitLabConfigPage />} />
              <Route path="/admin/projects"        element={<AdminProjectsPage />} />
              <Route path="/admin/kpi-thresholds"  element={<KpiThresholdPage />} />
              <Route path="/admin/dashboards"      element={<DashboardsAdminPage />} />
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
