/**
 * Topbar.jsx — TELNET HOLDING · Enterprise Precision v5
 *
 * Design reference : Vercel, Linear, Salesforce Lightning
 *
 * Principes :
 *   · Fond blanc (#fff) en light, #161B27 en dark — jamais de couleur vive
 *   · Hauteur fixe 56px — standard enterprise
 *   · Gauche : breadcrumb précis avec icône de page + séparateur fin
 *   · Centre : search bar fonctionnelle (sans décoration excessive)
 *   · Droite : actions groupées (theme, notifs) + avatar user propre
 *   · Dropdown profile : hiérarchie claire, actions accessibles
 *   · Bordure bottom fine rgba(0,0,0,.06) — subtile, pas criarde
 *   · Aucun logo dans la topbar — il est déjà dans la sidebar
 */
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// ─── CSS ──────────────────────────────────────────────────────────────────────
const TOPBAR_CSS = `
  :root {
    --tb-h:        56px;
    --tb-bg-light: #ffffff;
    --tb-bg-dark:  #161B27;
    --tb-border-l: rgba(0,0,0,.07);
    --tb-border-d: rgba(255,255,255,.06);
    --tb-text-l:   #111827;
    --tb-text-d:   rgba(255,255,255,.9);
    --tb-muted-l:  #6B7280;
    --tb-muted-d:  rgba(255,255,255,.4);
    --tb-blue:     #3B82F6;
    --tb-sans:     'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif;
    --tb-mono:     'JetBrains Mono', 'DM Mono', 'Courier New', monospace;
    --tb-ease:     cubic-bezier(.16,1,.3,1);
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
    padding: 0 24px 0 calc(240px + 24px);
    gap: 16px;
    z-index: 900;
    font-family: var(--tb-sans);
    -webkit-font-smoothing: antialiased;
    transition: background .2s, border-color .2s;
  }

  [data-bs-theme="dark"] #page-topbar.tb-shell {
    background: var(--tb-bg-dark);
    border-color: var(--tb-border-d);
  }

  /* Breadcrumb */
  .tb-bread {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .tb-bread-page {
    font-size: 14px;
    font-weight: 600;
    color: var(--tb-text-l);
    letter-spacing: -.01em;
  }
  [data-bs-theme="dark"] .tb-bread-page { color: var(--tb-text-d); }

  .tb-bread-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--tb-blue);
    flex-shrink: 0;
  }

  /* Search */
  .tb-search {
    flex: 1;
    max-width: 340px;
    position: relative;
    margin-left: 8px;
  }
  .tb-search-icon {
    position: absolute;
    left: 11px; top: 50%; transform: translateY(-50%);
    font-size: 14px;
    color: #9CA3AF;
    pointer-events: none;
  }
  .tb-search-input {
    width: 100%;
    height: 34px;
    padding: 0 12px 0 34px;
    background: #F3F4F6;
    border: 1px solid transparent;
    border-radius: 8px;
    font-family: var(--tb-sans);
    font-size: 13px;
    color: var(--tb-text-l);
    outline: none;
    transition: background .15s, border-color .15s, box-shadow .15s;
  }
  .tb-search-input::placeholder { color: #9CA3AF; }
  .tb-search-input:focus {
    background: #fff;
    border-color: rgba(59,130,246,.35);
    box-shadow: 0 0 0 3px rgba(59,130,246,.08);
  }
  [data-bs-theme="dark"] .tb-search-input {
    background: rgba(255,255,255,.05);
    color: rgba(255,255,255,.85);
    border-color: rgba(255,255,255,.06);
  }
  [data-bs-theme="dark"] .tb-search-input::placeholder { color: rgba(255,255,255,.25); }
  [data-bs-theme="dark"] .tb-search-input:focus {
    background: rgba(255,255,255,.08);
    border-color: rgba(59,130,246,.4);
    box-shadow: 0 0 0 3px rgba(59,130,246,.1);
  }
  .tb-search-kbd {
    position: absolute;
    right: 8px; top: 50%; transform: translateY(-50%);
    font-family: var(--tb-mono);
    font-size: 10px;
    color: #9CA3AF;
    background: #E5E7EB;
    padding: 1px 5px;
    border-radius: 4px;
    pointer-events: none;
  }
  [data-bs-theme="dark"] .tb-search-kbd { background: rgba(255,255,255,.1); color: rgba(255,255,255,.3); }

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
    border-color: rgba(255,255,255,.07);
    background: rgba(255,255,255,.04);
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
  [data-bs-theme="dark"] .tb-icon-btn:hover { background: rgba(255,255,255,.07); color: rgba(255,255,255,.85); }

  .tb-notif-badge {
    position: absolute;
    top: 6px; right: 6px;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #EF4444;
    border: 1.5px solid var(--tb-bg-light);
  }
  [data-bs-theme="dark"] .tb-notif-badge { border-color: var(--tb-bg-dark); }

  /* Divider */
  .tb-vdiv {
    width: 1px; height: 20px;
    background: #E5E7EB;
    flex-shrink: 0;
    margin: 0 4px;
  }
  [data-bs-theme="dark"] .tb-vdiv { background: rgba(255,255,255,.08); }

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
    border-color: rgba(255,255,255,.08);
  }
  [data-bs-theme="dark"] .tb-user-btn:hover {
    background: rgba(255,255,255,.05);
    border-color: rgba(255,255,255,.12);
  }

  .tb-avatar {
    width: 28px; height: 28px;
    border-radius: 7px;
    background: #1E40AF;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #fff;
    flex-shrink: 0;
    letter-spacing: .02em;
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
  [data-bs-theme="dark"] .tb-chevron { color: rgba(255,255,255,.3); }

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
    background: #1E2536;
    border-color: rgba(255,255,255,.08);
    box-shadow: 0 10px 40px rgba(0,0,0,.4);
  }

  .tb-dd-header {
    padding: 12px 14px;
    border-bottom: 1px solid #F3F4F6;
    background: #FAFAFA;
  }
  [data-bs-theme="dark"] .tb-dd-header {
    background: rgba(255,255,255,.03);
    border-color: rgba(255,255,255,.06);
  }
  .tb-dd-name { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 1px; }
  [data-bs-theme="dark"] .tb-dd-name { color: rgba(255,255,255,.88); }
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
  [data-bs-theme="dark"] .tb-dd-item { color: rgba(255,255,255,.65); }
  [data-bs-theme="dark"] .tb-dd-item:hover { background: rgba(255,255,255,.05); color: rgba(255,255,255,.88); }

  .tb-dd-item i { font-size: 15px; color: #6B7280; flex-shrink: 0; }
  [data-bs-theme="dark"] .tb-dd-item i { color: rgba(255,255,255,.35); }
  .tb-dd-item:hover i { color: var(--tb-blue); }

  .tb-dd-sep { height: 1px; background: #F3F4F6; margin: 4px 6px; }
  [data-bs-theme="dark"] .tb-dd-sep { background: rgba(255,255,255,.06); }

  .tb-dd-item.is-danger { color: #EF4444; }
  [data-bs-theme="dark"] .tb-dd-item.is-danger { color: #F87171; }
  .tb-dd-item.is-danger i { color: #EF4444; }
  .tb-dd-item.is-danger:hover { background: #FEF2F2; color: #DC2626; }
  [data-bs-theme="dark"] .tb-dd-item.is-danger:hover { background: rgba(239,68,68,.1); color: #FCA5A5; }
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
  "/":                         { label: "Dashboard",          icon: "ri-dashboard-3-line"     },
  "/dashboard":                { label: "Dashboard",          icon: "ri-dashboard-3-line"     },
  "/developers":               { label: "Hub Développeurs",   icon: "ri-code-s-slash-line"    },
  "/team":                     { label: "Gestion d'Équipe",   icon: "ri-team-line"            },
  "/merge":                    { label: "Merge Requests",     icon: "ri-git-merge-line"       },
  "/commits":                  { label: "Commits GitLab",     icon: "ri-git-commit-line"      },
  "/kpi-analysis":             { label: "Analyses KPI",       icon: "ri-line-chart-line"      },
  "/alerts":                   { label: "Alertes KPI",        icon: "ri-notification-3-line"  },
  "/extraction-lots":          { label: "Registre des Lots",  icon: "ri-database-2-line"      },
  "/extraction":               { label: "Moteur d'Extraction",icon: "ri-rocket-2-line"        },
  "/periods":                  { label: "Périodes",           icon: "ri-calendar-2-line"      },
  "/profile":                  { label: "Mon Profil",         icon: "ri-user-settings-line"   },
  "/admin/sites":              { label: "Sites Telnet",        icon: "ri-building-2-line"      },
  "/admin/projects":           { label: "Projets GitLab",     icon: "ri-folder-2-line"        },
  "/admin/gitlab-configs":     { label: "Configs GitLab",     icon: "ri-settings-3-line"      },
  "/admin/users":              { label: "Utilisateurs",       icon: "ri-group-line"           },
  "/admin/developers":         { label: "Validation Profils", icon: "ri-user-follow-line"     },
  "/admin/developers/import":  { label: "Import Développeurs",icon: "ri-upload-2-line"        },
  "/admin/audit-log":          { label: "Audit Log",          icon: "ri-shield-check-line"    },
  "/admin/kpi-definitions":    { label: "Définitions KPI",    icon: "ri-file-list-3-line"     },
  "/admin/kpi-thresholds":     { label: "Seuils KPI",         icon: "ri-alert-line"           },
  "/admin/dashboards":         { label: "Dashboards",         icon: "ri-layout-grid-line"     },
};

// ─── Main Topbar ──────────────────────────────────────────────────────────────
export default function Topbar() {
  injectTopbarCSS();
  const { logout, user } = useAuth();
  const { pathname } = useLocation();

  const [dark,     setDark]     = useState(() => document.documentElement.getAttribute("data-bs-theme") === "dark");
  const [ddOpen,   setDdOpen]   = useState(false);
  const [notifCnt] = useState(2);

  const ddRef = useRef(null);

  const userName    = user?.name  || "Utilisateur";
  const userEmail   = user?.email || "";
  const userRole    = (user?.role || "user").replace(/_/g, " ").toUpperCase();
  const initials    = userName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  // Current page label
  const matchKey   = Object.keys(LABELS).filter(k => pathname === k || pathname.startsWith(k + "/")).sort((a,b) => b.length - a.length)[0];
  const page       = LABELS[matchKey] || { label: "Dashboard", icon: "ri-dashboard-3-line" };

  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    setDark(!dark);
    document.documentElement.setAttribute("data-bs-theme", next);
    document.body.setAttribute("data-layout-mode", next);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => { if (ddRef.current && !ddRef.current.contains(e.target)) setDdOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header id="page-topbar" className="tb-shell">

      {/* Left: breadcrumb */}
      <div className="tb-bread">
        <div className="tb-bread-dot" />
        <span className="tb-bread-page">{page.label}</span>
      </div>

      {/* Center: search */}
      <div className="tb-search d-none d-md-block">
        <i className="ri-search-2-line tb-search-icon" />
        <input
          type="text"
          className="tb-search-input"
          placeholder="Rechercher un indicateur…"
        />
        <span className="tb-search-kbd d-none d-lg-block">⌘K</span>
      </div>

      <div className="tb-spacer" />

      {/* Right: action group */}
      <div className="tb-actions">
        <button className="tb-icon-btn" onClick={toggleTheme} title={dark ? "Mode clair" : "Mode sombre"}>
          <i className={dark ? "ri-sun-line" : "ri-moon-line"} />
        </button>
        <button className="tb-icon-btn" title="Notifications">
          <i className="ri-notification-3-line" />
          {notifCnt > 0 && <span className="tb-notif-badge" />}
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
              <Link to="/profile" className="tb-dd-item" onClick={() => setDdOpen(false)}>
                <i className="ri-user-settings-line" />
                <span>Mon Profil</span>
              </Link>
              <Link to="/dashboard" className="tb-dd-item" onClick={() => setDdOpen(false)}>
                <i className="ri-dashboard-2-line" />
                <span>Dashboard</span>
              </Link>
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