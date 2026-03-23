/**
 * components/layout/Topbar.jsx
 *
 * CORRECTIONS :
 *   1. [NEW] /kpi-analysis ajouté dans ROUTE_LABELS et SEARCH_ROUTES
 *   2. user?.name (champ réel UserResponse) — pas user?.full_name ✅
 *   3. goTo dans les deps de useEffect search ✅
 */

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// ─── Données ──────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "fr", label: "Français", flag: "/assets/images/flags/french.svg" },
  { code: "en", label: "English",  flag: "/assets/images/flags/us.svg"     },
  { code: "ar", label: "العربية",  flag: "/assets/images/flags/ae.svg"     },
];

const ROUTE_LABELS = {
  "/":                       "Dashboard KPI",
  "/commits":                "Commits",
  "/merge":                  "Merge Requests",
  "/projects":               "Projets",
  "/developers":             "Développeurs",
  "/alerts":                 "Alertes KPI",
  "/kpi-analysis":           "Analyse KPI",        // ✅ AJOUT
  "/extraction-lots":        "Extraction Lots",
  "/profile":                "Mon profil",
  "/extraction":             "Run Extraction",
  "/admin/periods":          "Périodes",
  "/admin/gitlab-configs":   "GitLab Configs",
  "/admin/projects":         "Projects Admin",
  "/admin/sites":            "Sites",
  "/admin/kpi-thresholds":   "KPI Thresholds",
  "/admin/kpi-definitions":  "KPI Definitions",
  "/admin/dashboards":       "Dashboards",
  "/admin/users":            "Utilisateurs",
  "/admin/audit-log":        "Audit Log",
};

const SEARCH_ROUTES = [
  { label: "Dashboard KPI",     path: "/",                      icon: "ri-bar-chart-2-line",       keywords: ["kpi","dashboard","analytics"]            },
  { label: "Commits",           path: "/commits",               icon: "ri-git-commit-line",         keywords: ["commit","git"]                           },
  { label: "Merge Requests",    path: "/merge",                 icon: "ri-git-merge-line",          keywords: ["merge","mr","pull"]                      },
  { label: "Projets",           path: "/projects",              icon: "ri-folder-line",             keywords: ["projet","project"]                       },
  { label: "Développeurs",      path: "/developers",            icon: "ri-team-line",               keywords: ["dev","developer","equipe"]               },
  { label: "Alertes KPI",       path: "/alerts",                icon: "ri-alarm-warning-line",      keywords: ["alert","alerte","kpi","warning"]         },
  { label: "Analyse KPI",       path: "/kpi-analysis",          icon: "ri-bar-chart-grouped-line",  keywords: ["analyse","kpi","site","dev","comparaison","insights","recommendation"] }, // ✅
  { label: "Extraction Lots",   path: "/extraction-lots",       icon: "ri-stack-line",              keywords: ["lot","extraction","realtime","monthly"]  },
  { label: "GitLab Configs",    path: "/admin/gitlab-configs",  icon: "ri-settings-4-line",         keywords: ["config","gitlab","admin"]                },
  { label: "Projects Admin",    path: "/admin/projects",        icon: "ri-folder-settings-line",    keywords: ["admin","projet"]                         },
  { label: "Sites",             path: "/admin/sites",           icon: "ri-map-pin-line",            keywords: ["site","localisation","admin"]            },
  { label: "KPI Thresholds",    path: "/admin/kpi-thresholds",  icon: "ri-alarm-warning-line",      keywords: ["threshold","seuil","alerte","kpi"]       },
  { label: "KPI Definitions",   path: "/admin/kpi-definitions", icon: "ri-bar-chart-grouped-line",  keywords: ["kpi","definition","referentiel","admin"] },
  { label: "Dashboards",        path: "/admin/dashboards",      icon: "ri-layout-grid-line",        keywords: ["dashboard","admin"]                      },
  { label: "Utilisateurs",      path: "/admin/users",           icon: "ri-user-settings-line",      keywords: ["admin","user","utilisateur"]             },
  { label: "Audit Log",         path: "/admin/audit-log",       icon: "ri-file-list-3-line",        keywords: ["audit","log","trace","admin"]            },
  { label: "Mon profil",        path: "/profile",               icon: "ri-account-circle-line",     keywords: ["profil","profile","compte"]              },
];

const INIT_NOTIFS = [
  { id: 1, message: "Scheduler mensuel actif — prochain run : fin de mois.", time: "Maintenant",   read: false, icon: "ri-calendar-check-line",    color: "primary" },
  { id: 2, message: "Nouvelle période disponible. Pensez à lancer une extraction.", time: "Il y a 5 min", read: false, icon: "ri-download-cloud-2-line", color: "info" },
];

const AVATAR_GRADIENTS = [
  ["#405189","#0ab39c"], ["#299cdb","#405189"],
  ["#f7b84b","#f06548"], ["#0ab39c","#299cdb"],
  ["#f06548","#405189"], ["#3577f1","#0ab39c"],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getInitials = (email = "") =>
  email.split("@")[0].split(/[._-]/).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";

const avatarGradient = (email = "") => {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = email.charCodeAt(i) + ((h << 5) - h);
  const [a, b] = AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg,${a} 0%,${b} 100%)`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ initials, gradient, size = 36, ring = true }) {
  return (
    <span
      className="rounded-circle d-flex align-items-center justify-content-center text-white fw-semibold flex-shrink-0"
      style={{
        width: size, height: size, fontSize: size * 0.36,
        background: gradient,
        boxShadow: ring
          ? "0 0 0 2px rgba(255,255,255,0.9),0 2px 8px rgba(0,0,0,0.15)"
          : "none",
        userSelect: "none", letterSpacing: "0.5px",
      }}
    >
      {initials}
    </span>
  );
}

function NotifItem({ n, onRead }) {
  return (
    <div
      className={`d-flex align-items-start gap-3 px-3 py-2 border-bottom notif-item${!n.read ? " notif-unread" : ""}`}
      onClick={() => onRead(n.id)}
      style={{ cursor: "pointer" }}
    >
      <span
        className={`rounded-circle bg-${n.color}-subtle text-${n.color} flex-shrink-0 mt-1 d-flex align-items-center justify-content-center`}
        style={{ width: 32, height: 32 }}
      >
        <i className={n.icon}></i>
      </span>
      <div className="flex-grow-1">
        <p className={`mb-0 fs-13 ${!n.read ? "fw-semibold" : "text-muted"}`}>{n.message}</p>
        <small className="text-muted">{n.time}</small>
      </div>
      {!n.read && (
        <span className="bg-primary rounded-circle flex-shrink-0 mt-2" style={{ width: 7, height: 7, display: "block" }} />
      )}
    </div>
  );
}

// =============================================================================
// Topbar
// =============================================================================
export default function Topbar() {
  const navigate         = useNavigate();
  const location         = useLocation();
  const { logout, user } = useAuth();

  const userEmail = user?.email ?? "";
  const userName  = user?.name ?? user?.login ?? userEmail.split("@")[0].replace(/[._-]/g, " ");
  const userRole  = user?.role ?? "user";

  const initials = useMemo(() => getInitials(userEmail), [userEmail]);
  const gradient = useMemo(() => avatarGradient(userEmail), [userEmail]);

  const [open,     setOpen]     = useState(null);
  const [dark,     setDark]     = useState(() => {
    try { return JSON.parse(localStorage.getItem("vz-settings") || "{}").theme === "dark"; }
    catch { return false; }
  });
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [notifs,   setNotifs]   = useState(INIT_NOTIFS);
  const [search,   setSearch]   = useState("");
  const [results,  setResults]  = useState([]);
  const [focused,  setFocused]  = useState(false);
  const [idx,      setIdx]      = useState(-1);

  const langRef   = useRef(null);
  const notifRef  = useRef(null);
  const userRef   = useRef(null);
  const searchRef = useRef(null);
  const inputRef  = useRef(null);

  const toggle = (n) => setOpen((p) => (p === n ? null : n));
  const close  = useCallback(() => setOpen(null), []);

  useEffect(() => {
    close();
    setSearch("");
    setFocused(false);
    setIdx(-1);
  }, [location.pathname, close]);

  useEffect(() => {
    const handler = (e) => {
      if (
        !langRef.current?.contains(e.target) &&
        !notifRef.current?.contains(e.target) &&
        !userRef.current?.contains(e.target)
      ) close();
      if (!searchRef.current?.contains(e.target)) {
        setFocused(false);
        setIdx(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [close]);

  useEffect(() => {
    const html  = document.documentElement;
    const body  = document.body;
    const theme = dark ? "dark" : "light";
    html.setAttribute("data-bs-theme", theme);
    body.setAttribute("data-layout-mode", theme);
    try {
      const s = JSON.parse(localStorage.getItem("vz-settings") || "{}");
      s.theme = theme;
      localStorage.setItem("vz-settings", JSON.stringify(s));
    } catch {}
  }, [dark]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); setIdx(-1); return; }
    const t = setTimeout(() => {
      const q = search.toLowerCase();
      setResults(
        SEARCH_ROUTES.filter(
          (r) => r.label.toLowerCase().includes(q) || r.keywords.some((k) => k.includes(q))
        )
      );
      setIdx(-1);
    }, 180);
    return () => clearTimeout(t);
  }, [search]);

  const goTo = useCallback((path) => {
    setSearch(""); setFocused(false); setIdx(-1); navigate(path);
  }, [navigate]);

  useEffect(() => {
    const handler = (e) => {
      if (!focused || !results.length) {
        if (e.key === "Escape") { setSearch(""); setFocused(false); }
        return;
      }
      if      (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
      else if (e.key === "ArrowUp")   { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter")     { if (idx >= 0 && results[idx]) goTo(results[idx].path); }
      else if (e.key === "Escape")    { setSearch(""); setFocused(false); setIdx(-1); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focused, results, idx, goTo]);

  const pageLabel = useMemo(() => {
    const match = Object.entries(ROUTE_LABELS)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([p]) => location.pathname === p || location.pathname.startsWith(p + "/"));
    return match?.[1] ?? "";
  }, [location.pathname]);

  const unread       = notifs.filter((n) => !n.read).length;
  const markRead     = useCallback((id) => setNotifs((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n))), []);
  const markAll      = useCallback(() => setNotifs((p) => p.map((n) => ({ ...n, read: true }))), []);
  const handleLogout = useCallback(() => { close(); logout(); }, [close, logout]);
  const goPage       = useCallback((path) => { setOpen(null); setTimeout(() => navigate(path), 0); }, [navigate]);
  const showDrop     = focused && search.trim();

  return (
    <>
      <style>{`
        #page-topbar,
        [data-bs-theme] #page-topbar,
        [data-topbar] #page-topbar,
        [data-layout-mode] #page-topbar {
          background: #ffffff !important;
          border-bottom: 1px solid #e9ecef !important;
          box-shadow: 0 1px 6px rgba(0,0,0,0.05) !important;
        }
        #page-topbar .layout-width,
        #page-topbar .navbar-header { background: #ffffff !important; }
        #page-topbar .topbar-user,
        #page-topbar .topbar-user .btn { background: transparent !important; }
        #page-topbar .topbar-user .btn:hover,
        #page-topbar .topbar-user .btn:focus { background: #f1f3f7 !important; box-shadow: none !important; }
        #page-topbar .user-name-text    { color: #212529 !important; }
        #page-topbar .user-name-sub-text { color: #6c757d !important; }
        #page-topbar .btn-ghost-secondary,
        #page-topbar .btn-topbar { color: #6c757d !important; background: transparent !important; }
        #page-topbar .btn-ghost-secondary:hover,
        #page-topbar .btn-topbar:hover { background: #f1f3f7 !important; color: #212529 !important; }
        #page-topbar .hamburger-icon span { background: #555 !important; }
        #page-topbar .form-control {
          background: #f5f6fa !important; border: 1px solid #e9ecef !important; color: #212529 !important;
        }
        #page-topbar .form-control::placeholder { color: #adb5bd !important; }
        .notif-item:hover   { background: rgba(0,0,0,.03) !important; }
        .notif-unread       { background: rgba(64,81,137,.04) !important; }
        .notif-unread:hover { background: rgba(64,81,137,.08) !important; }
        .sr-item.kb-active  { background: rgba(64,81,137,.08) !important; }
      `}</style>

      <header
        id="page-topbar"
        style={{ background: "#ffffff", borderBottom: "1px solid #e9ecef", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}
      >
        <div className="layout-width">
          <div className="navbar-header">

            {/* ── LEFT ─────────────────────────────────────────────────── */}
            <div className="d-flex align-items-center gap-3">

              <button
                type="button"
                className="btn btn-sm px-3 fs-16 header-item vertical-menu-btn topnav-hamburger"
                id="topnav-hamburger-icon"
              >
                <span className="hamburger-icon"><span /><span /><span /></span>
              </button>

              {pageLabel && (
                <span className="d-none d-lg-flex align-items-center gap-1 text-muted fs-12">
                  <i className="ri-arrow-right-s-line" />
                  <span className="fw-medium">{pageLabel}</span>
                </span>
              )}

              {/* Search */}
              <div ref={searchRef} className="app-search d-none d-md-block position-relative">
                <div className="position-relative">
                  <input
                    ref={inputRef}
                    type="text"
                    className="form-control"
                    placeholder="Rechercher... (↑↓ Entrée)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setFocused(true)}
                    autoComplete="off"
                    style={{ minWidth: 260 }}
                  />
                  {search ? (
                    <button
                      className="btn p-0 position-absolute"
                      style={{ right: 10, top: "50%", transform: "translateY(-50%)", lineHeight: 1 }}
                      onClick={() => { setSearch(""); setFocused(false); inputRef.current?.focus(); }}
                    >
                      <i className="ri-close-line text-muted fs-14" />
                    </button>
                  ) : (
                    <span className="mdi mdi-magnify search-widget-icon" />
                  )}
                </div>

                {showDrop && results.length > 0 && (
                  <div className="dropdown-menu dropdown-menu-lg show shadow" style={{ top: "calc(100% + 4px)", left: 0, minWidth: 300, padding: "4px 0" }}>
                    <div className="px-3 py-1 border-bottom">
                      <span className="text-muted fs-11">{results.length} résultat{results.length > 1 ? "s" : ""}</span>
                    </div>
                    {results.map((r, i) => (
                      <button
                        key={r.path}
                        className={`dropdown-item sr-item d-flex align-items-center gap-2 py-2${idx === i ? " kb-active" : ""}`}
                        onClick={() => goTo(r.path)}
                      >
                        <span className="rounded bg-primary-subtle text-primary flex-shrink-0 d-flex align-items-center justify-content-center" style={{ width: 28, height: 28 }}>
                          <i className={r.icon} />
                        </span>
                        <span className="fs-13">{r.label}</span>
                        <i className="ri-arrow-right-s-line ms-auto text-muted" />
                      </button>
                    ))}
                    <div className="px-3 pt-1 pb-2 border-top mt-1">
                      <span className="text-muted fs-11">
                        <kbd style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "#f1f3f7", border: "1px solid #dee2e6" }}>↑↓</kbd> naviguer &nbsp;
                        <kbd style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "#f1f3f7", border: "1px solid #dee2e6" }}>↵</kbd> ouvrir &nbsp;
                        <kbd style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "#f1f3f7", border: "1px solid #dee2e6" }}>Esc</kbd> fermer
                      </span>
                    </div>
                  </div>
                )}

                {showDrop && results.length === 0 && (
                  <div className="dropdown-menu show shadow" style={{ minWidth: 280, top: "calc(100% + 4px)", left: 0 }}>
                    <div className="px-3 py-3 text-center">
                      <i className="ri-search-line fs-3 text-muted d-block mb-1 opacity-50" />
                      <p className="text-muted fs-13 mb-0">Aucune page pour « {search} »</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT ────────────────────────────────────────────────── */}
            <div className="d-flex align-items-center">

              {/* Language */}
              <div ref={langRef} className="dropdown ms-1 topbar-head-dropdown header-item">
                <button
                  className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle"
                  onClick={() => toggle("lang")}
                  title="Langue"
                >
                  <img src={language.flag} alt={language.label} height={18} style={{ borderRadius: 3 }} />
                </button>
                {open === "lang" && (
                  <div className="dropdown-menu dropdown-menu-end show shadow-sm" style={{ minWidth: 160 }}>
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        className={`dropdown-item d-flex align-items-center gap-2 py-2${language.code === l.code ? " active" : ""}`}
                        onClick={() => { setLanguage(l); close(); }}
                      >
                        <img src={l.flag} alt={l.label} height={15} width={21} className="rounded-1 flex-shrink-0" />
                        <span className="fs-13">{l.label}</span>
                        {language.code === l.code && <i className="ri-check-line ms-auto text-primary fs-14" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Notifications */}
              <div ref={notifRef} className="dropdown topbar-head-dropdown ms-1 header-item">
                <button
                  className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle"
                  onClick={() => toggle("notif")}
                  title="Notifications"
                >
                  <i className="bx bx-bell fs-22" />
                  {unread > 0 && (
                    <span className="position-absolute topbar-badge fs-10 translate-middle badge rounded-pill bg-danger">
                      {unread}
                    </span>
                  )}
                </button>
                {open === "notif" && (
                  <div className="dropdown-menu dropdown-menu-lg dropdown-menu-end show shadow p-0" style={{ borderRadius: 12, width: 340 }}>
                    <div className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom">
                      <div className="d-flex align-items-center gap-2">
                        <h6 className="mb-0 fw-semibold fs-14">Notifications</h6>
                        {unread > 0 && <span className="badge bg-danger rounded-pill fs-11">{unread} non lue{unread > 1 ? "s" : ""}</span>}
                      </div>
                      {unread > 0 && (
                        <button className="btn btn-link btn-sm p-0 text-primary fs-12 text-decoration-none" onClick={markAll}>
                          <i className="ri-check-double-line me-1" />Tout lire
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: 300, overflowY: "auto" }}>
                      {notifs.length === 0 ? (
                        <div className="text-center py-5">
                          <i className="bx bx-bell-off fs-2 text-muted d-block mb-2 opacity-50" />
                          <p className="text-muted fs-13 mb-0">Aucune notification</p>
                        </div>
                      ) : (
                        notifs.map((n) => <NotifItem key={n.id} n={n} onRead={markRead} />)
                      )}
                    </div>
                    <div className="px-3 py-2 text-center border-top" style={{ background: "#fafbfc", borderRadius: "0 0 12px 12px" }}>
                      <button className="btn btn-link btn-sm p-0 text-primary fs-12 text-decoration-none" onClick={close}>
                        Fermer <i className="ri-close-line" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Dark / Light toggle */}
              <div className="ms-1 header-item d-none d-sm-flex">
                <button
                  className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle light-dark-mode"
                  onClick={() => setDark((p) => !p)}
                  title={dark ? "Mode clair" : "Mode sombre"}
                >
                  <i className={`bx ${dark ? "bx-sun" : "bx-moon"} fs-22`} />
                </button>
              </div>

              {/* User dropdown */}
              <div ref={userRef} className="dropdown ms-sm-3 header-item topbar-user">
                <button
                  className="btn"
                  onClick={() => toggle("user")}
                  style={{ background: "transparent", border: "none", boxShadow: "none" }}
                >
                  <span className="d-flex align-items-center">
                    <Avatar initials={initials} gradient={gradient} size={34} />
                    <span className="text-start ms-xl-2">
                      <span className="d-none d-xl-inline-block ms-1 fw-semibold user-name-text text-capitalize">
                        {userName || "User"}
                      </span>
                      <span className="d-none d-xl-block ms-1 fs-13 user-name-sub-text text-capitalize">
                        {userRole}
                      </span>
                    </span>
                  </span>
                </button>

                {open === "user" && (
                  <div
                    className="dropdown-menu dropdown-menu-end show shadow"
                    style={{
                      position: "absolute", right: 0, top: "calc(100% + 6px)",
                      minWidth: 240, zIndex: 1050, padding: 0,
                      borderRadius: 12, border: "1px solid rgba(0,0,0,.08)",
                      overflow: "hidden", background: "#ffffff", color: "#212529",
                    }}
                  >
                    <div className="px-3 pt-3 pb-2">
                      <div className="d-flex align-items-center gap-2 p-2 rounded-3"
                        style={{ background: "rgba(64,81,137,0.06)", border: "1px solid rgba(64,81,137,0.12)", color: "#212529" }}>
                        <Avatar initials={initials} gradient={gradient} size={36} ring={false} />
                        <div className="flex-grow-1 overflow-hidden">
                          <p className="fw-semibold mb-0 fs-13 text-truncate text-capitalize" style={{ color: "#212529" }}>
                            {userName || "User"}
                          </p>
                          <p className="mb-0 fs-11 text-truncate" style={{ color: "#6c757d" }}>{userEmail}</p>
                        </div>
                      </div>
                      <div className="text-center mt-2">
                        <span className={`badge fs-11 px-2 py-1 ${userRole === "admin" ? "bg-danger-subtle text-danger" : "bg-info-subtle text-info"}`}>
                          <i className={`${userRole === "admin" ? "ri-shield-user-line" : "ri-user-line"} me-1`} />
                          {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                        </span>
                      </div>
                    </div>

                    <div className="dropdown-divider my-0" />

                    <div className="py-1">
                      <Link to="/profile" className="dropdown-item d-flex align-items-center gap-2 py-2 fs-13" onClick={close} style={{ color: "#212529" }}>
                        <i className="ri-account-circle-line fs-16" style={{ color: "#6c757d" }} />
                        <span>Mon profil</span>
                      </Link>
                      {/* ✅ Analyse KPI — accessible à tous */}
                      <Link to="/kpi-analysis" className="dropdown-item d-flex align-items-center gap-2 py-2 fs-13" onClick={close} style={{ color: "#212529" }}>
                        <i className="ri-bar-chart-grouped-line fs-16" style={{ color: "#0ab39c" }} />
                        <span>Analyse KPI</span>
                        <span className="badge bg-success ms-auto fs-10 px-2">New</span>
                      </Link>
                    </div>

                    {userRole === "admin" && (
                      <>
                        <div className="dropdown-divider my-0" />
                        <div className="py-1">
                          <button className="dropdown-item d-flex align-items-center gap-2 py-2 fs-13 w-100 text-start border-0 bg-transparent"
                            onClick={() => goPage("/admin/gitlab-configs")}>
                            <i className="ri-shield-check-line text-warning fs-16" />
                            <span>Admin Panel</span>
                            <span className="badge bg-danger ms-auto fs-10 px-2">Admin</span>
                          </button>
                          <button className="dropdown-item d-flex align-items-center gap-2 py-2 fs-13 w-100 text-start border-0 bg-transparent"
                            onClick={() => goPage("/admin/sites")}>
                            <i className="ri-map-pin-line text-info fs-16" />
                            <span>Sites</span>
                          </button>
                          <button className="dropdown-item d-flex align-items-center gap-2 py-2 fs-13 w-100 text-start border-0 bg-transparent"
                            onClick={() => goPage("/admin/audit-log")}>
                            <i className="ri-file-list-3-line text-secondary fs-16" />
                            <span>Audit Log</span>
                          </button>
                        </div>
                      </>
                    )}

                    <div className="dropdown-divider my-0" />

                    <div className="py-1">
                      <button
                        className="dropdown-item text-danger d-flex align-items-center gap-2 py-2 fs-13 w-100 text-start border-0 bg-transparent"
                        onClick={handleLogout}
                      >
                        <i className="ri-logout-box-r-line fs-16" />
                        <span>Déconnexion</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </header>
    </>
  );
}
