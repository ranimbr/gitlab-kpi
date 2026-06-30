/**
 * Sidebar.jsx — TELNET HOLDING · Enterprise Precision v5
 *
 * Design reference : Linear, Vercel Dashboard, Salesforce Lightning
 *
 * Principes :
 *   · Fond deep slate #0F1623 — pas de bleu vif, pas de gradient criard
 *   · Icônes monochromes rgba(255,255,255,.45) → blanc pur au hover/actif
 *   · État actif : fond rgba(255,255,255,.07) + barre latérale #3B82F6 2px
 *   · Section headers en JetBrains Mono 9px uppercase 0.14em tracking
 *   · Logo Telnet dans un container propre, pas écrasé
 *   · Sous-menus avec indent visuel précis
 *   · Séparateur fin entre sections
 *   · Footer système : dot vert pulsant + "Système opérationnel"
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth, ROLES } from "../../context/AuthContext";
import profileService from "../../services/profileService";

// ─── CSS injecté une seule fois ───────────────────────────────────────────────
const SIDEBAR_CSS = `
  :root {
    --sb-bg:        #0F1623;
    --sb-border:    rgba(255,255,255,.06);
    --sb-text:      rgba(255,255,255,.5);
    --sb-text-h:    rgba(255,255,255,.88);
    --sb-active-bg: rgba(255,255,255,.07);
    --sb-active-bar:#3B82F6;
    --sb-icon:      rgba(255,255,255,.4);
    --sb-section:   rgba(255,255,255,.22);
    --sb-mono:      'JetBrains Mono', 'DM Mono', 'Courier New', monospace;
    --sb-sans:      'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif;
    --sb-ease:      cubic-bezier(.16,1,.3,1);
  }

  /* Shell — Fixed & Absolute Corner */
  .sb-shell {
    position: fixed;
    top: 0 !important;
    left: 0 !important;
    bottom: 0 !important;
    width: 240px;
    background: var(--sb-bg);
    border-right: 1px solid rgba(255,255,255,.05);
    display: flex;
    flex-direction: column;
    padding: 0;
    z-index: 1005; /* Above everything */
    font-family: var(--sb-sans);
    -webkit-font-smoothing: antialiased;
    transition: transform var(--sb-ease);
  }

  /* Brand Header — Enterprise Monolith */
  .sb-brand {
    height: 56px;
    display: flex;
    align-items: center;
    padding: 0 24px;
    gap: 14px;
    background: rgba(255,255,255,.025);
    border-bottom: 1px solid rgba(255,255,255,.06);
    text-decoration: none;
    flex-shrink: 0;
  }

  .sb-logo-box {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .sb-brand-img-wrap {
    width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    color: #FFFFFF;
  }
  .sb-brand-name {
    font-size: 19px; font-weight: 800;
    color: #00D1FF; /* Electric Cyan */
    letter-spacing: 0.08em;
    text-transform: uppercase; line-height: 1;
    display: flex; flex-direction: column;
    filter: drop-shadow(0 0 8px rgba(0, 209, 255, 0.3));
  }
  .sb-brand-sub {
    font-size: 8.5px; font-weight: 600;
    color: rgba(255,255,255,0.35);
    letter-spacing: 0.38em; margin-top: 3px;
  }

  /* Navigation — Flexible Layer */
  .sb-nav-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* Header stays, body scrolls */
  }

  /* Scroll area */
  .sb-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 10px 14px 30px; /* Refined padding */
  }
  .sb-scroll::-webkit-scrollbar { width: 3px; }
  .sb-scroll::-webkit-scrollbar-track { background: transparent; }
  .sb-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 99px; }

  /* Section header */
  .sb-section + .sb-section { margin-top: 6px; }
  .sb-section-hd {
    font-family: var(--sb-mono);
    font-size: 9px; font-weight: 600;
    color: var(--sb-section);
    letter-spacing: .14em; text-transform: uppercase;
    padding: 12px 10px 5px;
    display: block;
  }

  /* Nav item — base */
  .sb-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 10px;
    border-radius: 7px;
    color: var(--sb-text);
    text-decoration: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    transition: background .15s var(--sb-ease), color .15s;
    position: relative;
    line-height: 1.4;
    user-select: none;
  }
  .sb-item i.sb-icon {
    font-size: 15px;
    color: var(--sb-icon);
    flex-shrink: 0;
    width: 18px;
    transition: color .15s;
  }
  .sb-item:hover {
    background: rgba(255,255,255,.04);
    color: var(--sb-text-h);
  }
  .sb-item:hover i.sb-icon { color: rgba(255,255,255,.72); }

  /* Active */
  .sb-item.is-active {
    background: var(--sb-active-bg);
    color: #fff;
  }
  .sb-item.is-active i.sb-icon { color: #fff; }
  .sb-item.is-active::before {
    content: '';
    position: absolute;
    left: 0; top: 6px; bottom: 6px;
    width: 2px;
    background: var(--sb-active-bar);
    border-radius: 0 2px 2px 0;
  }

  /* Chevron */
  .sb-chevron {
    font-size: 14px;
    color: rgba(255,255,255,.25);
    margin-left: auto;
    flex-shrink: 0;
    transition: transform .2s var(--sb-ease), color .15s;
  }
  .sb-chevron.is-open { transform: rotate(90deg); color: rgba(255,255,255,.45); }

  /* Badge */
  .sb-badge {
    font-family: var(--sb-mono);
    font-size: 9px; font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(34,197,94,.12);
    color: #22C55E;
    letter-spacing: .06em;
    flex-shrink: 0;
    margin-left: auto;
  }

  /* Sub-menu */
  .sb-sub {
    margin: 2px 0 2px 28px;
    border-left: 1px solid rgba(255,255,255,.07);
    padding-left: 8px;
  }
  .sb-sub-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 8px;
    border-radius: 6px;
    color: rgba(255,255,255,.4);
    font-size: 12.5px;
    font-weight: 500;
    text-decoration: none;
    transition: background .15s, color .15s;
    position: relative;
  }
  .sb-sub-item:hover {
    background: rgba(255,255,255,.04);
    color: rgba(255,255,255,.82);
  }
  .sb-sub-item.is-active {
    color: rgba(255,255,255,.92);
    background: rgba(255,255,255,.05);
  }
  .sb-sub-item.is-active::before {
    content: '';
    position: absolute; left: -9px; top: 50%; transform: translateY(-50%);
    width: 1px; height: 14px;
    background: var(--sb-active-bar);
  }

  /* Responsive collapse */
  @media (max-width: 1024px) {
    .sb-shell { transform: translateX(-100%); transition: transform .25s var(--sb-ease); }
    .sb-shell.is-open { transform: translateX(0); }
  }

  /* Collapsed mode (icon-only) */
  .sb-shell.is-collapsed {
    width: 64px;
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
    padding: 10px 8px 30px;
  }
  .sb-shell.is-collapsed .sb-section-hd {
    display: none;
  }
  .sb-shell.is-collapsed .sb-item {
    padding: 10px;
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
    margin: 6px 12px;
  }
  .sb-shell.is-collapsed .sb-footer {
    padding: 12px 8px;
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
    right: -12px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    background: var(--sb-bg);
    border: 1px solid var(--sb-border);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--sb-text);
    transition: all .15s var(--sb-ease);
    z-index: 10;
  }
  .sb-toggle-btn:hover {
    background: rgba(255,255,255,.1);
    color: #fff;
    border-color: rgba(255,255,255,.15);
  }
  .sb-shell.is-collapsed .sb-toggle-btn {
    right: -12px;
  }

  /* Divider */
  .sb-divider {
    height: 1px;
    background: var(--sb-border);
    margin: 6px 8px;
  }

  /* Footer */
  .sb-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--sb-border);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    background: rgba(0,0,0,.18);
  }
  .sb-footer-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #22C55E;
    flex-shrink: 0;
    box-shadow: 0 0 0 2px rgba(34,197,94,.2);
    animation: sb-pulse 2.5s ease-in-out infinite;
  }
  @keyframes sb-pulse {
    0%,100% { box-shadow: 0 0 0 2px rgba(34,197,94,.2); }
    50%      { box-shadow: 0 0 0 5px rgba(34,197,94,.06); }
  }
  .sb-footer-txt {
    font-family: var(--sb-mono);
    font-size: 10px; color: rgba(255,255,255,.28);
    letter-spacing: .04em;
  }
  .sb-footer-ver {
    margin-left: auto;
    font-family: var(--sb-mono);
    font-size: 9px;
    color: rgba(255,255,255,.18);
    letter-spacing: .06em;
  }
`;

// ─── Logo Component (Premium Industrial Vector) ───────────────────────────
function TelnetSymbol() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{filter:'drop-shadow(0 0 10px rgba(0,209,255,0.25))'}}>
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
      {/* Polished Sphere */}
      <circle cx="16" cy="16" r="14" fill="url(#sphereGrad)" />
      {/* Light Reflections (Stripes) */}
      <path d="M5 21Q16 13 27 21" stroke="white" strokeWidth="0.8" strokeOpacity="0.6" fill="none" />
      <path d="M8 25Q16 19 24 25" stroke="white" strokeWidth="0.8" strokeOpacity="0.4" fill="none" />
      <path d="M12 29Q16 26 20 29" stroke="white" strokeWidth="0.8" strokeOpacity="0.2" fill="none" />
      {/* Electric Triangle Cutout */}
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
      : children?.some((c) => pathname === c.to || pathname.startsWith(c.to + "/")));

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
  const [loadingMenus, setLoadingMenus] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('sidebar-collapsed', String(newValue));
      // Dispatch custom event for AppLayout
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
      // Récupérer les menus accessibles selon le profil de l'utilisateur
      const data = await profileService.getActiveMenuItems();
      console.log("Menus chargés:", data);
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
        <div className="sb-logo-box" style={{display:'flex', alignItems:'center', gap:'12px'}}>
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
            {/* ✅ [REMOVED] Dashboard Global - Page principale supprimée */}
            {/* <NavItem icon="ri-dashboard-3-line"      label="Dashboard Global"    to="/dashboard"         badge="Live" accessible={isMenuAccessible("/dashboard")} isCollapsed={isCollapsed} /> */}
            <NavItem icon="ri-pie-chart-2-line" label="Analyse Stratégique" to={`/analytics/comparison${localStorage.getItem("last_project_id") ? `?project_id=${localStorage.getItem("last_project_id")}` : ""}`} accessible={isMenuAccessible("/analytics/comparison")} isCollapsed={isCollapsed} />
            {/* ✅ [REMOVED] Diagnostic Avancé - Non fonctionnelle */}
            {/* <NavItem icon="ri-stethoscope-line" label="Diagnostic Avancé" to={`/analytics/diagnostic${localStorage.getItem("last_project_id") ? `?project_id=${localStorage.getItem("last_project_id")}` : ""}`} accessible={isMenuAccessible("/analytics/diagnostic")} isCollapsed={isCollapsed} /> */}
            <NavItem icon="ri-code-s-slash-line"     label="Hub Développeurs"    to="/developers" accessible={isMenuAccessible("/developers")} isCollapsed={isCollapsed} />
          </Section>

          <div className="sb-divider" />

          <Section title="Activité Code" isCollapsed={isCollapsed}>
            <NavItem icon="ri-git-merge-line"        label="Merge Requests"      to={`/merge${localStorage.getItem("last_project_id") ? `?project_id=${localStorage.getItem("last_project_id")}` : ""}`} accessible={isMenuAccessible("/merge")} isCollapsed={isCollapsed} />
            <NavItem icon="ri-git-commit-line"       label="Commits GitLab"      to={`/commits${localStorage.getItem("last_project_id") ? `?project_id=${localStorage.getItem("last_project_id")}` : ""}`} accessible={isMenuAccessible("/commits")} isCollapsed={isCollapsed} />
            {/* ✅ [REMOVED] Analyses KPI - Non fonctionnelle */}
            {/* <NavItem icon="ri-line-chart-line"       label="Analyses KPI"        to="/kpi-analysis" accessible={isMenuAccessible("/kpi-analysis")} isCollapsed={isCollapsed} /> */}
            {/* ✅ [REMOVED] Alerts KPI - Non fonctionnelle */}
            {/* <NavItem icon="ri-notification-3-line"   label="Alertes KPI"         to="/alerts" accessible={isMenuAccessible("/alerts")} isCollapsed={isCollapsed} /> */}
          </Section>

          <div className="sb-divider" />

          <Section title="Extraction" isCollapsed={isCollapsed}>
            <NavItem icon="ri-database-2-line"       label="Registre des Lots"   to="/extraction-lots" accessible={isMenuAccessible("/extraction-lots")} isCollapsed={isCollapsed} />
            <NavItem icon="ri-rocket-2-line"         label="Moteur d'Extraction" to="/extraction" accessible={isMenuAccessible("/extraction")} isCollapsed={isCollapsed} />
          </Section>

          <Section title="Administration" accessible={isAdmin || isLead || isProjectManager || isViewer} isCollapsed={isCollapsed}>
            <NavItem icon="ri-settings-3-line" label="Configuration" accessible={isMenuAccessible("/admin/sites")} isCollapsed={isCollapsed} children={[
              { to: "/admin/sites",          label: "Sites Telnet",         accessible: isMenuAccessible("/admin/sites") },
              { to: "/admin/projects",       label: "Projets GitLab",       accessible: isMenuAccessible("/admin/projects") },
              { to: "/admin/gitlab-configs", label: "Configs GitLab",       accessible: isMenuAccessible("/admin/gitlab-configs") },
              { to: "/admin/users",          label: "Utilisateurs",         accessible: isMenuAccessible("/admin/users") },
              { to: "/admin/developers",     label: "Validation Profils",   accessible: isMenuAccessible("/admin/developers") },
              { to: "/admin/periods",        label: "Périodes",             accessible: isMenuAccessible("/admin/periods") },
              { to: "/admin/kpi-definitions",label: "Définitions KPI",      accessible: isMenuAccessible("/admin/kpi-definitions") },
              {/* { to: "/admin/kpi-thresholds", label: "Seuils KPI",           accessible={isMenuAccessible("/admin/kpi-thresholds") }, */}
            ]} />
            <NavItem icon="ri-user-settings-line" label="Profils & Menu"      to="/admin/profiles" accessible={isMenuAccessible("/admin/profiles")} isCollapsed={isCollapsed} />
            <NavItem icon="ri-time-line"         label="Scheduler Admin"    to="/admin/scheduler" accessible={isMenuAccessible("/admin/scheduler")} isCollapsed={isCollapsed} />
            {/* ✅ [REMOVED] Business Units - Page supprimée */}
            {/* <NavItem icon="ri-building-2-line"   label="Business Units"    to="/team" accessible={isMenuAccessible("/team")} isCollapsed={isCollapsed} /> */}
            <NavItem icon="ri-upload-2-line"     label="Import Développeurs" to="/admin/developers/import" accessible={isMenuAccessible("/admin/developers/import")} isCollapsed={isCollapsed} />
            <NavItem icon="ri-shield-check-line" label="Audit Log"         to="/admin/audit-log" accessible={isMenuAccessible("/admin/audit-log")} isCollapsed={isCollapsed} />
          </Section>
        </div>
      </div>

      {/* Footer System Status */}
      
    </aside>
  );
}