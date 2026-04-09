/**
 * Footer.jsx — TELNET HOLDING · Enterprise Precision v5
 *
 * Principes :
 *   · Hauteur 42px — discret, fonctionnel, jamais envahissant
 *   · Gauche  : © + nom produit + version
 *   · Centre  : info session (connexion, rôle) — utile en enterprise
 *   · Droite  : badge phase + lien documentation
 *   · Adapté light/dark via data-bs-theme
 */
import { useAuth } from "../../context/AuthContext";

const CSS = `
  .ft-shell {
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    border-top: 1px solid rgba(0,0,0,.06);
    background: transparent;
    font-family: 'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif;
    gap: 8px;
    flex-shrink: 0;
  }
  [data-bs-theme="dark"] .ft-shell { border-color: rgba(255,255,255,.06); }

  .ft-left {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: #94A3B8;
    white-space: nowrap;
  }
  .ft-left strong { color: #64748B; font-weight: 600; }
  [data-bs-theme="dark"] .ft-left { color: rgba(255,255,255,.25); }
  [data-bs-theme="dark"] .ft-left strong { color: rgba(255,255,255,.38); }

  .ft-dot { width: 3px; height: 3px; border-radius: 50%; background: #CBD5E1; flex-shrink: 0; }
  [data-bs-theme="dark"] .ft-dot { background: rgba(255,255,255,.15); }

  .ft-center {
    display: flex; align-items: center; gap: 6px;
    font-family: 'JetBrains Mono', 'DM Mono', monospace;
    font-size: 10px; color: #B0BAC9;
    white-space: nowrap;
  }
  [data-bs-theme="dark"] .ft-center { color: rgba(255,255,255,.2); }

  .ft-right {
    display: flex; align-items: center; gap: 8px;
    flex-shrink: 0;
  }

  .ft-badge {
    font-family: 'JetBrains Mono', 'DM Mono', monospace;
    font-size: 10px; font-weight: 600;
    padding: 3px 9px;
    border-radius: 5px;
    background: rgba(59,130,246,.08);
    color: #3B82F6;
    letter-spacing: .04em;
    border: 1px solid rgba(59,130,246,.14);
    white-space: nowrap;
  }
  [data-bs-theme="dark"] .ft-badge {
    background: rgba(59,130,246,.1);
    border-color: rgba(59,130,246,.2);
    color: #60A5FA;
  }

  @media (max-width: 768px) {
    .ft-center { display: none; }
    .ft-shell { padding: 0 16px; }
  }
  @media (max-width: 480px) {
    .ft-right .ft-badge { display: none; }
  }
`;

let ftCssInjected = false;
function injectFooterCSS() {
  if (ftCssInjected) return;
  ftCssInjected = true;
  const el = document.createElement("style");
  el.textContent = CSS;
  document.head.appendChild(el);
}

export default function Footer() {
  injectFooterCSS();
  const { user } = useAuth();

  const role = (user?.role || "").replace(/_/g, " ").toUpperCase();
  const year  = new Date().getFullYear();

  return (
    <footer className="ft-shell">

      {/* Left — branding */}
      <div className="ft-left">
        <span>© {year}</span>
        <div className="ft-dot" />
        <strong>TELNET HOLDING</strong>
        <div className="ft-dot" />
        <span>GitLab KPI Dashboard</span>
      </div>

      {/* Center — session info */}
      {user && (
        <div className="ft-center">
          <i className="ri-user-line" style={{ fontSize: 11 }} />
          <span>{user.email || user.name || "Session active"}</span>
          <span style={{ opacity: .4 }}>·</span>
          <span>{role}</span>
        </div>
      )}

      {/* Right — version */}
     

    </footer>
  );
}