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
import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth, ROLES } from "../../context/AuthContext";

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
    width: 40px; height: 40px;
    background: #FFFFFF;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 0 16px rgba(59, 130, 246, 0.35); /* Aura Technology */
    border: 1px solid rgba(255,255,255,.1);
  }
  .sb-brand-img { width: 28px; height: 28px; object-fit: contain; }
  .sb-brand-name {
    font-size: 18px; font-weight: 900;
    color: #FFFFFF; letter-spacing: 0.15em;
    text-transform: uppercase; line-height: 1;
    text-shadow: 0 2px 10px rgba(0,0,0,.5);
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

// ─── Nav Item ─────────────────────────────────────────────────────────────────
function NavItem({ icon, label, to, badge, children }) {
  const { pathname } = useLocation();
  const isActive = to
    ? pathname === to || pathname.startsWith(to + "/")
    : children?.some(c => pathname === c.to || pathname.startsWith(c.to + "/"));

  const [open, setOpen] = useState(isActive && !!children);

  useEffect(() => {
    if (children && isActive && !open) setOpen(true);
  }, [pathname]);

  if (!children) {
    return (
      <Link to={to || "#"} className={`sb-item ${isActive ? "is-active" : ""}`}>
        <i className={`${icon} sb-icon`} />
        <span style={{ flex: 1 }}>{label}</span>
        {badge && <span className="sb-badge">{badge}</span>}
      </Link>
    );
  }

  return (
    <>
      <button className={`sb-item ${isActive ? "is-active" : ""}`} onClick={() => setOpen(v => !v)}>
        <i className={`${icon} sb-icon`} />
        <span style={{ flex: 1 }}>{label}</span>
        <i className={`ri-arrow-right-s-line sb-chevron ${open ? "is-open" : ""}`} />
      </button>
      {open && (
        <div className="sb-sub">
          {children.map((c, i) => <SubItem key={i} {...c} />)}
        </div>
      )}
    </>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="sb-section">
      <span className="sb-section-hd">{title}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {children}
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

  return (
    <aside className="sb-shell">
      {/* Brand Header — Elite Corner (Monolith) */}
      <div className="sb-brand">
        <div className="sb-logo-box">
          <div className="sb-brand-img-wrap">
            <img 
              src="/assets/images/telnet.png" 
              alt="TELNET Logo" 
              className="sb-brand-img"
              onError={(e) => { 
                e.target.style.display='none'; 
                e.target.parentNode.innerHTML='<i class="ri-rocket-fill" style="color:#3B82F6;font-size:22px;"></i>'
              }} 
            />
          </div>
          <span className="sb-brand-name">TELNET</span>
        </div>
      </div>

      {/* Navigation Layer — Pro Scroll */}
      <div className="sb-nav-container">
        <div className="sb-scroll">
          <Section title="Pilotage">
            <NavItem icon="ri-dashboard-3-line"      label="Dashboard Global"    to="/dashboard"         badge="Live" />
            {isAdmin && (
              <NavItem icon="ri-bar-chart-group-line" label="Analyse Stratégique" to="/analytics/comparison?project_id=1" />
            )}
            <NavItem icon="ri-code-s-slash-line"     label="Hub Développeurs"    to="/developers" />
          </Section>

          <div className="sb-divider" />

          <Section title="Activité Code">
            <NavItem icon="ri-git-merge-line"        label="Merge Requests"      to="/merge" />
            <NavItem icon="ri-git-commit-line"       label="Commits GitLab"      to="/commits" />
            <NavItem icon="ri-line-chart-line"       label="Analyses KPI"        to="/kpi-analysis" />
            <NavItem icon="ri-notification-3-line"   label="Alertes KPI"         to="/alerts" />
          </Section>

          <div className="sb-divider" />

          <Section title="Extraction">
            <NavItem icon="ri-database-2-line"       label="Registre des Lots"   to="/extraction-lots" />
            <NavItem icon="ri-rocket-2-line"         label="Moteur d'Extraction" to="/extraction" />
            <NavItem icon="ri-calendar-2-line"       label="Périodes"            to="/periods" />
          </Section>

          {(isAdmin || isLead) && (
            <>
              <div className="sb-divider" />
              <Section title="Administration">
                {isAdmin && (
                  <NavItem icon="ri-settings-3-line" label="Configuration" children={[
                    { to: "/admin/sites",          label: "Sites Telnet"         },
                    { to: "/admin/projects",       label: "Projets GitLab"       },
                    { to: "/admin/gitlab-configs", label: "Configs GitLab"       },
                    { to: "/admin/users",          label: "Utilisateurs"         },
                    { to: "/admin/developers",     label: "Validation Profils"   },
                    { to: "/admin/periods",        label: "Périodes"             },
                    { to: "/admin/kpi-definitions",label: "Définitions KPI"      },
                    { to: "/admin/kpi-thresholds", label: "Seuils KPI"           },
                    { to: "/admin/dashboards",     label: "Dashboards"           },
                  ]} />
                )}
                <NavItem icon="ri-team-line"         label="Gestion d'Équipe"    to="/team" />
                <NavItem icon="ri-upload-2-line"     label="Import Développeurs" to="/admin/developers/import" />
                {isAdmin && (
                  <NavItem icon="ri-shield-check-line" label="Audit Log"         to="/admin/audit-log" />
                )}
              </Section>
            </>
          )}
        </div>
      </div>

      {/* Footer System Status */}
      <div className="sb-footer">
        <div className="sb-footer-dot" />
        <span className="sb-footer-txt">Système opérationnel</span>
        <span className="sb-footer-ver">v3.0</span>
      </div>
    </aside>
  );
}