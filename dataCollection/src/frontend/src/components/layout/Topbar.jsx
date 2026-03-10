import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const LANGUAGES = [
  { code: "fr", label: "Français", flag: "/assets/images/flags/french.svg" },
  { code: "en", label: "English",  flag: "/assets/images/flags/us.svg"     },
  { code: "ar", label: "العربية",  flag: "/assets/images/flags/ae.svg"     },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const getInitials = (email = "") =>
  email
    .split("@")[0]
    .split(/[._-]/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "U";

const AVATAR_GRADIENTS = [
  ["#405189", "#0ab39c"], ["#299cdb", "#405189"],
  ["#f7b84b", "#f06548"], ["#0ab39c", "#299cdb"],
  ["#f06548", "#405189"], ["#3577f1", "#0ab39c"],
];
const avatarGradient = (email = "") => {
  let h = 0;
  for (let i = 0; i < email.length; i++)
    h = email.charCodeAt(i) + ((h << 5) - h);
  const [a, b] = AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
};

// ── Recherche globale ─────────────────────────────────────────────────────────
// [FIX] "/merges" → "/merge" (route correcte dans App.jsx)
// [NEW] Ajout KPI Thresholds
const SEARCH_ROUTES = [
  {
    label:    "Dashboard KPI",
    path:     "/",
    icon:     "ri-bar-chart-2-line",
    keywords: ["kpi", "dashboard", "analytics"],
  },
  {
    label:    "Commits",
    path:     "/commits",
    icon:     "ri-git-commit-line",
    keywords: ["commit", "git"],
  },
  {
    label:    "Merge Requests",
    path:     "/merge",               // [FIX] était "/merges"
    icon:     "ri-git-merge-line",
    keywords: ["merge", "mr", "pull"],
  },
  {
    label:    "Projets",
    path:     "/projects",
    icon:     "ri-folder-line",
    keywords: ["projet", "project"],
  },
  {
    label:    "Développeurs",
    path:     "/developers",
    icon:     "ri-team-line",
    keywords: ["dev", "developer", "equipe"],
  },
  {
    label:    "GitLab Configs",
    path:     "/admin/gitlab-configs",
    icon:     "ri-settings-4-line",
    keywords: ["config", "gitlab", "admin"],
  },
  {
    label:    "Projects Admin",
    path:     "/admin/projects",
    icon:     "ri-folder-settings-line",
    keywords: ["admin", "projet"],
  },
  {
    label:    "KPI Thresholds",       // [NEW]
    path:     "/admin/kpi-thresholds",
    icon:     "ri-alarm-warning-line",
    keywords: ["threshold", "seuil", "alerte", "kpi", "admin"],
  },
  {
    label:    "Utilisateurs Admin",
    path:     "/admin/users",
    icon:     "ri-user-settings-line",
    keywords: ["admin", "user", "utilisateur"],
  },
  {
    label:    "Mon profil",
    path:     "/profile",
    icon:     "ri-account-circle-line",
    keywords: ["profil", "profile", "compte"],
  },
];

const INITIAL_NOTIFICATIONS = [
  {
    id:      1,
    message: "Scheduler mensuel actif — prochain run : fin de mois.",
    time:    "Maintenant",
    read:    false,
    icon:    "ri-calendar-check-line",
    color:   "primary",
  },
  {
    id:      2,
    message: "Nouvelle période disponible. Pensez à lancer une extraction.",
    time:    "Il y a 5 min",
    read:    false,
    icon:    "ri-download-cloud-2-line",
    color:   "info",
  },
];

// ── Breadcrumb dynamique ──────────────────────────────────────────────────────
// [FIX] "/merges" → "/merge"
// [NEW] Ajout "/admin/kpi-thresholds"
const ROUTE_LABELS = {
  "/":                        "Dashboard KPI",
  "/commits":                 "Commits",
  "/merge":                   "Merge Requests",    // [FIX] était "/merges"
  "/projects":                "Projects",
  "/developers":              "Développeurs",
  "/profile":                 "Mon profil",
  "/extraction":              "Run Extraction",
  "/extraction-lots":         "Extraction Lots",
  "/admin/periods":           "Périodes",
  "/admin/gitlab-configs":    "GitLab Configs",
  "/admin/projects":          "Projects Admin",
  "/admin/kpi-thresholds":    "KPI Thresholds",    // [NEW]
  "/admin/dashboards":        "Dashboards",
  "/admin/users":             "User Management",
};

// ── Sous-composant Avatar ─────────────────────────────────────────────────────
function UserAvatar({ initials, gradient, size = 36, ring = true }) {
  return (
    <span
      className="rounded-circle d-flex align-items-center justify-content-center text-white fw-semibold flex-shrink-0"
      style={{
        width:         size,
        height:        size,
        fontSize:      size * 0.36,
        background:    gradient,
        boxShadow:     ring
          ? "0 0 0 2px rgba(255,255,255,0.9), 0 2px 8px rgba(0,0,0,0.15)"
          : "none",
        userSelect:    "none",
        letterSpacing: "0.5px",
      }}
    >
      {initials}
    </span>
  );
}

// ── Sous-composant NotificationItem ──────────────────────────────────────────
function NotificationItem({ n, onRead }) {
  return (
    <div
      className={`d-flex align-items-start gap-3 px-3 py-2 border-bottom notif-item ${
        !n.read ? "notif-unread" : ""
      }`}
      onClick={() => onRead(n.id)}
      style={{ cursor: "pointer", transition: "background .15s" }}
    >
      <span
        className={`rounded-circle bg-${n.color}-subtle text-${n.color} flex-shrink-0 mt-1 d-flex align-items-center justify-content-center`}
        style={{ width: 32, height: 32 }}
      >
        <i className={n.icon}></i>
      </span>
      <div className="flex-grow-1 min-width-0">
        <p className={`mb-0 fs-13 ${!n.read ? "fw-semibold" : "text-muted"}`}>
          {n.message}
        </p>
        <small className="text-muted">{n.time}</small>
      </div>
      {!n.read && (
        <span
          className="bg-primary rounded-circle flex-shrink-0 mt-2"
          style={{ width: 7, height: 7, display: "block" }}
        ></span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Topbar() {
  const navigate         = useNavigate();
  const location         = useLocation();
  const { logout, user } = useAuth();

  const userEmail = user?.email ?? "user@telnet.tn";
  const userName  = user?.name  ?? userEmail.split("@")[0].replace(/[._-]/g, " ");
  const userRole  = user?.role  ?? "user";
  const initials  = useMemo(() => getInitials(userEmail), [userEmail]);
  const gradient  = useMemo(() => avatarGradient(userEmail), [userEmail]);

  const [open,          setOpen]          = useState(null);
  const [dark,          setDark]          = useState(() => {
    const saved = localStorage.getItem("theme") === "dark";
    if (saved) {
      document.documentElement.setAttribute("data-bs-theme",    "dark");
      document.body.setAttribute("data-layout-mode", "dark");
      document.body.setAttribute("data-sidebar",     "dark");
    }
    return saved;
  });
  const [language,      setLanguage]      = useState(LANGUAGES[0]);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [search,        setSearch]        = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchIdx,     setSearchIdx]     = useState(-1);

  const langRef        = useRef(null);
  const notifRef       = useRef(null);
  const userRef        = useRef(null);
  const searchRef      = useRef(null);
  const searchInputRef = useRef(null);

  const toggle = (name) => setOpen((prev) => (prev === name ? null : name));
  const close  = useCallback(() => setOpen(null), []);

  // Ferme tout au changement de route
  useEffect(() => {
    close();
    setSearch("");
    setSearchFocused(false);
    setSearchIdx(-1);
  }, [location.pathname, close]);

  // Click outside
  useEffect(() => {
    const handler = (e) => {
      if (
        !langRef.current?.contains(e.target)  &&
        !notifRef.current?.contains(e.target) &&
        !userRef.current?.contains(e.target)
      )
        close();
      if (!searchRef.current?.contains(e.target)) {
        setSearchFocused(false);
        setSearchIdx(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [close]);

  // Dark mode — Velzon exige 3 attributs simultanément
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (dark) {
      html.setAttribute("data-bs-theme",    "dark");
      body.setAttribute("data-layout-mode", "dark");
      body.setAttribute("data-sidebar",     "dark");
    } else {
      html.setAttribute("data-bs-theme",    "light");
      body.setAttribute("data-layout-mode", "light");
      body.setAttribute("data-sidebar",     "light");
    }
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  // Recherche avec debounce
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      setSearchIdx(-1);
      return;
    }
    const t = setTimeout(() => {
      const q = search.toLowerCase().trim();
      setSearchResults(
        SEARCH_ROUTES.filter(
          (r) =>
            r.label.toLowerCase().includes(q) ||
            r.keywords.some((k) => k.includes(q))
        )
      );
      setSearchIdx(-1);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  // Navigation clavier dans les résultats (↑ ↓ Entrée Escape)
  useEffect(() => {
    const h = (e) => {
      if (!searchFocused || !searchResults.length) {
        if (e.key === "Escape") {
          setSearch("");
          setSearchFocused(false);
          setSearchIdx(-1);
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSearchIdx((i) => Math.min(i + 1, searchResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSearchIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        if (searchIdx >= 0 && searchResults[searchIdx]) {
          handleSearchNav(searchResults[searchIdx].path);
        }
      } else if (e.key === "Escape") {
        setSearch("");
        setSearchFocused(false);
        setSearchIdx(-1);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [searchFocused, searchResults, searchIdx]); // eslint-disable-line

  // Breadcrumb courant
  const currentPageLabel = useMemo(() => {
    const match = Object.entries(ROUTE_LABELS)
      .sort((a, b) => b[0].length - a[0].length)
      .find(
        ([path]) =>
          location.pathname === path ||
          location.pathname.startsWith(path + "/")
      );
    return match?.[1] ?? "";
  }, [location.pathname]);

  const unreadCount   = notifications.filter((n) => !n.read).length;
  const markAsRead    = useCallback(
    (id) =>
      setNotifications((p) =>
        p.map((n) => (n.id === id ? { ...n, read: true } : n))
      ),
    []
  );
  const markAllAsRead = useCallback(
    () => setNotifications((p) => p.map((n) => ({ ...n, read: true }))),
    []
  );
  const handleLogout  = useCallback(() => { close(); logout(); }, [close, logout]);

  const handleNavigate = useCallback(
    (path) => {
      setOpen(null);
      setTimeout(() => navigate(path), 0);
    },
    [navigate]
  );

  const handleSearchNav = useCallback(
    (path) => {
      setSearch("");
      setSearchFocused(false);
      setSearchIdx(-1);
      navigate(path);
    },
    [navigate]
  );

  const showSearchDropdown = searchFocused && search.trim();

  return (
    <>
      <style>{`
        .notif-item:hover { background: rgba(0,0,0,.03); }
        .notif-unread { background: rgba(64,81,137,.04); }
        .notif-unread:hover { background: rgba(64,81,137,.08); }
        .search-result-item.active-kb { background: rgba(64,81,137,.08); }
      `}</style>

      <header className="border-bottom bg-body">
        <div className="container-fluid">
          <div className="d-flex justify-content-between align-items-center py-2">

            {/* ── LEFT ── */}
            <div className="d-flex align-items-center gap-3">
              <Link to="/">
                <img
                  src="/assets/images/telnet.png"
                  alt="Telnet"
                  height={24}
                  className="telnet-logo"
                />
              </Link>

              {/* Breadcrumb discret */}
              {currentPageLabel && (
                <span className="d-none d-lg-flex align-items-center gap-1 text-muted fs-12">
                  <i className="ri-arrow-right-s-line"></i>
                  <span className="fw-medium text-dark">{currentPageLabel}</span>
                </span>
              )}

              {/* Recherche globale */}
              <div ref={searchRef} className="position-relative d-none d-md-block">
                <div className="search-box">
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="form-control"
                    placeholder="Rechercher une page... (↑↓ Entrée)"
                    style={{ width: 280 }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    autoComplete="off"
                  />
                  {search ? (
                    <button
                      className="btn p-0 position-absolute"
                      style={{
                        right:     10,
                        top:       "50%",
                        transform: "translateY(-50%)",
                        lineHeight: 1,
                      }}
                      onClick={() => {
                        setSearch("");
                        setSearchFocused(false);
                        searchInputRef.current?.focus();
                      }}
                    >
                      <i className="ri-close-line text-muted fs-14"></i>
                    </button>
                  ) : (
                    <i className="ri-search-line search-icon"></i>
                  )}
                </div>

                {/* Résultats */}
                {showSearchDropdown && searchResults.length > 0 && (
                  <div
                    className="dropdown-menu show shadow"
                    style={{
                      minWidth: 300,
                      top:      "calc(100% + 4px)",
                      left:     0,
                      padding:  "4px 0",
                    }}
                  >
                    <div className="px-3 py-1 border-bottom">
                      <span className="text-muted fs-11">
                        {searchResults.length} résultat
                        {searchResults.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    {searchResults.map((r, i) => (
                      <button
                        key={r.path}
                        className={`dropdown-item search-result-item d-flex align-items-center gap-2 py-2 ${
                          searchIdx === i ? "active-kb" : ""
                        }`}
                        onClick={() => handleSearchNav(r.path)}
                      >
                        <span
                          className="rounded bg-primary-subtle text-primary flex-shrink-0 d-flex align-items-center justify-content-center"
                          style={{ width: 28, height: 28 }}
                        >
                          <i className={r.icon}></i>
                        </span>
                        <span className="fs-13">{r.label}</span>
                        <i className="ri-arrow-right-s-line ms-auto text-muted"></i>
                      </button>
                    ))}
                    <div className="px-3 pt-1 pb-2 border-top mt-1">
                      <span className="text-muted fs-11">
                        <kbd
                          style={{
                            fontSize:     10,
                            padding:      "1px 4px",
                            borderRadius: 3,
                            background:   "#f1f3f7",
                            border:       "1px solid #dee2e6",
                          }}
                        >
                          ↑↓
                        </kbd>{" "}
                        naviguer &nbsp;
                        <kbd
                          style={{
                            fontSize:     10,
                            padding:      "1px 4px",
                            borderRadius: 3,
                            background:   "#f1f3f7",
                            border:       "1px solid #dee2e6",
                          }}
                        >
                          ↵
                        </kbd>{" "}
                        ouvrir &nbsp;
                        <kbd
                          style={{
                            fontSize:     10,
                            padding:      "1px 4px",
                            borderRadius: 3,
                            background:   "#f1f3f7",
                            border:       "1px solid #dee2e6",
                          }}
                        >
                          Esc
                        </kbd>{" "}
                        fermer
                      </span>
                    </div>
                  </div>
                )}

                {/* Aucun résultat */}
                {showSearchDropdown && searchResults.length === 0 && (
                  <div
                    className="dropdown-menu show shadow"
                    style={{
                      minWidth: 280,
                      top:      "calc(100% + 4px)",
                      left:     0,
                    }}
                  >
                    <div className="px-3 py-3 text-center">
                      <i className="ri-search-line fs-3 text-muted d-block mb-1 opacity-50"></i>
                      <p className="text-muted fs-13 mb-0">
                        Aucune page trouvée pour
                      </p>
                      <p className="fw-semibold fs-13 mb-0">« {search} »</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT ── */}
            <div className="d-flex align-items-center gap-1">

              {/* Language */}
              <div ref={langRef} className="position-relative">
                <button
                  className="btn btn-icon btn-ghost-secondary rounded-circle"
                  onClick={() => toggle("lang")}
                  title="Langue"
                >
                  <img
                    src={language.flag}
                    alt={language.label}
                    height={18}
                    style={{ borderRadius: 3 }}
                  />
                </button>
                {open === "lang" && (
                  <div
                    className="dropdown-menu show dropdown-menu-end shadow-sm"
                    style={{ minWidth: 160 }}
                  >
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        className={`dropdown-item d-flex align-items-center gap-2 py-2 ${
                          language.code === l.code ? "active" : ""
                        }`}
                        onClick={() => {
                          setLanguage(l);
                          close();
                        }}
                      >
                        <img
                          src={l.flag}
                          alt={l.label}
                          height={15}
                          width={21}
                          className="rounded-1 flex-shrink-0"
                        />
                        <span className="fs-13">{l.label}</span>
                        {language.code === l.code && (
                          <i className="ri-check-line ms-auto text-primary fs-14" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Notifications */}
              <div ref={notifRef} className="position-relative">
                <button
                  className="btn btn-icon btn-ghost-secondary rounded-circle"
                  onClick={() => toggle("notif")}
                  title="Notifications"
                >
                  <i className="bx bx-bell fs-22" />
                  {unreadCount > 0 && (
                    <span
                      className="badge bg-danger rounded-pill position-absolute"
                      style={{
                        top:       4,
                        right:     4,
                        fontSize:  "0.6rem",
                        minWidth:  16,
                        lineHeight:"14px",
                      }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>

                {open === "notif" && (
                  <div
                    className="dropdown-menu dropdown-menu-end show shadow"
                    style={{ width: 340, padding: 0, borderRadius: 12 }}
                  >
                    <div className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom">
                      <div className="d-flex align-items-center gap-2">
                        <h6 className="mb-0 fw-semibold fs-14">Notifications</h6>
                        {unreadCount > 0 && (
                          <span className="badge bg-danger rounded-pill fs-11">
                            {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          className="btn btn-link btn-sm p-0 text-primary fs-12 text-decoration-none"
                          onClick={markAllAsRead}
                        >
                          <i className="ri-check-double-line me-1"></i>Tout lire
                        </button>
                      )}
                    </div>

                    <div style={{ maxHeight: 300, overflowY: "auto" }}>
                      {notifications.length === 0 ? (
                        <div className="text-center py-5">
                          <i className="bx bx-bell-off fs-2 text-muted d-block mb-2 opacity-50"></i>
                          <p className="text-muted fs-13 mb-0">
                            Aucune notification
                          </p>
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <NotificationItem key={n.id} n={n} onRead={markAsRead} />
                        ))
                      )}
                    </div>

                    {/* [FIX] Suppression navigate("/notifications") — route inexistante.
                         Le panneau se ferme simplement. */}
                    <div
                      className="px-3 py-2 text-center border-top"
                      style={{ background: "#fafbfc", borderRadius: "0 0 12px 12px" }}
                    >
                      <button
                        className="btn btn-link btn-sm p-0 text-primary fs-12 text-decoration-none"
                        onClick={close}
                      >
                        Fermer <i className="ri-close-line"></i>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Dark mode */}
              <button
                className="btn btn-icon btn-ghost-secondary rounded-circle"
                onClick={() => setDark((p) => !p)}
                title={dark ? "Mode clair" : "Mode sombre"}
              >
                <i className={`bx ${dark ? "bx-sun" : "bx-moon"} fs-22`} />
              </button>

              {/* ── User dropdown ── */}
              <div ref={userRef} style={{ position: "relative" }}>
                <button
                  className="btn d-flex align-items-center gap-2 px-2 py-1 rounded-3"
                  onClick={() => toggle("user")}
                  style={{ transition: "background .15s" }}
                >
                  <UserAvatar initials={initials} gradient={gradient} size={34} />
                  <span className="d-none d-md-inline text-start lh-sm">
                    <span
                      className="d-block fw-semibold text-capitalize fs-13"
                      style={{
                        maxWidth:     120,
                        overflow:     "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace:   "nowrap",
                      }}
                    >
                      {userName}
                    </span>
                    <span className="d-block text-muted text-capitalize fs-11">
                      {userRole}
                    </span>
                  </span>
                  <i
                    className="ri-arrow-down-s-line text-muted d-none d-md-inline fs-16"
                    style={{
                      transition: "transform .2s",
                      transform:  open === "user" ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  ></i>
                </button>

                {open === "user" && (
                  <div
                    className="dropdown-menu show shadow"
                    style={{
                      position:   "absolute",
                      right:      0,
                      left:       "auto",
                      top:        "calc(100% + 6px)",
                      minWidth:   240,
                      zIndex:     1050,
                      padding:    0,
                      borderRadius: 12,
                      border:     "1px solid rgba(0,0,0,.08)",
                      overflow:   "hidden",
                    }}
                  >
                    {/* Carte profil */}
                    <div className="px-3 pt-3 pb-2">
                      <div
                        className="d-flex align-items-center gap-2 p-2 rounded-3"
                        style={{
                          background: "rgba(64,81,137,0.06)",
                          border:     "1px solid rgba(64,81,137,0.12)",
                        }}
                      >
                        <UserAvatar
                          initials={initials}
                          gradient={gradient}
                          size={36}
                          ring={false}
                        />
                        <div className="min-width-0 flex-grow-1">
                          <p
                            className="fw-semibold mb-0 text-capitalize fs-13"
                            style={{
                              maxWidth:     150,
                              overflow:     "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace:   "nowrap",
                            }}
                          >
                            {userName}
                          </p>
                          <p
                            className="text-muted mb-0 fs-11"
                            style={{
                              maxWidth:     150,
                              overflow:     "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace:   "nowrap",
                            }}
                          >
                            {userEmail}
                          </p>
                        </div>
                      </div>
                      <div className="text-center mt-2">
                        <span
                          className={`badge fs-11 px-2 py-1 ${
                            userRole === "admin"
                              ? "bg-danger-subtle text-danger"
                              : "bg-info-subtle text-info"
                          }`}
                        >
                          <i
                            className={`${
                              userRole === "admin"
                                ? "ri-shield-user-line"
                                : "ri-user-line"
                            } me-1`}
                          ></i>
                          {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                        </span>
                      </div>
                    </div>

                    <div className="dropdown-divider my-0" />

                    <div className="py-1">
                      <Link
                        to="/profile"
                        className="dropdown-item d-flex align-items-center gap-2 py-2 fs-13"
                        onClick={close}
                      >
                        <i className="ri-account-circle-line text-muted fs-16" />
                        <span>Mon profil</span>
                      </Link>
                      <Link
                        to="/profile"
                        className="dropdown-item d-flex align-items-center gap-2 py-2 fs-13"
                        onClick={close}
                      >
                        <i className="ri-settings-3-line text-muted fs-16" />
                        <span>Paramètres</span>
                      </Link>
                    </div>

                    {userRole === "admin" && (
                      <>
                        <div className="dropdown-divider my-0" />
                        <div className="py-1">
                          <button
                            className="dropdown-item d-flex align-items-center gap-2 py-2 fs-13 w-100 text-start border-0 bg-transparent"
                            onClick={() => handleNavigate("/admin/gitlab-configs")}
                          >
                            <i className="ri-shield-check-line text-warning fs-16" />
                            <span>Admin Panel</span>
                            <span className="badge bg-danger ms-auto fs-10 px-2">
                              Admin
                            </span>
                          </button>
                          {/* [NEW] Raccourci KPI Thresholds dans le dropdown */}
                          <button
                            className="dropdown-item d-flex align-items-center gap-2 py-2 fs-13 w-100 text-start border-0 bg-transparent"
                            onClick={() =>
                              handleNavigate("/admin/kpi-thresholds")
                            }
                          >
                            <i className="ri-alarm-warning-line text-warning fs-16" />
                            <span>KPI Thresholds</span>
                            <span className="badge bg-warning ms-auto fs-10 px-2">
                              New
                            </span>
                          </button>
                        </div>
                      </>
                    )}

                    <div className="dropdown-divider my-0" />

                    <div className="px-3 py-2 d-flex align-items-center justify-content-between">
                      <p className="text-muted mb-0 fs-11 d-flex align-items-center gap-1">
                        <i className="ri-information-line"></i>KPI Dashboard v1.0
                      </p>
                      <button
                        className="btn p-0 fs-11 text-muted d-flex align-items-center gap-1"
                        style={{ textDecoration: "none" }}
                        onClick={() => {
                          close();
                          setTimeout(() => searchInputRef.current?.focus(), 50);
                        }}
                        title="Ouvrir la recherche"
                      >
                        <i className="ri-search-line"></i>
                        <kbd
                          style={{
                            fontSize:     10,
                            padding:      "1px 4px",
                            borderRadius: 3,
                            background:   "#f1f3f7",
                            border:       "1px solid #dee2e6",
                          }}
                        >
                          ⌘K
                        </kbd>
                      </button>
                    </div>

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
