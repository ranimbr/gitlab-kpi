/**
 * pages/admin/ExtractionLotsPage.jsx
 *
 * AMÉLIORATIONS SENIOR v2 :
 *   1. Cards de stats CLIQUABLES → filtre automatiquement la table
 *   2. Détail d'erreur visible sur les lots failed (message + bouton relancer)
 *   3. Menu contextuel ⋮ pour les actions (moins de bruit visuel)
 *   4. Tooltip MD5 amélioré avec icône ✅/—
 *   5. Ligne failed mise en évidence (bg-danger-subtle)
 *
 * CORRECTIONS conservées :
 *   - lot.extraction_type (pas lot.type)
 *   - mounted flag anti memory leak
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate }     from "react-router-dom";
import projectService       from "../../services/projectService";
import extractionLotService from "../../services/extractionLotService";
import periodService        from "../../services/periodService";
import developerService     from "../../services/developerService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import StatusBadge    from "../../components/common/StatusBadge";
import Pagination     from "../../components/common/Pagination";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDuration(start, end) {
  if (!start || !end) return "—";
  const diff = Math.floor((new Date(end) - new Date(start)) / 1000);
  if (diff < 60)   return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}min`;
}

/**
 * Génère une teinte HSL déterministe à partir d'un nom.
 * Même technique que Slack, GitLab, Linear pour les avatars sans photo.
 */
function nameToHsl(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return { h, gradient: `linear-gradient(135deg, hsl(${h},65%,52%), hsl(${(h + 40) % 360},70%,40%))` };
}

/* ── Avatar gradient (style Slack / GitLab) ─────────────────────────────────── */
function GradientAvatar({ name, size = 32, fontSize }) {
  const initials = (name || "?").split(/[\s._-]/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const { gradient } = nameToHsl(name || "?");
  const fs = fontSize || Math.round(size * 0.38);
  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: "50%",
        background: gradient,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: fs,
        flexShrink: 0,
        boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
        letterSpacing: "0.02em",
        userSelect: "none",
      }}
      title={name}
    >
      {initials}
    </div>
  );
}

/* ── Avatar robot (scheduler) ───────────────────────────────────────────────── */
function RobotAvatar({ size = 32 }) {
  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #06b6d4, #0284c7)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: Math.round(size * 0.48),
        flexShrink: 0,
        boxShadow: "0 2px 6px rgba(6,182,212,0.35)",
      }}
      title="Scheduler automatique"
    >
      <i className="ri-robot-line"></i>
    </div>
  );
}

/* ── Cellule Projet (avec badge ID discret) ──────────────────────────────────── */
function ProjectCell({ lot, projectName }) {
  return (
    <div className="d-flex align-items-center gap-2">
      <span className="fw-semibold fs-13">{projectName}</span>
      <span
        className="badge bg-light text-muted fw-normal"
        style={{ fontSize: 10, border: "1px solid #e2e8f0" }}
        title={`Lot ID interne : ${lot.id}`}
      >
        #{lot.id}
      </span>
    </div>
  );
}

/* ── Cellule Développeur (colonne dédiée) ──────────────────────────────────── */
function DevCell({ lot }) {
  const dev     = lot.developer;
  const devName = dev?.name || dev?.gitlab_username;

  if (!devName) {
    return (
      <div className="d-flex align-items-center gap-2">
        <div
          style={{
            width: 30, height: 30, borderRadius: "50%",
            background: "linear-gradient(135deg, #94a3b8, #64748b)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 13, flexShrink: 0,
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          }}
          title="Extraction sur tous les membres du projet"
        >
          <i className="ri-group-line"></i>
        </div>
        <div>
          <div className="fs-12 fw-medium text-muted">Tous les membres</div>
          <div className="fs-10 text-muted" style={{ opacity: 0.7 }}>Scope projet</div>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex align-items-center gap-2">
      <GradientAvatar name={devName} size={30} />
      <div>
        <div className="fs-12 fw-semibold text-dark">{devName}</div>
        {dev?.gitlab_username && dev?.name && (
          <div className="fs-10 text-muted">@{dev.gitlab_username}</div>
        )}
      </div>
    </div>
  );
}

/* ── Cellule "Déclenché par" ────────────────────────────────────────────────── */
function TriggeredByCell({ lot }) {
  const user = lot.triggered_by_user;

  if (!lot.triggered_by && !user) {
    return (
      <div className="d-flex align-items-center gap-2">
        <RobotAvatar size={32} />
        <div>
          <div className="fs-12 fw-semibold" style={{ color: "#0284c7" }}>Scheduler</div>
          <div className="fs-10 text-muted">Automatique</div>
        </div>
      </div>
    );
  }

  const displayName  = user?.name  || `User #${lot.triggered_by}`;
  const displayEmail = user?.email || null;

  return (
    <div className="d-flex align-items-center gap-2">
      <GradientAvatar name={displayName} size={32} />
      <div>
        <div className="fs-12 fw-semibold text-dark">{displayName}</div>
        {displayEmail && <div className="fs-10 text-muted">{displayEmail}</div>}
      </div>
    </div>
  );
}

/* ── MD5 avec copie et indicateur ── */
function Md5Cell({ lot }) {
  const [copied, setCopied] = useState(false);
  if (!lot.md5sum) return <span className="text-muted fs-12">—</span>;
  const copy = () => {
    navigator.clipboard.writeText(lot.md5sum);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <span
      title={`MD5 : ${lot.md5sum}\nCliquez pour copier`}
      onClick={copy}
      style={{ cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}
      className={copied ? "text-success fw-bold" : "text-muted"}
    >
      <i className={`me-1 ${copied ? "ri-check-line text-success" : "ri-shield-check-line text-success"}`}></i>
      {copied ? "Copié !" : `${lot.md5sum.slice(0, 8)}…`}
    </span>
  );
}

/* ── Bouton téléchargement ── */
function DownloadButton({ lot }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError]             = useState(null);
  if (!lot.md5sum) return null;

  const handleDownload = async () => {
    setDownloading(true); setError(null);
    try {
      const token    = localStorage.getItem("access_token");
      const response = await fetch(
        `${API_BASE}/extraction/lots/${lot.id}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Download failed");
      }
      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `lot_${lot.id}_project_${lot.project_id}.json`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <span className="d-flex align-items-center gap-1">
      <button
        className="btn btn-sm btn-soft-success py-0 px-2"
        onClick={handleDownload}
        disabled={downloading}
        title="Télécharger le dump JSON"
        style={{ fontSize: 11 }}
      >
        {downloading
          ? <span className="spinner-border spinner-border-sm"></span>
          : <><i className="ri-download-2-line me-1"></i>DL</>
        }
      </button>
      {error && <span className="text-danger fs-10"><i className="ri-error-warning-line"></i></span>}
    </span>
  );
}

/* ── Menu contextuel ⋮ pour les actions (remplace 4 boutons) ── */
function ActionsMenu({ lot, navigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const disabled = lot.status !== "completed";

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const actions = [
    {
      label: "Merge Requests", icon: "ri-git-merge-line", color: "primary",
      count: lot.mr_count,
      tooltip: `${lot.mr_count} MR(s) extraite(s) dans ce lot`,
      path: `/merge?project_id=${lot.project_id}&developer_id=${lot.developer_id}&period_id=${lot.period_id}&site_id=${lot.developer?.site_id || ""}&group_id=${lot.developer?.group_id || ""}`,
    },
    {
      label: "Commits", icon: "ri-git-commit-line", color: "info",
      count: lot.commit_count,
      tooltip: `${lot.commit_count} commit(s) extrait(s) · les merge commits sont exclus des KPIs`,
      path: `/commits?project_id=${lot.project_id}&developer_id=${lot.developer_id}&period_id=${lot.period_id}&site_id=${lot.developer?.site_id || ""}&group_id=${lot.developer?.group_id || ""}`,
    },
    {
      label: "Dashboard KPI", icon: "ri-dashboard-2-line", color: "success",
      path: `/dashboard?project_id=${lot.project_id}&developer_id=${lot.developer_id}&period_id=${lot.period_id}`,
    },
    {
      label: "Hub Talent", icon: "ri-team-line", color: "warning",
      path: `/developers/${lot.developer_id}`,
    },
  ];


  return (
    <div ref={ref} className="dropdown" style={{ position: "relative" }}>
      <button
        className={`btn btn-sm ${open ? "btn-primary" : (disabled ? "btn-light text-muted" : "btn-soft-secondary")} px-2 py-1`}
        onClick={() => !disabled && setOpen(o => !o)}
        title={disabled ? "Lot non complété" : "Explorer les données"}
        style={{ fontSize: 13, transition: "all 0.2s ease" }}
      >
        <i className={open ? "ri-close-line" : "ri-more-2-fill"}></i>
      </button>
      {open && (
        <div
          className="dropdown-menu show shadow-lg border-0 animate__animated animate__fadeIn"
          style={{ 
            position: "absolute", 
            right: 0, 
            top: "100%", 
            zIndex: 9999, 
            minWidth: 200, 
            borderRadius: 8,
            marginTop: 5,
            padding: "8px 0"
          }}
        >
          <div className="dropdown-header fs-10 text-uppercase fw-bold text-muted border-bottom mb-2 pb-2">Actions disponibles</div>
          {actions.map((a, i) => (
            <button
              key={i}
              className="dropdown-item d-flex align-items-center gap-2 py-2 px-3"
              onClick={() => { setOpen(false); navigate(a.path); }}
              style={{ fontSize: 13 }}
            >
              <div className={`avatar-xs rounded-circle bg-${a.color}-subtle text-${a.color} d-flex align-items-center justify-content-center`} style={{ width: 24, height: 24 }}>
                <i className={a.icon} style={{ fontSize: 12 }}></i>
              </div>
              <span className="fw-medium">{a.label}</span>
              {a.count !== undefined && (
                <span
                  className="badge ms-auto"
                  title={a.tooltip || String(a.count)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    background: a.count > 0 ? "rgba(99,102,241,0.12)" : "rgba(148,163,184,0.15)",
                    color: a.count > 0 ? "#6366f1" : "#94a3b8",
                    border: `1px solid ${a.count > 0 ? "rgba(99,102,241,0.25)" : "rgba(148,163,184,0.25)"}`,
                    borderRadius: 20,
                    padding: "2px 8px",
                    minWidth: 24,
                    textAlign: "center",
                    cursor: "help",
                  }}
                >
                  {a.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Détail d'erreur inline pour les lots failed ── */
function ErrorRow({ lot, colSpan }) {
  if (lot.status !== "failed" || !lot.error_message) return null;
  return (
    <tr style={{ background: "rgba(220,38,38,0.04)" }}>
      <td colSpan={colSpan} className="py-2 px-4">
        <div className="d-flex align-items-start gap-2">
          <i className="ri-error-warning-line text-danger fs-15 flex-shrink-0 mt-1"></i>
          <div>
            <span className="fw-semibold text-danger fs-12">Erreur : </span>
            <span className="text-muted fs-12">{lot.error_message}</span>
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ══════════════════════════════════════════════════════════════
   Main Page
══════════════════════════════════════════════════════════════ */
export default function ExtractionLotsPage() {
  const navigate = useNavigate();
  const [lots,         setLots]         = useState([]);
  const [projects,     setProjects]     = useState([]);
  const [periods,      setPeriods]      = useState([]);
  const [developers,   setDevelopers]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [projFilter,   setProjFilter]   = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [devFilter,    setDevFilter]    = useState("");
  const [devSearch,    setDevSearch]    = useState(""); // Nouvelle recherche textuelle
  const [typeFilter,   setTypeFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds,  setSelectedIds]  = useState([]);
  const [page,         setPage]         = useState(1);
  const perPage = 12;

  const refreshData = () => {
    // Force un re-fetch en déclenchant l'effet de dépendance (projFilter, periodFilter)
    // Ici on peut juste appeler la fonction fetchLots si on l'expose, 
    // mais le plus simple est de ré-exécuter l'effet via un trigger.
    setLoading(true);
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([
      projectService.getAll(),
      periodService.getAll(),
      developerService.getAll()
    ])
      .then(([projs, pers, devs]) => {
        if (!mounted) return;
        setProjects(projs);
        setPeriods(pers);
        setDevelopers(devs);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    let pollInterval = null;

    const fetchLots = (isInitial = false) => {
      if (isInitial && mounted) setLoading(true);
      extractionLotService.getAll(
        projFilter   ? parseInt(projFilter)   : null,
        periodFilter ? parseInt(periodFilter) : null,
      )
        .then(data => {
          if (!mounted) return;
          const newLots = Array.isArray(data) ? data : (data?.items ?? []);
          setLots(newLots);
          if (isInitial) setPage(1);
          const hasRunning = newLots.some(l => l.status === "running");
          if (hasRunning && !pollInterval) {
            pollInterval = setInterval(() => fetchLots(false), 2000);
          } else if (!hasRunning && pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        })
        .catch(() => { if (mounted && isInitial) setLots([]); })
        .finally(() => { if (mounted && isInitial) setLoading(false); });
    };

    fetchLots(true);
    return () => { mounted = false; if (pollInterval) clearInterval(pollInterval); };
  }, [projFilter, periodFilter]);

  const filtered = lots.filter(l => {
    if (typeFilter   !== "all" && l.extraction_type !== typeFilter)   return false;
    if (statusFilter !== "all" && l.status          !== statusFilter) return false;
    
    // Filtrage par ID (dropdown)
    if (devFilter && l.developer_id !== parseInt(devFilter)) return false;

    // Filtrage par texte (search)
    if (devSearch.trim()) {
      const q = devSearch.toLowerCase();
      const name = (l.developer?.name || "").toLowerCase();
      const user = (l.developer?.gitlab_username || "").toLowerCase();
      if (!name.includes(q) && !user.includes(q)) return false;
    }

    return true;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  const totalLots     = lots.length;
  const completedLots = lots.filter(l => l.status === "completed").length;
  const failedLots    = lots.filter(l => l.status === "failed").length;
  const runningLots   = lots.filter(l => l.status === "running").length;

  /* ── Filtre rapide au clic sur une card ── */
  const handleCardClick = (statusValue) => {
    setStatusFilter(prev => prev === statusValue ? "all" : statusValue);
    setPage(1);
  };

  const getProjectName = (lot) =>
    lot.project?.name ||
    projects.find(p => p.id === lot.project_id)?.name ||
    `Projet #${lot.project_id}`;

  const getPeriodLabel = (lot) => {
    if (lot.period?.year) return `${lot.period.year}/${String(lot.period.month).padStart(2, "0")}`;
    const found = periods.find(p => p.id === lot.period_id);
    if (found)            return `${found.year}/${String(found.month).padStart(2, "0")}`;
    return lot.period_id ? `Période #${lot.period_id}` : "—";
  };

  /* ── Export CSV Global ────────────────────────────────────────────────── */
  const handleExportCsv = () => {
    if (filtered.length === 0) return;

    const headers = ["ID", "Développeur", "Projet", "Période", "Type", "Statut", "Déclenché par", "Date"];
    const rows = filtered.map(l => [
      l.id,
      l.developer?.name || l.developer?.gitlab_username || "Tous",
      getProjectName(l),
      getPeriodLabel(l),
      l.extraction_type,
      l.status,
      l.triggered_by_user?.name || "Scheduler",
      new Date(l.created_at).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(val => `"${val}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `extraction_lots_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ── Gestion Sélection ────────────────────────────────────────────────── */
  const toggleSelectAll = () => {
    if (selectedIds.length === paginated.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginated.map(l => l.id));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Supprimer définitivement ${selectedIds.length} lots ?`)) return;
    try {
      await extractionLotService.deleteBulk(selectedIds);
      setSelectedIds([]);
      // On provoque un re-fetch en changeant légèrement un état dépendant ou en rappelant fetchLots
      window.location.reload(); // Simple pour cet exemple, mais fetchLots(true) serait mieux
    } catch (err) {
      alert("Erreur lors de la suppression groupée");
    }
  };

  /* Cards stats — définition */
  const statCards = [
    { label: "Total Lots",  value: totalLots,     color: "primary", icon: "ri-list-check",           statusVal: "all"       },
    { label: "Complétés",   value: completedLots, color: "success", icon: "ri-checkbox-circle-line",  statusVal: "completed" },
    { label: "En erreur",   value: failedLots,    color: "danger",  icon: "ri-close-circle-line",     statusVal: "failed"    },
    { label: "En cours",    value: runningLots,   color: "info",    icon: "ri-loader-4-line",          statusVal: "running"   },
  ];

  const COL_COUNT = 10; // nombre de colonnes de la table

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* Breadcrumb */}
        <div className="row mb-1">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-list-check me-2 text-primary"></i>Lots d'extraction
              </h4>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item active">Extraction Lots</li>
              </ol>
            </div>
          </div>
        </div>

        {/* ── Cards cliquables ── */}
        <div className="row mb-4">
          {statCards.map((s, i) => {
            const isActive = statusFilter === s.statusVal || (s.statusVal === "all" && statusFilter === "all");
            return (
              <div key={i} className="col-xl-3 col-sm-6">
                <div
                  className={`card card-animate mb-3 ${s.statusVal !== "all" ? "cursor-pointer" : ""}`}
                  onClick={() => s.statusVal !== "all" && handleCardClick(s.statusVal)}
                  style={{
                    cursor: s.statusVal !== "all" ? "pointer" : "default",
                    border: statusFilter === s.statusVal && s.statusVal !== "all"
                      ? `2px solid var(--vz-${s.color})`
                      : "1px solid var(--vz-border-color)",
                    transition: "all 0.18s ease",
                    transform: statusFilter === s.statusVal && s.statusVal !== "all" ? "translateY(-2px)" : "none",
                    boxShadow: statusFilter === s.statusVal && s.statusVal !== "all"
                      ? `0 4px 16px rgba(0,0,0,0.12)`
                      : undefined,
                  }}
                  title={s.statusVal !== "all" ? `Filtrer par : ${s.label}` : undefined}
                >
                  <div className="card-body">
                    <div className="d-flex align-items-center">
                      <div className="avatar-sm flex-shrink-0">
                        <span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-2 fs-2`}>
                          <i className={s.icon}></i>
                        </span>
                      </div>
                      <div className="flex-grow-1 ms-3">
                        <p className="text-uppercase fw-medium text-muted mb-1 fs-12">{s.label}</p>
                        <h4 className={`mb-0 text-${s.color}`}>{s.value}</h4>
                      </div>
                      {s.statusVal !== "all" && (
                        <div className="flex-shrink-0">
                          {statusFilter === s.statusVal
                            ? <span className={`badge bg-${s.color} fs-10`}><i className="ri-filter-fill"></i></span>
                            : <span className="text-muted fs-18"><i className="ri-filter-line"></i></span>
                          }
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filtres */}
        <div className="card mb-3">
          <div className="card-body py-3">
            <div className="row g-2 align-items-end">
              <div className="col-md-2">
                <label className="form-label fs-12 text-muted fw-semibold mb-1">
                  <i className="ri-search-line me-1"></i>Chercher Dev
                </label>
                <div className="input-group input-group-sm">
                  <input 
                    type="text" 
                    className="form-control form-control-sm bg-light-subtle" 
                    placeholder="Nom ou @user..."
                    value={devSearch}
                    onChange={e => { setDevSearch(e.target.value); setPage(1); }}
                  />
                  {devSearch && (
                    <button className="btn btn-outline-light border" onClick={() => setDevSearch("")}>
                      <i className="ri-close-line text-muted"></i>
                    </button>
                  )}
                </div>
              </div>
              <div className="col-md-2">
                <label className="form-label fs-12 text-muted fw-semibold mb-1">
                  <i className="ri-folder-2-line me-1"></i>Projet
                </label>
                <select className="form-select form-select-sm" value={projFilter}
                  onChange={e => setProjFilter(e.target.value)}>
                  <option value="">Tous les projets</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label fs-12 text-muted fw-semibold mb-1">
                  <i className="ri-calendar-2-line me-1"></i>Période
                </label>
                <select className="form-select form-select-sm" value={periodFilter}
                  onChange={e => setPeriodFilter(e.target.value)}>
                  <option value="">Toutes les périodes</option>
                  {periods.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.year}/{String(p.month).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label fs-12 text-muted fw-semibold mb-1">Type</label>
                <select className="form-select form-select-sm" value={typeFilter}
                  onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
                  <option value="all">Tous</option>
                  <option value="REALTIME">Realtime</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label fs-12 text-muted fw-semibold mb-1">Statut</label>
                <select className="form-select form-select-sm" value={statusFilter}
                  onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                  <option value="all">Tous</option>
                  <option value="pending">Pending</option>
                  <option value="running">Running</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div className="col-md-2">
                  <button className="btn btn-sm btn-light w-100"
                  onClick={() => {
                    setProjFilter(""); setPeriodFilter(""); setDevFilter("");
                    setDevSearch(""); setTypeFilter("all"); setStatusFilter("all"); setPage(1);
                  }}>
                  <i className="ri-filter-off-line me-1"></i>Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <div className="card-header d-flex align-items-center border-0">
            <h5 className="card-title mb-0 flex-grow-1">
              <i className="ri-list-check me-2 text-primary"></i>
              Lots ({filtered.length})
              {statusFilter !== "all" && (
                <span
                  className="badge bg-secondary-subtle text-secondary ms-2 fw-normal fs-12"
                  style={{ cursor: "pointer" }}
                  onClick={() => { setStatusFilter("all"); setPage(1); }}
                  title="Retirer le filtre"
                >
                  {statusFilter} <i className="ri-close-line ms-1"></i>
                </span>
              )}
            </h5>
            <div className="d-flex align-items-center gap-3">
              <span className="text-muted fs-12">
                <i className="ri-information-line me-1 text-info"></i>
                MD5 cliquable pour copier · ⋮ pour explorer les données
              </span>
              <button className="btn btn-sm btn-outline-success border-dashed" onClick={handleExportCsv}>
                <i className="ri-file-excel-2-line me-1"></i>Exporter CSV ({filtered.length})
              </button>
            </div>
          </div>

          {/* Bulk Actions Toolbar */}
          {selectedIds.length > 0 && (
            <div className="bg-primary-subtle p-2 d-flex align-items-center justify-content-between border-bottom border-top animate__animated animate__fadeIn">
              <div className="d-flex align-items-center gap-2 ps-2">
                <span className="badge bg-primary">{selectedIds.length} sélectionnés</span>
                <button className="btn btn-link btn-sm text-primary p-0 ms-2" onClick={() => setSelectedIds([])}>
                  Annuler
                </button>
              </div>
              <div className="d-flex gap-2 pe-2">
                <button className="btn btn-sm btn-danger" onClick={handleBulkDelete}>
                  <i className="ri-delete-bin-line me-1"></i>Supprimer la sélection
                </button>
              </div>
            </div>
          )}

          <div className="card-body p-0" style={{ minHeight: 400 }}>
            {loading ? (
              <div className="p-4"><LoadingSpinner text="Chargement des lots..." /></div>
            ) : filtered.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon="ri-list-check"
                  title="Aucun lot d'extraction"
                  description="Les lots sont créés automatiquement lors des extractions."
                />
              </div>
            ) : (
              <>
                <div className="table-responsive" style={{ overflow: "visible" }}>
                  <table className="table table-hover align-middle table-nowrap mb-0">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: 40 }}>
                          <div className="form-check">
                            <input className="form-check-input" type="checkbox" 
                              checked={selectedIds.length > 0 && selectedIds.length === paginated.length}
                              onChange={toggleSelectAll} 
                            />
                          </div>
                        </th>
                        <th>Développeur</th>
                        <th>Projet</th>
                        <th>Période</th>
                        <th>Type</th>
                        <th>Statut</th>
                        <th>Déclenché par</th>
                        <th>Début</th>
                        <th>Durée</th>
                        <th style={{ width: 60 }}>Actions</th>
                        <th>MD5</th>
                        <th style={{ width: 50 }}>DL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(lot => (
                        <>
                          <tr
                            key={lot.id}
                            style={{
                              background: lot.status === "failed"
                                ? "rgba(220,38,38,0.04)"
                                : lot.status === "running"
                                ? "rgba(6,182,212,0.03)"
                                : undefined,
                            }}
                          >
                            <td>
                              <div className="form-check">
                                <input className="form-check-input" type="checkbox"
                                  checked={selectedIds.includes(lot.id)}
                                  onChange={() => toggleSelectOne(lot.id)}
                                />
                              </div>
                            </td>
                            <td><DevCell lot={lot} /></td>
                            <td><ProjectCell lot={lot} projectName={getProjectName(lot)} /></td>
                            <td className="text-muted fs-13">{getPeriodLabel(lot)}</td>
                            <td><StatusBadge type="lotType" value={lot.extraction_type} /></td>
                            <td>
                              <StatusBadge type="lot" value={lot.status} />
                              {lot.status === "running" && lot.step_label && (
                                <div className="fs-11 mt-1 text-info text-truncate" style={{ maxWidth: 140 }}>
                                  <i className="ri-loader-4-line ri-spin me-1"></i>{lot.step_label}
                                </div>
                              )}
                            </td>
                            <td><TriggeredByCell lot={lot} /></td>
                            <td className="text-muted fs-12">{formatDate(lot.created_at)}</td>
                            <td className="text-muted fs-12">
                              {formatDuration(lot.created_at, lot.completed_at || (lot.status === "running" ? new Date() : null))}
                            </td>
                            <td><ActionsMenu lot={lot} navigate={navigate} /></td>
                            <td><Md5Cell lot={lot} /></td>
                            <td><DownloadButton lot={lot} /></td>
                          </tr>
                          <ErrorRow key={`err-${lot.id}`} lot={lot} colSpan={12} />
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-2">
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    totalItems={filtered.length}
                    perPage={perPage}
                    onPageChange={setPage}
                  />
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
