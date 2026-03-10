import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// ─── MenuItem ─────────────────────────────────────────────────────────────────
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
  }, [location.pathname]); // eslint-disable-line

  // Lien simple
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
            <span
              className={`badge badge-pill bg-${badge.color} ms-auto fs-10`}
            >
              {badge.text}
            </span>
          )}
        </Link>
      </li>
    );
  }

  // Lien avec sous-menu
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
        <i
          className="ri-arrow-right-s-line ms-auto"
          style={{
            transition:  "transform .2s",
            transform:   open ? "rotate(90deg)" : "rotate(0deg)",
            fontSize:    16,
          }}
        ></i>
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
                      <span
                        className={`badge bg-${child.badge.color} ms-auto fs-10`}
                      >
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

// ─── Séparateur de section ────────────────────────────────────────────────────
function MenuSection({ icon, label }) {
  return (
    <li className="menu-title">
      {icon && <i className={icon}></i>}
      <span>{label}</span>
    </li>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { user } = useAuth();
  const isAdmin  = user?.role === "admin";

  return (
    <div className="app-menu navbar-menu">

      {/* ── Logo ── */}
      <div className="navbar-brand-box">
        <Link to="/" className="logo logo-dark">
          <span className="logo-sm">
            <img src="/assets/images/logo-sm.png" alt="logo" height="22" />
          </span>
          <span className="logo-lg">
            <img src="/assets/images/logo-dark.png" alt="logo" height="17" />
          </span>
        </Link>
        <Link to="/" className="logo logo-light">
          <span className="logo-sm">
            <img src="/assets/images/logo-sm.png" alt="logo" height="22" />
          </span>
          <span className="logo-lg">
            <img src="/assets/images/logo-light.png" alt="logo" height="17" />
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

      {/* ── Scrollbar ── */}
      <div id="scrollbar">
        <div className="container-fluid">
          <ul className="navbar-nav" id="navbar-nav">

            {/* ════ MENU PRINCIPAL ════ */}
            <MenuSection label="Menu" />

            <MenuItem
              icon="ri-dashboard-2-line"
              label="Dashboard KPI"
              to="/"
            />

            <MenuItem
              icon="ri-folder-line"
              label="Projects"
              to="/projects"
            />

            <MenuItem
              icon="ri-git-commit-line"
              label="Commits"
              to="/commits"
            />

            {/* [FIX] Route corrigée : /merge (pas /merges) */}
            <MenuItem
              icon="ri-git-merge-line"
              label="Merge Requests"
              to="/merge"
            />

            <MenuItem
              icon="ri-team-line"
              label="Développeurs"
              to="/developers"
            />

            {/* ════ ADMINISTRATION ════ */}
            {isAdmin && (
              <>
                <MenuSection icon="ri-shield-line" label="Administration" />

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
                      to:    "/extraction-lots",
                      label: "Extraction Lots",
                      icon:  "ri-stack-line",
                    },
                  ]}
                />

                <MenuItem
                  icon="ri-calendar-2-line"
                  label="Periods"
                  to="/admin/periods"
                />

                <MenuItem
                  icon="ri-settings-4-line"
                  label="GitLab Configs"
                  to="/admin/gitlab-configs"
                />

                <MenuItem
                  icon="ri-git-repository-line"
                  label="Projects Admin"
                  to="/admin/projects"
                />

                {/* [NEW] KPI Thresholds — accès admin à la config des seuils */}
                <MenuItem
                  icon="ri-alarm-warning-line"
                  label="KPI Thresholds"
                  to="/admin/kpi-thresholds"
                  badge={{ color: "warning", text: "New" }}
                />

                <MenuItem
                  icon="ri-layout-grid-line"
                  label="Dashboards"
                  to="/admin/dashboards"
                />

                <MenuItem
                  icon="ri-user-settings-line"
                  label="User Management"
                  to="/admin/users"
                  badge={{ color: "danger", text: "Admin" }}
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
