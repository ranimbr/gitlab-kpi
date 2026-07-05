/**
 * Topbar.jsx — TELNET HOLDING · Enterprise Precision v6
 *
 * Design reference : Vercel, Linear, Salesforce Lightning
 *
 * Principes :
 *   · Fond blanc (#fff) en light, slate sombre aligné à la sidebar en dark
 *   · Hauteur fixe 56px — standard enterprise
 *   · Gauche : breadcrumb précis avec icône de page + séparateur fin
 *   · Décalage gauche synchronisé avec l'état (ouverte/repliée) de la sidebar
 *   · Droite : actions groupées (theme, notifs) + avatar user propre
 *   · Dropdown profile : hiérarchie claire, actions accessibles
 *   · Bordure bottom fine — subtile, pas criarde
 *   · Aucun logo dans la topbar — il est déjà dans la sidebar
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// ─── CSS ──────────────────────────────────────────────────────────────────────
const TOPBAR_CSS = `
  :root {
    --tb-h:            56px;
    --tb-sidebar-w:     220px;
    --tb-sidebar-w-collapsed: 72px;
    --tb-bg-light:      #ffffff;
    --tb-bg-dark:       #121A2B;
    --tb-border-l:      rgba(0,0,0,.07);
    --tb-border-d:      rgba(255,255,255,.07);
    --tb-text-l:        #111827;
    --tb-text-d:        rgba(255,255,255,.92);
    --tb-muted-l:       #6B7280;
    --tb-muted-d:       rgba(255,255,255,.4);
    --tb-blue:          #3B82F6;
    --tb-blue-soft:     #60A5FA;
    --tb-sans:          'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif;
    --tb-mono:          'JetBrains Mono', 'DM Mono', 'Courier New', monospace;
    --tb-ease:          cubic-bezier(.16,1,.3,1);
  }

  /* Shell */
  #page-topbar.tb-shell {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: var(--tb-h);
    background: var(--tb-bg-light);
    border-bottom: 1px solid var(--tb-border-l);
    display: flex;
    align-items: center;
    padding: 0 24px 0 calc(var(--tb-sidebar-w) + 24px);
    gap: 16px;
    z-index: 900;
    font-family: var(--tb-sans);
    -webkit-font-smoothing: antialiased;
    transition: background .2s, border-color .2s, padding-left .25s var(--tb-ease);
  }

  #page-topbar.tb-shell.is-sb-collapsed {
    padding-left: calc(var(--tb-sidebar-w-collapsed) + 24px);
  }

  @media (max-width: 1024px) {
    #page-topbar.tb-shell,
    #page-topbar.tb-shell.is-sb-collapsed {
      padding-left: 24px;
    }
  }

  [data-bs-theme="dark"] #page-topbar.tb-shell {
    background: var(--tb-bg-dark);
    border-color: var(--tb-border-d);
  }

  /* Breadcrumb */
  .tb-bread {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-shrink: 0;
    min-width: 0;
  }
  .tb-bread-icon {
    width: 26px; height: 26px;
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(59,130,246,.09);
    color: var(--tb-blue);
    font-size: 14px;
    flex-shrink: 0;
  }
  [data-bs-theme="dark"] .tb-bread-icon {
    background: rgba(59,130,246,.14);
    color: var(--tb-blue-soft);
  }
  .tb-bread-page {
    font-size: 14px;
    font-weight: 600;
    color: var(--tb-text-l);
    letter-spacing: -.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  [data-bs-theme="dark"] .tb-bread-page { color: var(--tb-text-d); }

  /* Spacer */
  .tb-spacer { flex: 1; }

  /* Action group */
  .tb-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
    border: 1px solid #E5E7EB;
    background: #F9FAFB;
  }
  [data-bs-theme="dark"] .tb-actions {
    border-color: rgba(255,255,255,.08);
    background: rgba(255,255,255,.035);
  }

  .tb-icon-btn {
    width: 32px; height: 32px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: #6B7280;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px;
    cursor: pointer;
    transition: background .14s, color .14s;
    position: relative;
  }
  .tb-icon-btn:hover { background: rgba(0,0,0,.05); color: #374151; }
  [data-bs-theme="dark"] .tb-icon-btn { color: rgba(255,255,255,.45); }
  [data-bs-theme="dark"] .tb-icon-btn:hover { background: rgba(255,255,255,.08); color: rgba(255,255,255,.9); }

  /* Divider */
  .tb-vdiv {
    width: 1px; height: 20px;
    background: #E5E7EB;
    flex-shrink: 0;
    margin: 0 4px;
  }
  [data-bs-theme="dark"] .tb-vdiv { background: rgba(255,255,255,.09); }

  /* User button */
  .tb-user-btn {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 5px 10px 5px 5px;
    border-radius: 10px;
    border: 1px solid #E5E7EB;
    background: transparent;
    cursor: pointer;
    transition: background .14s, border-color .14s;
  }
  .tb-user-btn:hover {
    background: #F3F4F6;
    border-color: #D1D5DB;
  }
  [data-bs-theme="dark"] .tb-user-btn {
    border-color: rgba(255,255,255,.09);
  }
  [data-bs-theme="dark"] .tb-user-btn:hover {
    background: rgba(255,255,255,.055);
    border-color: rgba(255,255,255,.14);
  }

  .tb-avatar {
    width: 28px; height: 28px;
    border-radius: 8px;
    background: linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #fff;
    flex-shrink: 0;
    letter-spacing: .02em;
    box-shadow: 0 2px 6px rgba(59,130,246,.35);
  }

  .tb-user-name {
    font-size: 13px; font-weight: 600;
    color: var(--tb-text-l);
    letter-spacing: -.01em;
    line-height: 1.2;
  }
  [data-bs-theme="dark"] .tb-user-name { color: var(--tb-text-d); }

  .tb-user-role {
    font-family: var(--tb-mono);
    font-size: 9px; font-weight: 500;
    color: var(--tb-muted-l);
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  [data-bs-theme="dark"] .tb-user-role { color: var(--tb-muted-d); }

  .tb-chevron {
    font-size: 14px;
    color: #9CA3AF;
    transition: transform .2s var(--tb-ease);
  }
  .tb-chevron.is-open { transform: rotate(180deg); }
  [data-bs-theme="dark"] .tb-chevron { color: rgba(255,255,255,.32); }

  /* Dropdown */
  .tb-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 220px;
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    box-shadow: 0 10px 36px rgba(0,0,0,.10), 0 2px 8px rgba(0,0,0,.06);
    overflow: hidden;
    z-index: 1100;
    animation: tb-dd-in .16s var(--tb-ease);
  }
  @keyframes tb-dd-in { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  [data-bs-theme="dark"] .tb-dropdown {
    background: #182036;
    border-color: rgba(255,255,255,.09);
    box-shadow: 0 10px 40px rgba(0,0,0,.45);
  }

  .tb-dd-header {
    padding: 12px 14px;
    border-bottom: 1px solid #F3F4F6;
    background: #FAFAFA;
  }
  [data-bs-theme="dark"] .tb-dd-header {
    background: rgba(255,255,255,.03);
    border-color: rgba(255,255,255,.07);
  }
  .tb-dd-name { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 1px; }
  [data-bs-theme="dark"] .tb-dd-name { color: rgba(255,255,255,.9); }
  .tb-dd-email { font-size: 11px; color: #6B7280; }
  [data-bs-theme="dark"] .tb-dd-email { color: rgba(255,255,255,.35); }

  .tb-dd-body { padding: 6px; }
  .tb-dd-item {
    display: flex; align-items: center; gap: 9px;
    padding: 8px 10px;
    border-radius: 8px;
    color: #374151;
    font-size: 13px; font-weight: 500;
    text-decoration: none;
    transition: background .12s;
    cursor: pointer;
    width: 100%; border: none; background: transparent; text-align: left;
  }
  .tb-dd-item:hover { background: #F3F4F6; color: #111827; }
  [data-bs-theme="dark"] .tb-dd-item { color: rgba(255,255,255,.68); }
  [data-bs-theme="dark"] .tb-dd-item:hover { background: rgba(255,255,255,.06); color: rgba(255,255,255,.9); }

  .tb-dd-item i { font-size: 15px; color: #6B7280; flex-shrink: 0; }
  [data-bs-theme="dark"] .tb-dd-item i { color: rgba(255,255,255,.38); }
  .tb-dd-item:hover i { color: var(--tb-blue); }

  .tb-dd-sep { height: 1px; background: #F3F4F6; margin: 4px 6px; }
  [data-bs-theme="dark"] .tb-dd-sep { background: rgba(255,255,255,.07); }

  .tb-dd-item.is-danger { color: #EF4444; }
  [data-bs-theme="dark"] .tb-dd-item.is-danger { color: #F87171; }
  .tb-dd-item.is-danger i { color: #EF4444; }
  .tb-dd-item.is-danger:hover { background: #FEF2F2; color: #DC2626; }
  [data-bs-theme="dark"] .tb-dd-item.is-danger:hover { background: rgba(239,68,68,.12); color: #FCA5A5; }

  /* DB Selector */
  .tb-db-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid #E5E7EB;
    background: #F9FAFB;
    cursor: pointer;
    transition: background .15s, border-color .15s;
    font-size: 13px;
    font-weight: 600;
    color: var(--tb-text-l);
  }
  .tb-db-btn:hover { background: #F3F4F6; border-color: #D1D5DB; }
  [data-bs-theme="dark"] .tb-db-btn {
    background: rgba(255,255,255,.03);
    border-color: rgba(255,255,255,.08);
    color: var(--tb-text-d);
  }
  [data-bs-theme="dark"] .tb-db-btn:hover {
    background: rgba(255,255,255,.065);
    border-color: rgba(255,255,255,.14);
  }
  .tb-db-btn i:first-child { color: var(--tb-blue); font-size: 15px; }
  [data-bs-theme="dark"] .tb-db-btn i:first-child { color: var(--tb-blue-soft); }

  .tb-db-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: 260px;
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,.08);
    overflow: hidden;
    z-index: 1100;
    animation: tb-dd-in .16s var(--tb-ease);
  }
  [data-bs-theme="dark"] .tb-db-dropdown {
    background: #182036;
    border-color: rgba(255,255,255,.09);
    box-shadow: 0 10px 30px rgba(0,0,0,.45);
  }
  .tb-db-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px;
    border: none; width: 100%; background: transparent; text-align: left;
    color: #374151; font-size: 13px; font-weight: 500;
    cursor: pointer; transition: background .12s;
  }
  .tb-db-item:hover { background: #F9FAFB; color: #111827; }
  [data-bs-theme="dark"] .tb-db-item { color: rgba(255,255,255,.72); }
  [data-bs-theme="dark"] .tb-db-item:hover { background: rgba(255,255,255,.045); color: rgba(255,255,255,.92); }
  .tb-db-item-left { display: flex; align-items: center; gap: 8px; }
  .tb-db-item-left i { color: #9CA3AF; font-size: 15px; }
  .tb-db-item.is-active { background: #EFF6FF; color: var(--tb-blue); }
  .tb-db-item.is-active .tb-db-item-left i { color: var(--tb-blue); }
  [data-bs-theme="dark"] .tb-db-item.is-active { background: rgba(59,130,246,.12); color: #60A5FA; }
  [data-bs-theme="dark"] .tb-db-item.is-active .tb-db-item-left i { color: #60A5FA; }
  .tb-db-check { color: var(--tb-blue); font-size: 16px; opacity: 0; }
  .tb-db-item.is-active .tb-db-check { opacity: 1; }
`;

let tbCssInjected = false;
function injectTopbarCSS() {
  if (tbCssInjected) return;
  tbCssInjected = true;
  const el = document.createElement("style");
  el.textContent = TOPBAR_CSS;
  document.head.appendChild(el);
}

// ─── Route labels ─────────────────────────────────────────────────────────────
const LABELS = {
  "/": { label: "Dashboard", icon: "ri-dashboard-3-line" },
  "/dashboard": { label: "Dashboard", icon: "ri-dashboard-3-line" },
  "/analytics/comparison": { label: "Tableau de bord", icon: "ri-pie-chart-2-line" },
  "/developers": { label: "Hub Développeurs", icon: "ri-code-s-slash-line" },
  "/team": { label: "Gestion d'Équipe", icon: "ri-team-line" },
  "/merge": { label: "Merge Requests", icon: "ri-git-merge-line" },
  "/commits": { label: "Commits GitLab", icon: "ri-git-commit-line" },
  "/extraction-lots": { label: "Registre des Lots", icon: "ri-database-2-line" },
  "/extraction": { label: "Moteur d'Extraction", icon: "ri-rocket-2-line" },
  "/periods": { label: "Périodes", icon: "ri-calendar-2-line" },
  "/profile": { label: "Mon Profil", icon: "ri-user-settings-line" },
  "/admin/sites": { label: "Sites", icon: "ri-building-2-line" },
  "/admin/projects": { label: "Projets GitLab", icon: "ri-folder-2-line" },
  "/admin/gitlab-configs": { label: "Configs GitLab", icon: "ri-settings-3-line" },
  "/admin/users": { label: "Utilisateurs", icon: "ri-group-line" },
  "/admin/developers": { label: "Validation Profils", icon: "ri-user-follow-line" },
  "/admin/developers/import": { label: "Import Développeurs", icon: "ri-upload-2-line" },
  "/admin/audit-log": { label: "Audit Log", icon: "ri-shield-check-line" },
  "/admin/kpi-definitions": { label: "Définitions KPI", icon: "ri-file-list-3-line" },
  "/admin/kpi-thresholds": { label: "Seuils KPI", icon: "ri-alert-line" },
  "/admin/dashboards": { label: "Dashboards", icon: "ri-layout-grid-line" },
  "/admin/profiles": { label: "Profils & Menu", icon: "ri-user-settings-line" },
  "/admin/scheduler": { label: "Scheduler Admin", icon: "ri-time-line" },
};

// ─── Main Topbar ──────────────────────────────────────────────────────────────
export default function Topbar() {
  injectTopbarCSS();
  const { logout, user } = useAuth();
  const { pathname } = useLocation();

  const [dark, setDark] = useState(() => document.documentElement.getAttribute("data-bs-theme") === "dark");
  const [ddOpen, setDdOpen] = useState(false);
  const [dbDdOpen, setDbDdOpen] = useState(false);
  const [sbCollapsed, setSbCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  const ddRef = useRef(null);
  const dbDdRef = useRef(null);

  const [database, setDatabase] = useState(() => localStorage.getItem("selected_database") || "gitlab_kpi1");

  const handleDbChange = (nextDb) => {
    setDatabase(nextDb);
    localStorage.setItem("selected_database", nextDb);
    // Recharger la page pour charger les données de la nouvelle base
    // Petit délai pour s'assurer que localStorage est écrit
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  const userName = user?.name || "Utilisateur";
  const userEmail = user?.email || "";
  const userRole = (user?.role || "user").replace(/_/g, " ").toUpperCase();
  const initials = userName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  // Current page label
  const matchKey = Object.keys(LABELS).filter(k => pathname === k || pathname.startsWith(k + "/")).sort((a, b) => b.length - a.length)[0];
  const page = LABELS[matchKey] || { label: "Dashboard", icon: "ri-dashboard-3-line" };

  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    setDark(!dark);
    document.documentElement.setAttribute("data-bs-theme", next);
    document.body.setAttribute("data-layout-mode", next);
  };

  // Rester synchro avec l'état replié/déplié de la sidebar
  useEffect(() => {
    const onToggle = (e) => setSbCollapsed(!!e.detail);
    window.addEventListener("sidebar-toggle", onToggle);
    return () => window.removeEventListener("sidebar-toggle", onToggle);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (ddRef.current && !ddRef.current.contains(e.target)) setDdOpen(false);
      if (dbDdRef.current && !dbDdRef.current.contains(e.target)) setDbDdOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header id="page-topbar" className={`tb-shell ${sbCollapsed ? "is-sb-collapsed" : ""}`}>

      {/* Left: breadcrumb */}
      <div className="tb-bread">
        <div className="tb-bread-icon">
          <i className={page.icon} />
        </div>
        <span className="tb-bread-page">{page.label}</span>
      </div>

      <div className="tb-spacer" />

      {/* Database Switcher */}
      <div className="position-relative" ref={dbDdRef} style={{ marginRight: 8 }}>
        <button className="tb-db-btn" onClick={() => setDbDdOpen(v => !v)}>
          <i className="ri-database-2-line" />
          <span>{database === "gitlab_kpi1" ? "Base Principale" : "Base Test"}</span>
          <i className={`ri-arrow-down-s-line tb-chevron ${dbDdOpen ? "is-open" : ""}`} />
        </button>

        {dbDdOpen && (
          <div className="tb-db-dropdown">
            <button
              className={`tb-db-item ${database === "gitlab_kpi1" ? "is-active" : ""}`}
              onClick={() => { setDbDdOpen(false); handleDbChange("gitlab_kpi1"); }}
            >
              <div className="tb-db-item-left">
                <i className="ri-database-2-line" />
                <span>Base Principale (gitlab_kpi1)</span>
              </div>
              <i className="ri-check-line tb-db-check" />
            </button>
            <button
              className={`tb-db-item ${database === "telnetdb" ? "is-active" : ""}`}
              onClick={() => { setDbDdOpen(false); handleDbChange("telnetdb"); }}
            >
              <div className="tb-db-item-left">
                <i className="ri-test-tube-line" />
                <span>Base Test (telnetdb)</span>
              </div>
              <i className="ri-check-line tb-db-check" />
            </button>
          </div>
        )}
      </div>

      {/* Right: action group */}
      <div className="tb-actions">
        <button className="tb-icon-btn" onClick={toggleTheme} title={dark ? "Mode clair" : "Mode sombre"}>
          <i className={dark ? "ri-sun-line" : "ri-moon-line"} />
        </button>
      </div>

      <div className="tb-vdiv" />

      {/* User */}
      <div className="position-relative" ref={ddRef}>
        <button className="tb-user-btn" onClick={() => setDdOpen(v => !v)}>
          <div className="tb-avatar">{initials}</div>
          <div className="text-start d-none d-sm-block">
            <div className="tb-user-name">{userName}</div>
            <div className="tb-user-role">{userRole}</div>
          </div>
          <i className={`ri-arrow-down-s-line tb-chevron ${ddOpen ? "is-open" : ""}`} />
        </button>

        {ddOpen && (
          <div className="tb-dropdown">
            <div className="tb-dd-header">
              <div className="tb-dd-name">{userName}</div>
              <div className="tb-dd-email">{userEmail || "Session active"}</div>
            </div>
            <div className="tb-dd-body">
              <div className="tb-dd-sep" />
              <button className="tb-dd-item is-danger" onClick={() => { setDdOpen(false); logout(); }}>
                <i className="ri-logout-box-r-line" />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}