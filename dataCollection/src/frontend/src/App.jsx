import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

// Layout
import Sidebar from "./components/layout/Sidebar";
import Topbar  from "./components/layout/Topbar";
import Footer  from "./components/layout/Footer";

// ── pages/ (racine) ──────────────────────────────────────────────────────────
import Login          from "./pages/Login";
import DashboardKPI   from "./pages/DashboardKPI";
import ProjectsPage   from "./pages/ProjectsPage";
import CommitsPage    from "./pages/CommitsPage";
import MergePage      from "./pages/MergePage";
import ExtractionPage from "./pages/ExtractionPage";
import Profile        from "./pages/Profile";
import UsersPage      from "./pages/UsersPage";

// ── pages/admin/ ─────────────────────────────────────────────────────────────
import DevelopersPage       from "./pages/admin/DevelopersPage";
import PeriodsPage          from "./pages/admin/PeriodsPage";
import GitLabConfigPage     from "./pages/admin/GitLabConfigPage";
import DashboardsAdminPage  from "./pages/admin/DashboardsAdminPage";
import ExtractionLotsPage   from "./pages/admin/ExtractionLotsPage";
import AdminProjectsPage    from "./pages/admin/AdminProjectsPage";
import KpiThresholdPage     from "./pages/admin/KpiThresholdPage";

// ─── Layout wrapper ───────────────────────────────────────────────────────────
function AppLayout() {
  return (
    <div id="layout-wrapper">
      <Topbar />
      <Sidebar />
      <div className="main-content">
        <div className="page-content">
          <Outlet />
        </div>
        <Footer />
      </div>
    </div>
  );
}

// ─── Guard routes privées ─────────────────────────────────────────────────────
function PrivateRoute() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

// ─── Guard routes admin ───────────────────────────────────────────────────────
// [FIX] Utilise user.role depuis useAuth() au lieu de re-décoder le JWT
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

        {/* ── Privé ── */}
        <Route element={<PrivateRoute />}>
          <Route element={<AppLayout />}>

            {/* Pages utilisateur */}
            <Route path="/"           element={<DashboardKPI />} />
            <Route path="/dashboard"  element={<DashboardKPI />} />
            <Route path="/projects"   element={<ProjectsPage />} />
            <Route path="/commits"    element={<CommitsPage />} />
            <Route path="/merge"      element={<MergePage />} />
            <Route path="/profile"    element={<Profile />} />

            {/* ── Admin ── */}
            <Route element={<AdminRoute />}>
              <Route path="/admin/users"             element={<UsersPage />} />         {/* [FIX] cohérent avec Sidebar /admin/users */}
              <Route path="/developers"              element={<DevelopersPage />} />
              <Route path="/extraction"              element={<ExtractionPage />} />
              <Route path="/extraction-lots"         element={<ExtractionLotsPage />} />
              <Route path="/admin/periods"           element={<PeriodsPage />} />
              <Route path="/admin/gitlab-configs"    element={<GitLabConfigPage />} />
              <Route path="/admin/projects"          element={<AdminProjectsPage />} />
              <Route path="/admin/kpi-thresholds"    element={<KpiThresholdPage />} />
              <Route path="/admin/dashboards"        element={<DashboardsAdminPage />} />
            </Route>

          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}
