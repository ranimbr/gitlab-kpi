/**
 * Sidebar.jsx — TELNET HOLDING · Enterprise Precision v6
 *
 * Design reference : Linear, Vercel Dashboard, Salesforce Lightning
 *
 * Principes :
 *   · Fond deep slate #0B111D → #131B2C — sombre, sobre, sans bleu criard
 *   · Texte & icônes en niveaux de blanc transparent (cohérent sur fond sombre)
 *   · État actif : fond bleu tamisé + barre latérale #3B82F6 2px + glow discret
 *   · Section headers en JetBrains Mono 9.5px uppercase 0.16em tracking
 *   · Logo Telnet dans un container propre avec léger halo
 *   · Sous-menus avec indent visuel précis et fil vertical
 *   · Séparateurs fins entre sections
 *   · Footer système : dot vert pulsant + statut + version
 */
import React, { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth, ROLES } from "../../context/AuthContext";
import profileService from "../../services/profileService";

// ─── CSS injecté une seule fois ───────────────────────────────────────────────
const SIDEBAR_CSS = `
  :root {
    --sb-bg-top:     #101827;
    --sb-bg-bottom:  #0B111D;
    --sb-bg-gradient: linear-gradient(180deg, var(--sb-bg-top) 0%, var(--sb-bg-bottom) 100%);
    --sb-border:     rgba(255,255,255,.08);
    --sb-border-strong: rgba(255,255,255,.14);

    --sb-text:       rgba(255,255,255,.58);
    --sb-text-h:     rgba(255,255,255,.96);
    --sb-text-dim:   rgba(255,255,255,.38);
    --sb-text-faint: rgba(255,255,255,.28);

    --sb-accent:     #3B82F6;
    --sb-accent-soft:#60A5FA;
    --sb-active-bg:  linear-gradient(135deg, rgba(59,130,246,.16) 0%, rgba(59,130,246,.05) 100%);
    --sb-active-bar: linear-gradient(180deg, #3B82F6 0%, #60A5FA 100%);
    --sb-hover-bg:   rgba(255,255,255,.045);

    --sb-icon:       rgba(255,255,255,.5);
    --sb-section:    rgba(255,255,255,.32);

    --sb-mono:       'JetBrains Mono', 'DM Mono', 'Courier New', monospace;
    --sb-sans:       'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif;
    --sb-ease:       cubic-bezier(.16,1,.3,1);
    --sb-shadow:     0 12px 32px -12px rgba(0,0,0,.6);
  }

  /* Shell — Fixed & Absolute Corner */
  .sb-shell {
    position: fixed;
    top: 0 !important;
    left: 0 !important;
    bottom: 0 !important;
    width: 220px;
    background: var(--sb-bg-gradient);
    border-right: 1px solid var(--sb-border);
    display: flex;
    flex-direction: column;
    padding: 0;
    z-index: 1005;
    font-family: var(--sb-sans);
    -webkit-font-smoothing: antialiased;
    transition: transform var(--sb-ease), width var(--sb-ease);
    box-shadow: var(--sb-shadow);
  }

  /* Brand Header — Enterprise Monolith */
  .sb-brand {
    height: 58px;
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 14px;
    background: linear-gradient(180deg, rgba(255,255,255,.035) 0%, rgba(255,255,255,.01) 100%);
    border-bottom: 1px solid var(--sb-border);
    text-decoration: none;
    flex-shrink: 0;
    position: relative;
  }
  .sb-brand::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.12) 50%, transparent 100%);
  }

  .sb-logo-box {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .sb-brand-img-wrap {
    width: 34px; height: 34px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    background: rgba(255,255,255,.04);
    border-radius: 10px;
    border: 1px solid var(--sb-border-strong);
  }
  .sb-brand-name {
    font-size: 15px; font-weight: 800;
    color: var(--sb-text-h);
    letter-spacing: 0.08em;
    text-transform: uppercase; line-height: 1.1;
    display: flex; flex-direction: column;
    white-space: nowrap;
  }
  .sb-brand-sub {
    font-family: var(--sb-mono);
    font-size: 8px; font-weight: 600;
    color: #38BDF8;
    letter-spacing: .32em; margin-top: 5px;
    opacity: .85;
  }

  /* Navigation — Flexible Layer */
  .sb-nav-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Scroll area */
  .sb-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 14px 24px;
  }
  .sb-scroll::-webkit-scrollbar { width: 4px; }
  .sb-scroll::-webkit-scrollbar-track { background: transparent; }
  .sb-scroll::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,.12);
    border-radius: 99px;
    transition: background .2s;
  }
  .sb-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.22); }

  /* Section header */
  .sb-section + .sb-section { margin-top: 18px; }
  .sb-section-hd {
    font-family: var(--sb-mono);
    font-size: 9.5px; font-weight: 700;
    color: var(--sb-section);
    letter-spacing: .16em; text-transform: uppercase;
    padding: 6px 10px 9px;
    display: block;
  }

  /* Nav item — base */
  .sb-item {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 9px 10px;
    border-radius: 7px;
    color: var(--sb-text);
    text-decoration: none;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    background: transparent;
    width: 100%;
    text-align: left;
    transition: background .16s var(--sb-ease), color .16s var(--sb-ease), border-color .16s var(--sb-ease);
    position: relative;
    line-height: 1.4;
    user-select: none;
  }
  .sb-item i.sb-icon {
    font-size: 15px;
    color: var(--sb-icon);
    flex-shrink: 0;
    width: 18px;
    text-align: center;
    transition: color .16s var(--sb-ease);
  }
  .sb-item:hover {
    background: var(--sb-hover-bg);
    color: var(--sb-text-h);
    border-color: var(--sb-border);
  }
  .sb-item:hover i.sb-icon {
    color: rgba(255,255,255,.85);
  }

  /* Active */
  .sb-item.is-active {
    background: var(--sb-active-bg);
    color: #EAF2FF;
    border-color: rgba(59,130,246,.28);
  }
  .sb-item.is-active i.sb-icon {
    color: var(--sb-accent-soft);
  }
  .sb-item.is-active::before {
    content: '';
    position: absolute;
    left: -14px; top: 7px; bottom: 7px;
    width: 2px;
    background: var(--sb-active-bar);
    border-radius: 0 3px 3px 0;
    box-shadow: 0 0 10px rgba(59,130,246,.55);
  }

  /* Chevron */
  .sb-chevron {
    font-size: 16px;
    color: var(--sb-text-faint);
    margin-left: auto;
    flex-shrink: 0;
    transition: transform .25s var(--sb-ease), color .2s;
  }
  .sb-chevron.is-open { transform: rotate(90deg); color: var(--sb-text-dim); }

  /* Badge */
  .sb-badge {
    font-family: var(--sb-mono);
    font-size: 9.5px; font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    background: rgba(34,197,94,.12);
    color: #4ADE80;
    letter-spacing: .08em;
    flex-shrink: 0;
    margin-left: auto;
    border: 1px solid rgba(34,197,94,.22);
  }

  /* Sub-menu */
  .sb-sub {
    margin: 2px 0 6px 27px;
    border-left: 1px solid var(--sb-border);
    padding-left: 12px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .sb-sub-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 6px;
    color: var(--sb-text-dim);
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
    transition: background .16s var(--sb-ease), color .16s var(--sb-ease);
    position: relative;
  }
  .sb-sub-item:hover {
    background: var(--sb-hover-bg);
    color: var(--sb-text-h);
  }
  .sb-sub-item.is-active {
    color: var(--sb-accent-soft);
    background: rgba(59,130,246,.08);
    font-weight: 600;
  }
  .sb-sub-item.is-active::before {
    content: '';
    position: absolute; left: -13px; top: 50%; transform: translateY(-50%);
    width: 2px; height: 14px;
    background: var(--sb-active-bar);
    border-radius: 2px;
    box-shadow: 0 0 8px rgba(59,130,246,.5);
  }

  /* Responsive collapse */
  @media (max-width: 1024px) {
    .sb-shell { transform: translateX(-100%); transition: transform .3s var(--sb-ease); }
    .sb-shell.is-open { transform: translateX(0); }
  }

  /* Collapsed mode (icon-only) */
  .sb-shell.is-collapsed {
    width: 72px;
  }
  .sb-shell.is-collapsed .sb-brand {
    padding: 0;
    justify-content: center;
  }
  .sb-shell.is-collapsed .sb-brand-name {
    display: none;
  }
  .sb-shell.is-collapsed .sb-logo-box {
    gap: 0;
  }
  .sb-shell.is-collapsed .sb-scroll {
    padding: 16px 10px 24px;
  }
  .sb-shell.is-collapsed .sb-section-hd {
    display: none;
  }
  .sb-shell.is-collapsed .sb-item {
    padding: 11px;
    justify-content: center;
  }
  .sb-shell.is-collapsed .sb-item span:not([class*="sb-icon"]) {
    display: none;
  }
  .sb-shell.is-collapsed .sb-item .sb-badge {
    display: none;
  }
  .sb-shell.is-collapsed .sb-item .sb-chevron {
    display: none;
  }
  .sb-shell.is-collapsed .sb-item i.sb-icon {
    margin: 0;
  }
  .sb-shell.is-collapsed .sb-sub {
    display: none;
  }
  .sb-shell.is-collapsed .sb-divider {
    margin: 8px 14px;
  }
  .sb-shell.is-collapsed .sb-footer {
    padding: 14px 10px;
    justify-content: center;
  }
  .sb-shell.is-collapsed .sb-footer-txt,
  .sb-shell.is-collapsed .sb-footer-ver {
    display: none;
  }
  .sb-shell.is-collapsed .sb-footer-dot {
    margin: 0;
  }

  /* Toggle button */
  .sb-toggle-btn {
    position: absolute;
    right: -13px;
    top: 50%;
    transform: translateY(-50%);
    width: 26px;
    height: 26px;
    background: var(--sb-bg-top);
    border: 1px solid var(--sb-border-strong);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--sb-text);
    transition: background .18s var(--sb-ease), color .18s var(--sb-ease), border-color .18s var(--sb-ease);
    z-index: 10;
    box-shadow: 0 4px 14px rgba(0,0,0,.45);
  }
  .sb-toggle-btn:hover {
    background: rgba(255,255,255,.08);
    color: #fff;
    border-color: rgba(255,255,255,.24);
  }
  .sb-shell.is-collapsed .sb-toggle-btn {
    right: -13px;
  }

  /* Divider */
  .sb-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.09) 50%, transparent 100%);
    margin: 8px 10px;
  }

  /* Footer */
  .sb-footer {
    padding: 13px 18px;
    border-top: 1px solid var(--sb-border);
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    background: linear-gradient(180deg, rgba(255,255,255,.015) 0%, rgba(0,0,0,.08) 100%);
  }
  .sb-footer-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #22C55E;
    flex-shrink: 0;
    box-shadow: 0 0 0 3px rgba(34,197,94,.2), 0 0 10px rgba(34,197,94,.45);
    animation: sb-pulse 2.5s ease-in-out infinite;
  }
  @keyframes sb-pulse {
    0%,100% { box-shadow: 0 0 0 3px rgba(34,197,94,.2), 0 0 10px rgba(34,197,94,.45); }
    50%      { box-shadow: 0 0 0 5px rgba(34,197,94,.1), 0 0 14px rgba(34,197,94,.3); }
  }
  .sb-footer-txt {
    font-family: var(--sb-mono);
    font-size: 10.5px; color: var(--sb-text-dim);
    letter-spacing: .05em;
    font-weight: 500;
  }
  .sb-footer-ver {
    margin-left: auto;
    font-family: var(--sb-mono);
    font-size: 9.5px;
    color: var(--sb-text-faint);
    letter-spacing: .06em;
    font-weight: 600;
  }
`;

// ─── Logo Component (Premium Industrial Vector) ───────────────────────────
function TelnetSymbol() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{filter:'drop-shadow(0 0 8px rgba(0,209,255,0.35))'}}>
      <defs>
        <linearGradient id="sphereGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E5E7EB" />
          <stop offset="45%" stopColor="#9CA3AF" />
          <stop offset="100%" stopColor="#374151" />
        </linearGradient>
        <filter id="innerGlow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <circle cx="16" cy="16" r="14" fill="url(#sphereGrad)" />
      <path d="M5 21Q16 13 27 21" stroke="white" strokeWidth="0.8" strokeOpacity="0.6" fill="none" />
      <path d="M8 25Q16 19 24 25" stroke="white" strokeWidth="0.8" strokeOpacity="0.4" fill="none" />
      <path d="M12 29Q16 26 20 29" stroke="white" strokeWidth="0.8" strokeOpacity="0.2" fill="none" />
      <path d="M14 2L28 2L16 14Z" fill="#00D1FF" filter="url(#innerGlow)" />
      <circle cx="16" cy="16" r="14" stroke="white" strokeWidth="0.5" strokeOpacity="0.15" fill="none" />
    </svg>
  );
}

let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const el = document.createElement("style");
  el.textContent = SIDEBAR_CSS;
  document.head.appendChild(el);
}

// ─── Sub-item ─────────────────────────────────────────────────────────────────
function SubItem({ to, label }) {
  const { pathname } = useLocation();
  if (!to) return null;
  const active = pathname === to || pathname.startsWith(to + "/");
  return (
    <Link to={to} className={`sb-sub-item ${active ? "is-active" : ""}`}>
      {label}
    </Link>
  );
}

// ── Nav Item ─────────────────────────────────────────────────────────────────
function NavItem({ icon, label, to, badge, children, accessible = true, isCollapsed = false }) {
  const { pathname } = useLocation();
  const isActive =
    accessible &&
    (to
      ? pathname === to || pathname.startsWith(to + "/")
      : children?.some((c) => c.to && (pathname === c.to || pathname.startsWith(c.to + "/"))));

  const [open, setOpen] = useState(isActive && !!children);

  useEffect(() => {
    if (children && isActive && !open) setOpen(true);
  }, [pathname]);

  if (!children) {
    return (
      <Link
        to={to || "#"}
        className={`sb-item ${isActive ? "is-active" : ""}`}
        style={{ opacity: accessible ? 1 : 0.5, pointerEvents: accessible ? "auto" : "none" }}
        title={isCollapsed ? label : undefined}
      >
        <i className={`${icon} sb-icon`} />
        <span style={{ flex: 1 }}>{label}</span>
        {badge && <span className="sb-badge">{badge}</span>}
      </Link>
    );
  }

  return (
    <>
      <button
        className={`sb-item ${isActive ? "is-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        style={{ opacity: accessible ? 1 : 0.5 }}
        title={isCollapsed ? label : undefined}
      >
        <i className={`${icon} sb-icon`} />
        <span style={{ flex: 1 }}>{label}</span>
        <i className={`ri-arrow-right-s-line sb-chevron ${open ? "is-open" : ""}`} />
      </button>
      {open && (
        <div className="sb-sub">
          {children.map((c, i) => (
            <SubItem key={i} {...c} accessible={accessible} />
          ))}
        </div>
      )}
    </>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────
function Section({ title, children, accessible = true, isCollapsed = false }) {
  return (
    <div className="sb-section" style={{ display: accessible ? "block" : "none" }}>
      <span className="sb-section-hd">{title}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {typeof children === 'function' ? children(isCollapsed) : children}
      </div>
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
export default function Sidebar() {
  injectCSS();
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.SUPER_ADMIN || user?.role === ROLES.SITE_MANAGER;
  const isLead  = user?.role === ROLES.TEAM_LEAD;
  const isProjectManager = user?.role === ROLES.PROJECT_MANAGER;
  const isViewer = user?.role === ROLES.VIEWER;
  const [menuItems, setMenuItems] = useState([]);
  const [, setLoadingMenus] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('sidebar-collapsed', String(newValue));
      window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: newValue }));
      return newValue;
    });
  };

  const location = useLocation();

  useEffect(() => {
    if (user) {
      loadAccessibleMenus();
    }
  // Recharger les menus à chaque changement de route ET de user
  // (permet la mise à jour sans reconnexion après modification des droits)
  }, [user, location.pathname]);

  const loadAccessibleMenus = useCallback(async () => {
    try {
      setLoadingMenus(true);
      const data = await profileService.getActiveMenuItems();
      setMenuItems(data);
    } catch (err) {
      console.error("Erreur chargement menus:", err);
      setMenuItems([]);
    } finally {
      setLoadingMenus(false);
    }
  }, [user]);

  const isMenuAccessible = (route) => {
    if (!route) return false;
    return menuItems.some(menu => menu.route === route);
  };

  return (
    <aside className={`sb-shell ${isCollapsed ? 'is-collapsed' : ''}`}>
      {/* Toggle Button */}
      <button className="sb-toggle-btn" onClick={toggleCollapse} title={isCollapsed ? "Déplier la sidebar" : "Replier la sidebar"}>
        <i className={`ri-arrow-${isCollapsed ? 'right' : 'left'}-s-line`} />
      </button>

      {/* Brand Header — Elite Corner (Monolith) */}
      <div className="sb-brand">
        <div className="sb-logo-box">
          <div className="sb-brand-img-wrap">
            <TelnetSymbol />
          </div>
          <div className="sb-brand-name">
            <span>TELNET</span>
            <span className="sb-brand-sub">HOLDING</span>
          </div>
        </div>
      </div>

      {/* Navigation Layer — Pro Scroll */}
      <div className="sb-nav-container">
        <div className="sb-scroll">
          <Section title="Pilotage" isCollapsed={isCollapsed}>
            <NavItem icon="ri-pie-chart-2-line" label="Tableau de bord" to={`/analytics/comparison${localStorage.getItem("last_project_id") ? `?project_id=${localStorage.getItem("last_project_id")}` : ""}`} accessible={isMenuAccessible("/analytics/comparison")} isCollapsed={isCollapsed} />
            <NavItem icon="ri-code-s-slash-line"     label="Hub Développeurs"    to="/developers" accessible={isMenuAccessible("/developers")} isCollapsed={isCollapsed} />
          </Section>

          <div className="sb-divider" />

          <Section title="Activité Code" isCollapsed={isCollapsed}>
            <NavItem icon="ri-git-merge-line"        label="Merge Requests"      to={`/merge${localStorage.getItem("last_project_id") ? `?project_id=${localStorage.getItem("last_project_id")}` : ""}`} accessible={isMenuAccessible("/merge")} isCollapsed={isCollapsed} />
            <NavItem icon="ri-git-commit-line"       label="Commits GitLab"      to={`/commits${localStorage.getItem("last_project_id") ? `?project_id=${localStorage.getItem("last_project_id")}` : ""}`} accessible={isMenuAccessible("/commits")} isCollapsed={isCollapsed} />
          </Section>

          <div className="sb-divider" />

          <Section title="Extraction" isCollapsed={isCollapsed}>
            <NavItem icon="ri-database-2-line"       label="Registre des Lots"   to="/extraction-lots" accessible={isMenuAccessible("/extraction-lots")} isCollapsed={isCollapsed} />
            <NavItem icon="ri-rocket-2-line"         label="Moteur d'Extraction" to="/extraction" accessible={isMenuAccessible("/extraction")} isCollapsed={isCollapsed} />
          </Section>

          <div className="sb-divider" />

          <Section title="Administration" accessible={isAdmin || isLead || isProjectManager || isViewer} isCollapsed={isCollapsed}>
            <NavItem icon="ri-settings-3-line" label="Configuration" accessible={isMenuAccessible("/admin/sites")} isCollapsed={isCollapsed} children={[
              { to: "/admin/sites",          label: "Sites" },
              { to: "/admin/projects",       label: "Projets GitLab" },
              { to: "/admin/gitlab-configs", label: "Configs GitLab" },
              { to: "/admin/users",          label: "Utilisateurs" },
              { to: "/admin/developers",     label: "Validation Profils" },
              { to: "/admin/periods",        label: "Périodes" },
              { to: "/admin/kpi-definitions",label: "Définitions KPI" },
            ]} />
            <NavItem icon="ri-user-settings-line" label="Profils & Menu"      to="/admin/profiles" accessible={isMenuAccessible("/admin/profiles")} isCollapsed={isCollapsed} />
            <NavItem icon="ri-time-line"         label="Scheduler Admin"    to="/admin/scheduler" accessible={isMenuAccessible("/admin/scheduler")} isCollapsed={isCollapsed} />
            <NavItem icon="ri-upload-2-line"     label="Import Développeurs" to="/admin/developers/import" accessible={isMenuAccessible("/admin/developers/import")} isCollapsed={isCollapsed} />
            <NavItem icon="ri-shield-check-line" label="Audit Log"         to="/admin/audit-log" accessible={isMenuAccessible("/admin/audit-log")} isCollapsed={isCollapsed} />
          </Section>
        </div>
      </div>
      
    </aside>
  );
}