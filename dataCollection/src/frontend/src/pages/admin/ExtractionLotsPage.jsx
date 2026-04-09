/**
 * pages/admin/ExtractionLotsPage.jsx
 *
 * CORRECTIONS :
 *   1. FIX CRITIQUE — lot.type → lot.extraction_type (renommage modèle)
 *      AVANT : l.type !== typeFilter → filtre ne marche jamais (undefined !== "REALTIME")
 *              <StatusBadge value={lot.type}/> → affiche rien
 *      ✅ FIX : l.extraction_type partout.
 *
 *   2. FIX — mounted flag sur les deux useEffect
 *      → évite setState sur composant démonté (memory leak / warning React)
 */
import { useState, useEffect } from "react";
import { useNavigate }     from "react-router-dom";
import projectService       from "../../services/projectService";
import extractionLotService from "../../services/extractionLotService";
import periodService        from "../../services/periodService";
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

function DownloadButton({ lot }) {
  const [downloading, setDownloading] = useState(false);
  const [error,       setError]       = useState(null);

  if (!lot.md5sum) return <span className="text-muted fs-12">—</span>;

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
      a.download = `lot_${lot.id}_project_${lot.project_id}_period_${lot.period_id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-1">
      <div className="d-flex align-items-center gap-2">
        <code
          className="fs-11 text-muted"
          title={`MD5: ${lot.md5sum} — Cliquez pour copier`}
          style={{ cursor: "pointer" }}
          onClick={() => navigator.clipboard.writeText(lot.md5sum)}>
          {lot.md5sum.slice(0, 8)}…
        </code>
        <button
          className="btn btn-sm btn-soft-success py-0 px-2"
          onClick={handleDownload}
          disabled={downloading}
          style={{ fontSize: "11px" }}>
          {downloading
            ? <span className="spinner-border spinner-border-sm"></span>
            : <><i className="ri-download-2-line me-1"></i>DL</>
          }
        </button>
      </div>
      {error && (
        <span className="text-danger fs-11">
          <i className="ri-error-warning-line me-1"></i>{error}
        </span>
      )}
    </div>
  );
}

export default function ExtractionLotsPage() {
  const navigate = useNavigate();
  const [lots,         setLots]         = useState([]);
  const [projects,     setProjects]     = useState([]);
  const [periods,      setPeriods]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [projFilter,   setProjFilter]   = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  // ✅ FIX : typeFilter compare sur extraction_type (pas type)
  const [typeFilter,   setTypeFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page,         setPage]         = useState(1);
  const perPage = 12;

  // ✅ FIX : mounted flag — évite setState sur composant démonté
  useEffect(() => {
    let mounted = true;
    Promise.all([projectService.getAll(), periodService.getAll()])
      .then(([projs, pers]) => {
        if (!mounted) return;
        setProjects(projs);
        setPeriods(pers);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  // ✅ FIX : Polling live si un lot est "running"
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

          // Si des lots sont en cours, activer le polling
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

    return () => { 
      mounted = false; 
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [projFilter, periodFilter]);

  const filtered = lots.filter(l => {
    // ✅ FIX : extraction_type au lieu de type
    if (typeFilter   !== "all" && l.extraction_type !== typeFilter)   return false;
    if (statusFilter !== "all" && l.status          !== statusFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  const totalLots     = lots.length;
  const completedLots = lots.filter(l => l.status === "completed").length;
  const failedLots    = lots.filter(l => l.status === "failed").length;
  const runningLots   = lots.filter(l => l.status === "running").length;

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

  const getTriggeredBy = (lot) => {
    if (lot.triggered_by_user?.email) return lot.triggered_by_user.email;
    if (lot.triggered_by_user?.name)  return lot.triggered_by_user.name;
    if (lot.triggered_by)             return `User #${lot.triggered_by}`;
    return <span className="badge bg-info-subtle text-info">Scheduler</span>;
  };

  return (
    <div className="page-content">
      <div className="container-fluid">

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

        {/* Stats */}
        <div className="row mb-4">
          {[
            { label: "Total Lots",   value: totalLots,     color: "primary", icon: "ri-list-check"             },
            { label: "Complétés",    value: completedLots, color: "success", icon: "ri-checkbox-circle-line"   },
            { label: "En erreur",    value: failedLots,    color: "danger",  icon: "ri-close-circle-line"      },
            { label: "En cours",     value: runningLots,   color: "info",    icon: "ri-loader-4-line"          },
          ].map((s, i) => (
            <div key={i} className="col-xl-3 col-sm-6">
              <div className="card card-animate">
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
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div className="card mb-3">
          <div className="card-body py-3">
            <div className="row g-2">
              <div className="col-md-3">
                <label className="form-label fs-12 text-muted fw-semibold mb-1">
                  <i className="ri-folder-2-line me-1"></i>Projet
                </label>
                <select className="form-select form-select-sm" value={projFilter}
                  onChange={e => setProjFilter(e.target.value)}>
                  <option value="">Tous les projets</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-md-3">
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
              <div className="col-md-2 d-flex align-items-end">
                <button className="btn btn-sm btn-light w-100"
                  onClick={() => {
                    setProjFilter(""); setPeriodFilter("");
                    setTypeFilter("all"); setStatusFilter("all"); setPage(1);
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
              <i className="ri-list-check me-2 text-primary"></i>Lots ({filtered.length})
            </h5>
            <span className="text-muted fs-12">
              <i className="ri-information-line me-1 text-info"></i>
              MD5 cliquable pour copier · DL pour télécharger le dump JSON
            </span>
          </div>
          <div className="card-body">
            {loading ? (
              <LoadingSpinner text="Chargement des lots..." />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon="ri-list-check"
                title="Aucun lot d'extraction"
                description="Les lots sont créés automatiquement lors des extractions."
              />
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover align-middle table-nowrap mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>ID</th>
                        <th>Projet</th>
                        <th>Période</th>
                        <th>Type</th>
                        <th>Statut</th>
                        <th>Déclenché par</th>

                        <th>Début</th>
                        <th>Durée</th>
                        <th>Actions</th>
                        <th>MD5 / Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(lot => (
                        <tr key={lot.id}>
                          <td className="text-muted fs-12 fw-semibold">#{lot.id}</td>
                          <td><span className="fw-medium fs-13">{getProjectName(lot)}</span></td>
                          <td className="text-muted fs-13">{getPeriodLabel(lot)}</td>
                          <td>
                            {/* ✅ FIX : extraction_type au lieu de type */}
                            <StatusBadge type="lotType" value={lot.extraction_type} />
                          </td>
                          <td>
                            <StatusBadge type="lot" value={lot.status} />
                            {lot.status === "running" && lot.step_label && (
                              <div className="fs-11 mt-1 text-info text-truncate" style={{maxWidth: 150}}>
                                <i className="ri-loader-4-line ri-spin me-1"></i>{lot.step_label}
                              </div>
                            )}
                          </td>
                          <td className="text-muted fs-12">{getTriggeredBy(lot)}</td>
                          <td className="text-muted fs-12">{formatDate(lot.created_at)}</td>
                          <td className="text-muted fs-12">
                            {formatDuration(lot.created_at, lot.completed_at || (lot.status==="running" ? new Date() : null))}
                          </td>
                          <td>
                            <div className="d-flex gap-1">
                              <button 
                                className="btn btn-sm btn-soft-primary px-2 py-1" 
                                title="Voir les Merge Requests"
                                onClick={() => navigate(`/merge-requests?project_id=${lot.project_id}&lot_id=${lot.id}`)}
                                disabled={lot.status !== "completed"}
                              >
                                <i className="ri-git-merge-line"></i> MRs
                              </button>
                              <button 
                                className="btn btn-sm btn-soft-info px-2 py-1" 
                                title="Voir les Commits"
                                onClick={() => navigate(`/commits?project_id=${lot.project_id}&lot_id=${lot.id}`)}
                                disabled={lot.status !== "completed"}
                              >
                                <i className="ri-git-commit-line"></i> Commits
                              </button>
                              <button 
                                className="btn btn-sm btn-soft-success px-2 py-1" 
                                title="Explorer le Dashboard"
                                onClick={() => navigate(`/dashboard?project_id=${lot.project_id}&lot_id=${lot.id}`)}
                                disabled={lot.status !== "completed"}
                              >
                                <i className="ri-dashboard-2-line"></i>
                              </button>
                              <button 
                                className="btn btn-sm btn-soft-warning px-2 py-1" 
                                title="Explorer le Hub Talent"
                                onClick={() => navigate(`/developers?project_id=${lot.project_id}&lot_id=${lot.id}`)}
                                disabled={lot.status !== "completed"}
                              >
                                <i className="ri-team-line"></i>
                              </button>
                            </div>
                          </td>
                          <td><DownloadButton lot={lot} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={filtered.length}
                  perPage={perPage}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
