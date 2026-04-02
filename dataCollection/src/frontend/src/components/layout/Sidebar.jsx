/**
 * components/layout/Sidebar.jsx
 * 
 * SENIOR RESTORATION: Reverting to official Template classes (app-menu, navbar-menu).
 * This ensures full compatibility with ThemeCustomizer.jsx (Dark/Light/Compact).
 */
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth, ROLES } from "../../context/AuthContext";

function MenuItem({ icon, label, children, to, badge }) {
  const location = useLocation();
  const isActive = to 
    ? location.pathname === to || location.pathname.startsWith(to + "/") 
    : children?.some(c => location.pathname === c.to || location.pathname.startsWith(c.to + "/"));
  
  const [open, setOpen] = useState(isActive && !!children);
  useEffect(() => { if (children && isActive) setOpen(true); }, [location.pathname, children, isActive]);

  if (!children) {
    return (
      <li className="nav-item">
        <Link className={`nav-link menu-link ${isActive ? 'active' : ''}`} to={to || "#"}>
          <i className={`${icon} me-2`} />
          <span data-key="t-widgets">{label}</span>
          {badge && <span className={`badge badge-pill bg-${badge.color} ms-auto`}>{badge.text}</span>}
        </Link>
      </li>
    );
  }

  return (
    <li className="nav-item">
      <Link 
        className={`nav-link menu-link ${isActive ? 'active' : ''}`} 
        to="#" 
        onClick={(e) => { e.preventDefault(); setOpen(!open); }} 
        data-bs-toggle="collapse"
        aria-expanded={open}
      >
        <i className={`${icon} me-2`} />
        <span>{label}</span>
      </Link>
      <div className={`collapse menu-dropdown ${open ? "show" : ""}`}>
        <ul className="nav nav-sm flex-column">
          {children.map((child, i) => {
            const childActive = location.pathname === child.to || location.pathname.startsWith(child.to + "/");
            return (
              <li className="nav-item" key={i}>
                <Link to={child.to} className={`nav-link ${childActive ? "active" : ""}`}>{child.label}</Link>
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const isAdmin = [ROLES.SUPER_ADMIN, ROLES.SITE_MANAGER, ROLES.TEAM_LEAD].includes(user?.role);
  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;

  return (
    <div className="app-menu navbar-menu">
      {/* LOGO SECTION */}
      <div className="navbar-brand-box">
        <Link to="/dashboard" className="logo logo-dark text-center py-4 d-block">
          <span className="logo-sm">
            <img src="/assets/images/telnet.png" alt="" height="22" />
          </span>
          <span className="logo-lg">
            <img src="/assets/images/telnet.png" alt="" height="30" />
          </span>
        </Link>
        <button type="button" className="btn btn-sm p-0 fs-20 header-item float-end btn-vertical-sm-hover" id="vertical-hover">
          <i className="ri-record-circle-line"></i>
        </button>
      </div>

      <div id="scrollbar">
        <div className="container-fluid">
          <ul className="navbar-nav" id="navbar-nav">
            
            <li className="menu-title"><span data-key="t-menu">Mission Control</span></li>
            <MenuItem icon="ri-dashboard-2-line" label="Dashboard KPI" to="/dashboard" />
            <MenuItem icon="ri-folder-add-line" label="Extractions" to="/projects" />
            <MenuItem icon="ri-team-line" label="Hub Développeurs" to="/developers" badge={{ color: "primary", text: "LIVE" }} />
            
            <li className="menu-title"><span data-key="t-apps">Data Intelligence</span></li>
            <MenuItem icon="ri-git-commit-line" label="Commits GitLab" to="/commits" />
            <MenuItem icon="ri-git-merge-line" label="Merge Requests" to="/merge" />
            <MenuItem icon="ri-bar-chart-grouped-line" label="Analyses Avancées" to="/kpi-analysis" />
            <MenuItem icon="ri-history-line" label="Registre des Lots" to="/extraction-lots" />
            <MenuItem icon="ri-alarm-warning-line" label="Alertes Système" to="/alerts" />

            {isAdmin && (
              <>
                <li className="menu-title"><span data-key="t-admin">Administration</span></li>
                <MenuItem icon="ri-database-2-line" label="Réseau & Projets" children={[
                  { to: "/extraction", label: "Runtime Engine" },
                  { to: "/admin/periods", label: "Gestion Périodes" },
                  { to: "/admin/projects", label: "Projets GitLab" },
                ]} />
                <MenuItem icon="ri-bar-chart-box-line" label="Configuration KPI" children={[
                  { to: "/admin/kpi-thresholds", label: "Seuils KPI" },
                  { to: "/admin/dashboards", label: "Dashboards Admin" },
                ]} />
                <MenuItem icon="ri-user-settings-line" label="Gestion RH Code" children={[
                  { to: "/admin/developers", label: "Validation Profils" },
                  { to: "/admin/developers/import", label: "Import en Masse" },
                ]} />
                {isSuperAdmin && (
                  <MenuItem icon="ri-shield-keyhole-line" label="Système" children={[
                    { to: "/admin/gitlab-configs", label: "GitLab Configs" },
                    { to: "/admin/sites", label: "Sites Telnet" },
                    { to: "/admin/kpi-definitions", label: "Définitions KPI" },
                    { to: "/admin/users", label: "Utilisateurs Panel" },
                    { to: "/admin/audit-log", label: "Logs d'Audit" },
                  ]} />
                )}
              </>
            )}
          </ul>
        </div>
      </div>

      <div className="sidebar-background"></div>
    </div>
  );
}
