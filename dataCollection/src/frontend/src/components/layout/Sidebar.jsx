/**
 * components/layout/Sidebar.jsx
 *
 * CORRECTIONS :
 *   1. [NEW] Analyse KPI (/kpi-analysis) ajouté dans le menu principal
 *   2. Réorganisation en groupes logiques pour éviter la condensation :
 *      - "Menu" : Dashboard, Projets, Commits, MRs, Alertes
 *      - "Analyse" : Analyse KPI (nouveau), Développeurs
 *      - "Administration" : sections admin groupées en sous-menus
 *   3. Sous-menus admin regroupés pour réduire la hauteur totale :
 *      - Extraction (Run + Lots)
 *      - KPI (Thresholds + Definitions)
 *      - Gestion (Sites + Projets Admin + GitLab Configs)
 *      - Accès (Dashboards + Utilisateurs + Audit Log)
 */

import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// =============================================================================
// MenuItem
// =============================================================================
function MenuItem({ icon, label, children, to, badge }) {
  const location = useLocation();

  const isActive = to
    ? location.pathname === to || location.pathname.startsWith(to + "/")
    : children?.some(
        (c) =>
          location.pathname === c.to ||
          location.pathname.startsWith(c.to + "/")
      );

  const [open, setOpen] = useState(isActive && !!children);

  useEffect(() => {
    if (children && isActive) setOpen(true);
  }, [location.pathname, children, isActive]);

  // ── Lien simple ────────────────────────────────────────────────────────────
  if (!children) {
    return (
      <li className="nav-item">
        <Link
          className={`nav-link menu-link ${isActive ? "active" : ""}`}
          to={to || "#"}
        >
          {icon && <i className={icon}></i>}
          <span>{label}</span>
          {badge && (
            <span className={`badge badge-pill bg-${badge.color} ms-auto fs-10`}>
              {badge.text}
            </span>
          )}
        </Link>
      </li>
    );
  }

  // ── Lien avec sous-menu ────────────────────────────────────────────────────
  return (
    <li className="nav-item">
      <Link
        className={`nav-link menu-link ${isActive || open ? "active" : ""}`}
        to="#"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
      >
        {icon && <i className={icon}></i>}
        <span>{label}</span>
        {badge && (
          <span className={`badge badge-pill bg-${badge.color} ms-auto me-1 fs-10`}>
            {badge.text}
          </span>
        )}
        <i
          className="ri-arrow-right-s-line ms-auto"
          style={{
            transition: "transform .2s",
            transform:  open ? "rotate(90deg)" : "rotate(0deg)",
            fontSize:   16,
          }}
        />
      </Link>

      {(open || isActive) && (
        <div className="menu-dropdown show">
          <ul className="nav nav-sm flex-column">
            {children.map((child, i) => {
              const childActive =
                location.pathname === child.to ||
                location.pathname.startsWith(child.to + "/");
              return (
                <li className="nav-item" key={i}>
                  <Link
                    to={child.to}
                    className={`nav-link ${childActive ? "active" : ""}`}
                  >
                    {child.icon && <i className={`${child.icon} me-1`}></i>}
                    {child.label}
                    {child.badge && (
                      <span className={`badge bg-${child.badge.color} ms-auto fs-10`}>
                        {child.badge.text}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}

// =============================================================================
// MenuSection
// =============================================================================
function MenuSection({ icon, label }) {
  return (
    <li className="menu-title">
      {icon && <i className={icon}></i>}
      <span>{label}</span>
    </li>
  );
}

// =============================================================================
// Sidebar
// =============================================================================
export default function Sidebar() {
  const { user } = useAuth();
  const isAdmin  = user?.role === "admin";

  return (
    <div className="app-menu navbar-menu">

      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="navbar-brand-box">
        <Link to="/" className="logo logo-dark">
          <span className="logo-sm">
            <img src="/assets/images/telnet.png" alt="logo" height={22} />
          </span>
          <span className="logo-lg">
            <img src="/assets/images/telnet.png" alt="logo" height={17} />
          </span>
        </Link>
        <Link to="/" className="logo logo-light">
          <span className="logo-sm">
            <img src="/assets/images/telnet.png" alt="logo" height={32} />
          </span>
          <span className="logo-lg">
            <img src="/assets/images/telnet.png" alt="logo" height={32} />
          </span>
        </Link>
        <button
          type="button"
          className="btn btn-sm p-0 fs-20 header-item float-end btn-vertical-sm-hover"
          id="vertical-hover"
        >
          <i className="ri-record-circle-line"></i>
        </button>
      </div>

      {/* ── Scrollbar ────────────────────────────────────────────────────── */}
      <div id="scrollbar">
        <div className="container-fluid">
          <ul className="navbar-nav" id="navbar-nav">

            {/* ════ MENU PRINCIPAL ════════════════════════════════════════ */}
            <MenuSection label="Menu" />

            <MenuItem
              icon="ri-dashboard-2-line"
              label="Dashboard KPI"
              to="/"
            />

            <MenuItem
              icon="ri-folder-line"
              label="Projets"
              to="/projects"
            />

            <MenuItem
              icon="ri-git-commit-line"
              label="Commits"
              to="/commits"
            />

            <MenuItem
              icon="ri-git-merge-line"
              label="Merge Requests"
              to="/merge"
            />

            <MenuItem
              icon="ri-alarm-warning-line"
              label="Alertes KPI"
              to="/alerts"
            />

            {/* ════ ANALYSE ════════════════════════════════════════════════ */}
            <MenuSection label="Analyse" />

            {/* [NEW] Page d'analyse KPI interactive */}
            <MenuItem
              icon="ri-bar-chart-grouped-line"
              label="Analyse KPI"
              to="/kpi-analysis"
              badge={{ color: "success", text: "New" }}
            />

            <MenuItem
              icon="ri-team-line"
              label="Développeurs"
              to="/developers"
            />

            <MenuItem
              icon="ri-list-check"
              label="Extraction Lots"
              to="/extraction-lots"
            />

            {/* ════ ADMINISTRATION (admin uniquement) ═════════════════════ */}
            {isAdmin && (
              <>
                <MenuSection icon="ri-shield-line" label="Administration" />

                {/* Extraction */}
                <MenuItem
                  icon="ri-download-cloud-2-line"
                  label="Extraction"
                  children={[
                    {
                      to:    "/extraction",
                      label: "Run Extraction",
                      icon:  "ri-play-circle-line",
                    },
                    {
                      to:    "/admin/periods",
                      label: "Périodes",
                      icon:  "ri-calendar-2-line",
                    },
                  ]}
                />

                {/* KPI */}
                <MenuItem
                  icon="ri-bar-chart-grouped-line"
                  label="KPI"
                  children={[
                    {
                      to:    "/admin/kpi-thresholds",
                      label: "Seuils (Thresholds)",
                      icon:  "ri-alarm-warning-line",
                    },
                    {
                      to:    "/admin/kpi-definitions",
                      label: "Définitions",
                      icon:  "ri-book-open-line",
                    },
                  ]}
                />

                {/* Gestion des données */}
                <MenuItem
                  icon="ri-database-2-line"
                  label="Données"
                  children={[
                    {
                      to:    "/admin/sites",
                      label: "Sites",
                      icon:  "ri-map-pin-line",
                    },
                    {
                      to:    "/admin/projects",
                      label: "Projets",
                      icon:  "ri-git-repository-line",
                    },
                    {
                      to:    "/admin/gitlab-configs",
                      label: "GitLab Configs",
                      icon:  "ri-settings-4-line",
                    },
                  ]}
                />

                {/* Accès & utilisateurs */}
                <MenuItem
                  icon="ri-user-settings-line"
                  label="Accès & Users"
                  children={[
                    {
                      to:    "/admin/users",
                      label: "Utilisateurs",
                      icon:  "ri-user-line",
                    },
                    {
                      to:    "/admin/dashboards",
                      label: "Dashboards",
                      icon:  "ri-layout-grid-line",
                    },
                    {
                      to:    "/admin/audit-log",
                      label: "Audit Log",
                      icon:  "ri-file-list-3-line",
                    },
                  ]}
                />

              </>
            )}

          </ul>
        </div>
      </div>

      <div className="sidebar-background"></div>
    </div>
  );
}
