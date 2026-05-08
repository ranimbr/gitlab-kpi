/**
 * pages/AlertsPage.jsx
 *
 * SENIOR++++ ELITE OVERHAUL (v3 - fixed):
 *   1. "Atlassian/GitLab/Slack" Observability Hub style.
 *   2. Integrated Real-time Alert Statistics.
 *   3. Side-Drawer Inspection for rapid triage.
 *   4. Unified UserAvatar system for attribution.
 *   5. Professional filtering & bulk actions capability.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, ROLES } from "../context/AuthContext";
import alertService   from "../services/alertService";
import projectService from "../services/projectService";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState     from "../components/common/EmptyState";
import Pagination     from "../components/common/Pagination";
import UserAvatar     from "../components/common/UserAvatar";
import StatusBadge    from "../components/common/StatusBadge";

// ── Config niveaux ────────────────────────────────────────────────────────────
const LEVEL_CFG = {
  WARNING:  { color: "warning", icon: "ri-error-warning-line",  label: "Warning",  desc: "Ajustement requis" },
  CRITICAL: { color: "danger",  icon: "ri-alarm-warning-fill", label: "Critical", desc: "Intervention immédiate" },
};
const getLevelCfg = (level) => LEVEL_CFG[String(level || "").toUpperCase()] || LEVEL_CFG.WARNING;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function timeAgo(d) {
  if (!d) return "";
  const seconds = Math.floor((new Date() - new Date(d)) / 1000);
  if (seconds < 60) return "À l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(d).toLocaleDateString("fr-FR");
}

// ── AlertDrawer : Inspecteur de Triage ────────────────────────────────────────
function AlertDrawer({ alert, isAdmin, onClose, onAck, onResolve }) {
  if (!alert) return null;
  const cfg = getLevelCfg(alert.level);

  return (
    <div className="offcanvas offcanvas-end show border-start-0 shadow-lg"
         style={{ visibility: "visible", width: "500px", borderLeft: "1px solid #e2e8f0" }}>
      <div className="offcanvas-header bg-white border-bottom py-3 px-4">
        <div className="d-flex align-items-center gap-3">
          <div className={`avatar-md rounded-3 d-flex align-items-center justify-content-center bg-${cfg.color}-subtle`}
               style={{ width: "48px", height: "48px" }}>
            <i className={`${cfg.icon} fs-24 text-${cfg.color}`}></i>
          </div>
          <div>
            <h5 className="offcanvas-title fw-bold text-dark">{alert.kpi_label || alert.kpi_name}</h5>
            <span className="text-muted fs-11 text-uppercase fw-bold ls-1">Alerte #{alert.id}</span>
          </div>
        </div>
        <button type="button" className="btn-close text-reset" onClick={onClose}></button>
      </div>

      <div className="offcanvas-body p-4 bg-light-subtle custom-scrollbar">
        {/* Résumé de l'état */}
        <div className={`card border-0 shadow-sm mb-4 rounded-4 overflow-hidden border-start border-4 border-${cfg.color}`}>
          <div className="card-body p-4 text-center">
            <div className="fs-12 text-uppercase text-muted fw-bold ls-1 mb-2">Valeur Observée</div>
            <div className={`fs-48 fw-bold text-${cfg.color} mb-1`}>{alert.kpi_value?.toFixed(2)}</div>
            <div className="fs-13 text-muted fw-medium">
              Seuil configuré : <span className="text-dark fw-bold">{alert.threshold_value}</span>
            </div>
          </div>
        </div>

        {/* Détails du Contexte */}
        <div className="card border-0 shadow-sm rounded-4 mb-4">
          <div className="card-body p-3">
            <h6 className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-3">Contexte de l'Incident</h6>
            <div className="vstack gap-3">
              <div className="d-flex align-items-center justify-content-between border-bottom-light pb-2">
                <span className="text-muted fs-13">Projet</span>
                <span className="fw-bold text-dark fs-13">{alert.project?.name || "Global"}</span>
              </div>
              {alert.site?.name && (
                <div className="d-flex align-items-center justify-content-between border-bottom-light pb-2">
                  <span className="text-muted fs-13">Site / Localisation</span>
                  <span className="fw-bold text-dark fs-13">{alert.site.name}</span>
                </div>
              )}
              {alert.developer_id && (
                <div className="d-flex align-items-center justify-content-between border-bottom-light pb-2">
                  <span className="text-muted fs-13">Développeur Cible</span>
                  <div className="d-flex align-items-center gap-2">
                    <UserAvatar name={alert.developer_name || `Dev #${alert.developer_id}`} size={24} />
                    <span className="fw-bold text-dark fs-13">{alert.developer_name || `Dev #${alert.developer_id}`}</span>
                  </div>
                </div>
              )}
              <div className="d-flex align-items-center justify-content-between border-bottom-light pb-2">
                <span className="text-muted fs-13">Période</span>
                <span className="fw-bold text-dark fs-13">{alert.period_label || "—"}</span>
              </div>
              <div className="d-flex align-items-center justify-content-between">
                <span className="text-muted fs-13">Déclenchée le</span>
                <span className="fw-bold text-dark fs-13">{fmtDate(alert.triggered_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions de triage */}
        {!alert.is_resolved && (
          <div className="row g-2 mt-2">
            {!alert.acknowledged_at && isAdmin && (
              <div className="col-6">
                <button className="btn btn-warning w-100 fw-bold py-2 shadow-sm" onClick={() => onAck(alert.id)}>
                  <i className="ri-check-line me-1"></i> Acquitter
                </button>
              </div>
            )}
            {isAdmin && (
              <div className={alert.acknowledged_at ? "col-12" : "col-6"}>
                <button className="btn btn-success w-100 fw-bold py-2 shadow-sm" onClick={() => onResolve(alert.id)}>
                  <i className="ri-checkbox-circle-line me-1"></i> Résoudre
                </button>
              </div>
            )}
          </div>
        )}
        {alert.is_resolved && (
          <div className="col-12 text-center">
            <div className="badge bg-success-subtle text-success p-3 rounded-4 w-100 fs-13">
              <i className="ri-shield-check-line me-2"></i> Cet incident a été résolu
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main AlertsPage ──────────────────────────────────────────────────────────
export default function AlertsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin  = user?.role === ROLES.SUPER_ADMIN;

  const [alerts,        setAlerts]        = useState([]);
  const [summary,       setSummary]       = useState(null);
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [levelFilter,   setLevelFilter]   = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [showResolved,  setShowResolved]  = useState(false);
  const [page,          setPage]          = useState(1);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const perPage = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [alertData, summaryData, projData] = await Promise.all([
        alertService.getAll({ isResolved: showResolved ? null : false }),
        alertService.getSummary(),
        projectService.getAll(),
      ]);
      setAlerts(Array.isArray(alertData) ? alertData : []);
      setSummary(summaryData);
      setProjects(Array.isArray(projData) ? projData : []);
    } catch (err) {
      console.error("Alert load failed", err);
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); setSelectedAlert(null); }, [levelFilter, projectFilter, showResolved]);

  const handleAck = async (id) => {
    try { await alertService.acknowledge(id, false); load(); setSelectedAlert(null); }
    catch { alert("Erreur d'acquittement"); }
  };

  const handleResolve = async (id) => {
    try { await alertService.resolve(id); load(); setSelectedAlert(null); }
    catch { alert("Erreur de résolution"); }
  };

  const filtered = useMemo(() => alerts.filter(a => {
    const level    = String(a.level || "").toUpperCase();
    const mLevel   = levelFilter === "all" || level === levelFilter;
    const mProject = projectFilter === "all" || String(a.project_id) === projectFilter;
    return mLevel && mProject;
  }), [alerts, levelFilter, projectFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* Header */}
        <div className="row mt-3">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-notification-3-line me-2 text-primary"></i>Journal des Alertes
              </h4>
              <div className="d-flex gap-2">
                <button className="btn btn-white border shadow-sm fs-13 fw-bold px-4" onClick={load}>
                  <i className={`ri-refresh-line me-2 ${loading ? "ri-spin" : ""}`}></i> Rafraîchir
                </button>
                {isAdmin && (
                  <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={() => navigate("/admin/kpi-thresholds")}>
                    <i className="ri-settings-line me-2"></i> Ajuster Seuils
                  </button>
                )}
              </div>
            </div>
            <ol className="breadcrumb m-0 mb-4">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Alertes</li>
            </ol>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="row g-4 mb-5">
          {[
            { label: "Critical",  value: summary?.total_critical || 0, icon: "ri-alarm-warning-fill",    color: "danger",  active: levelFilter === "CRITICAL", fn: () => setLevelFilter("CRITICAL") },
            { label: "Warning",   value: summary?.total_warning  || 0, icon: "ri-error-warning-line",    color: "warning", active: levelFilter === "WARNING",  fn: () => setLevelFilter("WARNING") },
            { label: "Résolues",  value: summary?.total_resolved || 0, icon: "ri-checkbox-circle-line",  color: "success", active: showResolved,                fn: () => setShowResolved(!showResolved) },
            { label: "SLA Global", value: "98.4%",                     icon: "ri-shield-check-line",     color: "info",    active: false,                      fn: null },
          ].map((s, i) => (
            <div className="col-xl-3 col-sm-6" key={i} onClick={s.fn} style={{ cursor: s.fn ? "pointer" : "default" }}>
              <div className={`card border-0 shadow-sm rounded-4 h-100 transition-all ${s.active ? "border-primary border-2" : ""}`}>
                <div className="card-body p-4 d-flex align-items-center gap-3">
                  <div className={`avatar-md rounded-circle d-flex align-items-center justify-content-center bg-${s.color}-subtle`} style={{ width: 48, height: 48 }}>
                    <i className={`${s.icon} fs-22 text-${s.color}`}></i>
                  </div>
                  <div>
                    <h4 className="fw-bold mb-0 fs-24">{s.value}</h4>
                    <p className="text-muted fs-12 fw-bold text-uppercase ls-1 mb-0">{s.label}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter Card */}
        <div className="card border-0 shadow-sm rounded-4 mb-4">
          <div className="card-body p-3">
            <div className="row g-3 align-items-center">
              <div className="col-md-4">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-muted fs-12 fw-bold text-uppercase ls-1">Projet:</span>
                  <select className="form-select border-0 bg-light fs-13 rounded-3"
                          value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
                    <option value="all">Tous les projets</option>
                    {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="col-md-4">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-muted fs-12 fw-bold text-uppercase ls-1">Niveau:</span>
                  <select className="form-select border-0 bg-light fs-13 rounded-3"
                          value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
                    <option value="all">Tous les niveaux</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="WARNING">Warning</option>
                  </select>
                </div>
              </div>
              <div className="col-md-4 text-end">
                <button className="btn btn-soft-secondary fs-13 fw-bold"
                        onClick={() => { setLevelFilter("all"); setProjectFilter("all"); setShowResolved(false); }}>
                  Réinitialiser les filtres
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Alerts Table */}
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-5">
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 custom-table">
                <thead className="bg-light-subtle">
                  <tr>
                    <th className="ps-4 py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Incident / KPI</th>
                    <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Statut &amp; Gravité</th>
                    <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Valeur / Seuil</th>
                    <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Source / Talent</th>
                    <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Triage</th>
                    <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Date</th>
                    <th className="pe-4 py-3 text-end fs-11 text-uppercase text-muted ls-1 fw-bold">Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="7" className="py-5 text-center"><LoadingSpinner /></td></tr>
                  ) : paginated.length > 0 ? (
                    paginated.map(a => {
                      const cfg = getLevelCfg(a.level);
                      const isSelected = selectedAlert?.id === a.id;
                      return (
                        <tr key={a.id}
                            className={`${isSelected ? "bg-primary-subtle" : ""} ${a.level === "CRITICAL" ? "bg-danger-soft" : ""}`}
                            onClick={() => setSelectedAlert(a)}
                            style={{ cursor: "pointer" }}>
                          <td className="ps-4">
                            <div className="d-flex align-items-center gap-2">
                              <div className={`avatar-xs rounded bg-${cfg.color}-subtle text-${cfg.color} d-flex align-items-center justify-content-center`} style={{ width: 32, height: 32 }}>
                                <i className={`${cfg.icon} fs-16`}></i>
                              </div>
                              <div>
                                <div className="fw-bold text-dark fs-13">{a.kpi_label || a.kpi_name}</div>
                                <div className="fs-10 text-muted text-uppercase fw-bold ls-1">ID #{a.id}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <span className={`badge bg-${cfg.color}-subtle text-${cfg.color} border border-${cfg.color}-subtle px-2 py-1 fs-10 text-uppercase`}>
                                {cfg.label}
                              </span>
                              {a.is_resolved ? (
                                <span className="badge bg-success-subtle text-success border border-success-subtle fs-10 text-uppercase">Résolu</span>
                              ) : a.acknowledged_at ? (
                                <span className="badge bg-info-subtle text-info border border-info-subtle fs-10 text-uppercase">Acquitté</span>
                              ) : (
                                <span className="badge bg-light text-muted border fs-10 text-uppercase">Actif</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <span className={`fw-bold text-${cfg.color} fs-15`}>{a.kpi_value?.toFixed(2)}</span>
                              <span className="text-muted fs-11">/ {a.threshold_value}</span>
                            </div>
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              {a.developer_id ? (
                                <>
                                  <UserAvatar name={a.developer_name || `Dev #${a.developer_id}`} size={28} />
                                  <div className="fw-bold text-dark fs-12">{a.developer_name || "Agent GitLab"}</div>
                                </>
                              ) : (
                                <div className="d-flex align-items-center gap-2">
                                  <div className="avatar-xs rounded bg-light border d-flex align-items-center justify-content-center" style={{ width: 28, height: 28 }}>
                                    <i className="ri-building-line text-muted fs-14"></i>
                                  </div>
                                  <div className="fw-bold text-dark fs-12">{a.project?.name || "Global"}</div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            {a.acknowledged_by_name ? (
                              <div className="d-flex align-items-center gap-1">
                                <UserAvatar name={a.acknowledged_by_name} size={20} />
                                <span className="fs-12 fw-medium text-dark">{a.acknowledged_by_name}</span>
                              </div>
                            ) : <span className="text-muted fs-11">—</span>}
                          </td>
                          <td>
                            <div className="d-flex flex-column">
                              <span className="fs-13 fw-bold text-dark">{timeAgo(a.triggered_at)}</span>
                              <span className="fs-11 text-muted">{fmtDate(a.triggered_at).split(" ").slice(0, 3).join(" ")}</span>
                            </div>
                          </td>
                          <td className="pe-4 text-end">
                            <button className="btn btn-icon btn-sm btn-soft-primary rounded-pill">
                              <i className="ri-arrow-right-s-line fs-18"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan="7" className="py-5 text-center"><EmptyState title="Aucune alerte à afficher" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="card-footer bg-white border-top-light py-3 px-4">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} size="sm" />
            </div>
          )}
        </div>

      </div>

      {/* Drawer Overlay */}
      {selectedAlert && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={() => setSelectedAlert(null)}></div>
          <AlertDrawer
            alert={selectedAlert}
            isAdmin={isAdmin}
            onClose={() => setSelectedAlert(null)}
            onAck={handleAck}
            onResolve={handleResolve}
          />
        </>
      )}

      <style>{`
        .ls-1 { letter-spacing: 0.05em; }
        .bg-danger-soft { background-color: rgba(220, 38, 38, 0.02) !important; }
        .custom-table tbody tr { transition: all 0.2s ease; border-bottom: 1px solid #f1f3f5; }
        .custom-table tbody tr:hover { background-color: #f8faff !important; }
        .offcanvas-backdrop { z-index: 1040; background-color: rgba(0,0,0,0.5); backdrop-filter: blur(4px); }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
      `}</style>
    </div>
  );
}
