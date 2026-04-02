/**
 * components/layout/Topbar.jsx
 * 
 * SENIOR RESTORATION: Reverting to official Template classes (header, navbar-header).
 * Ensures full integration with Velzon professional styles and ThemeCustomizer.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// ─── Data ──────────────────────────────────────────────────────────────────
const ROUTE_LABELS = {
  "/":                       "Dashboard KPI",
  "/dashboard":              "Dashboard KPI",
  "/projects":               "Projets & Extractions",
  "/developers":             "Hub Développeurs",
  "/kpi-analysis":           "Analyses Avancées",
  "/extraction-lots":        "Registre des Lots",
  "/alerts":                 "Alertes Système",
};

export default function Topbar() {
  const { logout, user } = useAuth();
  const location = useLocation();
  const [dark, setDark] = useState(() => document.documentElement.getAttribute("data-bs-theme") === "dark");

  const userName  = user?.name || user?.email?.split("@")[0] || "Admin";
  const userRole  = user?.role || "user";

  const toggleTheme = () => {
    const newTheme = dark ? "light" : "dark";
    setDark(!dark);
    document.documentElement.setAttribute("data-bs-theme", newTheme);
    document.body.setAttribute("data-layout-mode", newTheme);
    
    // Sync with localSettings if exists
    const settings = JSON.parse(localStorage.getItem("vz-settings") || "{}");
    localStorage.setItem("vz-settings", JSON.stringify({ ...settings, theme: newTheme }));
  };

  return (
    <header id="page-topbar">
      <div className="layout-width">
        <div className="navbar-header">
          <div className="d-flex">
            {/* Mobile Burger (Native) */}
            <button type="button" className="btn btn-sm px-3 fs-16 header-item vertical-menu-btn topnav-hamburger shadow-none" id="topnav-hamburger-icon">
              <span className="hamburger-icon">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </button>

            {/* App Search (Professional Hud) */}
            <form className="app-search d-none d-md-block ms-4">
              <div className="position-relative">
                <input type="text" className="form-control border-0 bg-light-subtle" placeholder="Search Data Node..." autoComplete="off" />
                <span className="ri-search-line search-widget-icon" style={{ left: 14 }}></span>
              </div>
            </form>
          </div>

          <div className="d-flex align-items-center">
            
            {/* Theme Toggle */}
            <div className="ms-1 header-item d-none d-sm-flex">
              <button type="button" className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle shadow-none" onClick={toggleTheme}>
                <i className={dark ? "ri-sun-line fs-22" : "ri-moon-line fs-22"}></i>
              </button>
            </div>

            {/* Notifications */}
            <div className="dropdown topbar-head-dropdown ms-1 header-item">
              <button type="button" className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle shadow-none">
                <i className="ri-notification-3-line fs-22"></i>
                <span className="position-absolute topbar-badge fs-10 translate-middle badge rounded-pill bg-danger">1</span>
              </button>
            </div>

            {/* User Profile */}
            <div className="dropdown ms-sm-3 header-item topbar-user">
              <button type="button" className="btn shadow-none" id="page-header-user-dropdown" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                <span className="d-flex align-items-center">
                  <div className="avatar-xs">
                    <span className="avatar-title bg-primary-subtle text-primary rounded-circle fs-12 fw-bold text-uppercase">
                      {userName.charAt(0)}
                    </span>
                  </div>
                  <span className="text-start ms-xl-2">
                    <span className="d-none d-xl-inline-block ms-1 fw-bold user-name-text text-capitalize text-dark">{userName}</span>
                    <span className="d-none d-xl-block ms-1 fs-11 user-name-sub-text text-muted text-uppercase">{userRole}</span>
                  </span>
                </span>
              </button>
              <div className="dropdown-menu dropdown-menu-end">
                <h6 className="dropdown-header">Bienvenue {userName} !</h6>
                <Link className="dropdown-item" to="/profile">
                  <i className="ri-account-circle-line text-muted fs-16 align-middle me-1"></i> <span className="align-middle">Mon Profil</span>
                </Link>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item text-danger border-0 bg-transparent w-100 text-start" onClick={logout}>
                  <i className="ri-logout-box-r-line text-danger fs-16 align-middle me-1"></i> <span className="align-middle" data-key="t-logout">Déconnexion</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
