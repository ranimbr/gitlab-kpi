/**
 * pages/AlertsPage.jsx
 *
 * CORRECTIONS :
 *   - alert.kpi_label || alert.kpi_name || alert.kpi_code : fallback complet
 *   - alert.level lowercase normalisé (backend peut renvoyer WARNING ou warning)
 *   - showToast → useCallback ✅ (déjà correct, conservé)
 *   - AlertCard : affichage kpi_value avec toFixed safe
 *
 * AMÉLIORATIONS DESIGN :
 *   - Cards avec border-left coloré selon niveau
 *   - Timeline view : badge niveau bien visible
 *   - Summary cards cliquables avec animation
 *   - Banner critique en haut quand alertes critiques actives
 *   - Empty state différencié selon filtres actifs vs aucune alerte
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import alertService   from "../services/alertService";
import projectService from "../services/projectService";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState     from "../components/common/EmptyState";
import Pagination     from "../components/common/Pagination";

// ── Config niveaux — normalise majuscules/minuscules du backend ───────────────
const LEVEL_CFG = {
  WARNING:  { color: "warning", bg: "#fffbeb", border: "#fcd34d", icon: "ri-alert-line",        label: "Warning"  },
  CRITICAL: { color: "danger",  bg: "#fff1f0", border: "#fecaca", icon: "ri-close-circle-line",  label: "Critical" },
};
const getLevelCfg = (level) => LEVEL_CFG[String(level || "").toUpperCase()] || LEVEL_CFG.WARNING;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function timeAgo(d) {
  if (!d) return "—";
  const diff = Math.floor((Date.now() - new Date(d)) / 1000);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

// ✅ FIX : fallback complet pour le nom du KPI
function getKpiLabel(alert) {
  return alert.kpi_label || alert.kpi_name || alert.kpi_code || "KPI inconnu";
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`alert alert-${toast.type} d-flex align-items-center gap-2 position-fixed top-0 end-0 m-3`}
      style={{ zIndex: 9999, minWidth: 320, borderRadius: 12, border: "none", boxShadow: "0 8px 32px rgba(0,0,0,.12)" }}>
      <i className={`${toast.type === "success" ? "ri-checkbox-circle-line" : "ri-error-warning-line"} fs-16`}></i>
      <span className="fs-13 fw-medium">{toast.msg}</span>
    </div>
  );
}

// ── AlertCard ─────────────────────────────────────────────────────────────────
function AlertCard({ alert, isAdmin, onAck, onResolve }) {
  const cfg        = getLevelCfg(alert.level);
  const isAcked    = !!alert.acknowledged_at;
  const isResolved = !!alert.resolved_at;

  // ✅ FIX : toFixed safe — kpi_value peut être null ou string
  const valueDisplay = alert.kpi_value != null && !isNaN(Number(alert.kpi_value))
    ? Number(alert.kpi_value).toFixed(2)
    : "—";

  return (
    <div className={`card border-0 mb-0 ${isResolved ? "opacity-60" : ""}`}
      style={{
        borderLeft: `4px solid ${isResolved ? "#d1d5db" : cfg.border} !important`,
        boxShadow: "0 1px 4px rgba(0,0,0,.06)",
        borderRadius: 12,
        background: isResolved ? "#fafbfc" : cfg.bg,
        transition: "all .2s",
      }}>
      <div className="card-body py-3 px-4">
        <div className="d-flex align-items-start gap-3">
          {/* Icône niveau */}
          <div className={`d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 bg-${cfg.color}-subtle`}
            style={{ width: 44, height: 44 }}>
            <i className={`${cfg.icon} text-${cfg.color} fs-20`}></i>
          </div>

          {/* Contenu */}
          <div className="flex-grow-1 min-w-0">
            <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
              <span className={`badge fw-semibold fs-11 bg-${cfg.color}-subtle text-${cfg.color}`}
                style={{ border: `1px solid ${cfg.border}` }}>
                <i className={`${cfg.icon} me-1`}></i>{cfg.label}
              </span>
              <span className="badge fs-11" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                <i className="ri-bar-chart-line me-1"></i>{getKpiLabel(alert)}
              </span>
              {isResolved && (
                <span className="badge fs-11" style={{ background: "#dcfce7", color: "#15803d" }}>
                  <i className="ri-checkbox-circle-line me-1"></i>Résolu
                </span>
              )}
              {!isResolved && isAcked && (
                <span className="badge fs-11" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                  <i className="ri-eye-line me-1"></i>Acquitté
                </span>
              )}
            </div>

            <div className="row g-2">
              <div className="col-sm-6">
                <p className="text-muted mb-1 fs-12">
                  <i className="ri-folder-2-line me-1"></i>
                  <strong>Projet :</strong> {alert.project?.name || `#${alert.project_id}`}
                </p>
                {alert.site?.name && (
                  <p className="text-muted mb-1 fs-12">
                    <i className="ri-map-pin-line me-1"></i>
                    <strong>Site :</strong> {alert.site.name}
                  </p>
                )}
              </div>
              <div className="col-sm-6">
                <div className="d-flex align-items-center gap-3 fs-12">
                  <span className={`fw-bold text-${cfg.color} fs-18`}>{valueDisplay}</span>
                  {alert.threshold_value != null && (
                    <span className="text-muted">
                      seuil : <strong>{alert.threshold_value}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="d-flex align-items-center gap-3 mt-2 fs-11 text-muted">
              <span>
                <i className="ri-time-line me-1"></i>
                {timeAgo(alert.triggered_at)} ({fmtDate(alert.triggered_at)})
              </span>
              {isAcked && alert.acknowledged_by && (
                <span><i className="ri-eye-line me-1"></i>Acquitté par #{alert.acknowledged_by}</span>
              )}
            </div>
          </div>

          {/* Actions */}
          {!isResolved && (
            <div className="d-flex flex-column gap-1 flex-shrink-0">
              {!isAcked && (
                <button className="btn btn-sm btn-soft-info" onClick={() => onAck(alert.id, false)}>
                  <i className="ri-eye-line me-1"></i>Acquitter
                </button>
              )}
              {isAdmin && (
                <button className="btn btn-sm btn-soft-success" onClick={() => onResolve(alert.id)}>
                  <i className="ri-checkbox-circle-line me-1"></i>Résoudre
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AlertsPage() {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const isAdmin    = user?.role === "admin";

  const [alerts,        setAlerts]        = useState([]);
  const [summary,       setSummary]       = useState(null);
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [levelFilter,   setLevelFilter]   = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [showResolved,  setShowResolved]  = useState(false);
  const [page,          setPage]          = useState(1);
  const [toast,         setToast]         = useState(null);
  const perPage = 10;

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

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
    } catch {
      showToast("Erreur lors du chargement des alertes.", "danger");
    } finally {
      setLoading(false);
    }
  }, [showResolved, showToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [levelFilter, projectFilter, showResolved]);

  const handleAck = useCallback(async (alertId) => {
    try { await alertService.acknowledge(alertId, false); showToast("Alerte acquittée."); load(); }
    catch { showToast("Erreur.", "danger"); }
  }, [load, showToast]);

  const handleResolve = useCallback(async (alertId) => {
    try { await alertService.resolve(alertId); showToast("Alerte résolue."); load(); }
    catch { showToast("Erreur.", "danger"); }
  }, [load, showToast]);

  const filtered = useMemo(() => alerts.filter(a => {
    // ✅ FIX : normalise les niveaux pour la comparaison
    const level = String(a.level || "").toUpperCase();
    const mLevel   = levelFilter === "all" || level === levelFilter;
    const mProject = projectFilter === "all" || String(a.project_id) === projectFilter;
    return mLevel && mProject;
  }), [alerts, levelFilter, projectFilter]);

  const totalPages    = Math.ceil(filtered.length / perPage);
  const paginated     = filtered.slice((page - 1) * perPage, page * perPage);
  const criticalCount = alerts.filter(a => String(a.level).toUpperCase() === "CRITICAL" && !a.resolved_at).length;
  const warningCount  = alerts.filter(a => String(a.level).toUpperCase() === "WARNING"  && !a.resolved_at).length;
  const hasFilters    = levelFilter !== "all" || projectFilter !== "all";

  return (
    <div className="page-content">
      <div className="container-fluid">
        <Toast toast={toast} />

        {/* Header */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <div>
                <h4 className="mb-1 fw-semibold">
                  <i className="ri-alarm-warning-line me-2 text-warning"></i>Alertes KPI
                  {criticalCount > 0 && (
                    <span className="badge ms-2 fs-12" style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" }}>
                      {criticalCount} critical
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="badge ms-1 fs-12" style={{ background: "#fef9c3", color: "#a16207", border: "1px solid #fcd34d" }}>
                      {warningCount} warning
                    </span>
                  )}
                </h4>
                <p className="text-muted fs-13 mb-0">
                  {alerts.length} alerte{alerts.length !== 1 ? "s" : ""} au total
                  {showResolved ? " · incluant les résolues" : " · actives uniquement"}
                </p>
              </div>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item active">Alertes KPI</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Banner critique */}
        {criticalCount > 0 && (
          <div className="d-flex align-items-center gap-3 rounded-3 p-3 mb-4"
            style={{ background: "#fff1f0", border: "1px solid #fecaca" }}>
            <i className="ri-close-circle-line fs-4 flex-shrink-0 text-danger"></i>
            <div className="flex-grow-1">
              <strong style={{ color: "#b91c1c" }}>
                {criticalCount} alerte{criticalCount > 1 ? "s" : ""} critique{criticalCount > 1 ? "s" : ""} active{criticalCount > 1 ? "s" : ""}
              </strong>
              <span className="text-muted fs-13 ms-2">— Des KPIs ont dépassé les seuils critiques. Intervention requise.</span>
            </div>
            <button className="btn btn-sm btn-danger flex-shrink-0"
              onClick={() => setLevelFilter("CRITICAL")}>
              <i className="ri-filter-line me-1"></i>Voir les critiques
            </button>
          </div>
        )}

        {/* Stats cards */}
        {summary && (
          <div className="row g-3 mb-4">
            {[
              { label: "Alertes actives",  value: summary.total_active   || 0, color: "#3577f1", bg: "#eff6ff", icon: "ri-alarm-warning-line",   fn: () => { setLevelFilter("all");      setShowResolved(false); } },
              { label: "Critical",         value: summary.total_critical || 0, color: "#b91c1c", bg: "#fff1f0", icon: "ri-close-circle-line",     fn: () => { setLevelFilter("CRITICAL"); setShowResolved(false); } },
              { label: "Warning",          value: summary.total_warning  || 0, color: "#a16207", bg: "#fffbeb", icon: "ri-alert-line",            fn: () => { setLevelFilter("WARNING");  setShowResolved(false); } },
              { label: "Résolues",         value: summary.total_resolved || 0, color: "#15803d", bg: "#f0fdf4", icon: "ri-checkbox-circle-line",  fn: () => { setShowResolved(true);  setLevelFilter("all"); } },
            ].map((s, i) => (
              <div key={i} className="col-xl-3 col-sm-6">
                <div className="card border-0 h-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)", cursor: "pointer" }}
                  onClick={() => { s.fn(); setPage(1); }}>
                  <div className="card-body d-flex align-items-center gap-3">
                    <div className="d-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
                      style={{ width: 48, height: 48, background: s.bg }}>
                      <i className={`${s.icon} fs-22`} style={{ color: s.color }}></i>
                    </div>
                    <div>
                      <p className="text-muted fs-11 fw-semibold text-uppercase mb-1" style={{ letterSpacing: ".05em" }}>{s.label}</p>
                      <h3 className="fw-bold mb-0" style={{ color: s.color }}>{s.value}</h3>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filtres */}
        <div className="card border-0 mb-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div className="card-body py-3">
            <div className="d-flex gap-3 flex-wrap align-items-center">
              <div>
                <label className="form-label fs-12 text-muted fw-semibold mb-1">Niveau</label>
                <select className="form-select form-select-sm" style={{ width: "auto" }}
                  value={levelFilter} onChange={e => { setLevelFilter(e.target.value); setPage(1); }}>
                  <option value="all">Tous les niveaux</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="WARNING">Warning</option>
                </select>
              </div>
              <div>
                <label className="form-label fs-12 text-muted fw-semibold mb-1">Projet</label>
                <select className="form-select form-select-sm" style={{ width: "auto" }}
                  value={projectFilter} onChange={e => { setProjectFilter(e.target.value); setPage(1); }}>
                  <option value="all">Tous les projets</option>
                  {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
              </div>
              <div className="d-flex align-items-end">
                <div className="form-check form-switch mb-0 mt-3">
                  <input className="form-check-input" type="checkbox" id="showResolved"
                    checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
                  <label className="form-check-label fs-13" htmlFor="showResolved">
                    Afficher les résolues
                  </label>
                </div>
              </div>
              {hasFilters && (
                <div className="d-flex align-items-end">
                  <button className="btn btn-sm btn-soft-secondary mt-3"
                    onClick={() => { setLevelFilter("all"); setProjectFilter("all"); setPage(1); }}>
                    <i className="ri-close-line me-1"></i>Reset
                    <span className="badge bg-secondary-subtle text-secondary ms-1">{filtered.length}</span>
                  </button>
                </div>
              )}
              <div className="ms-auto d-flex align-items-end">
                <button className="btn btn-sm btn-soft-primary mt-3" onClick={load}>
                  <i className="ri-refresh-line me-1"></i>Rafraîchir
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Liste alertes */}
        <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div className="card-header bg-white d-flex align-items-center" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <h6 className="mb-0 fw-semibold flex-grow-1">
              <i className="ri-list-check me-2 text-warning"></i>
              Alertes ({filtered.length})
              {levelFilter !== "all" && (
                <span className={`badge ms-2 fs-11 bg-${getLevelCfg(levelFilter).color}-subtle text-${getLevelCfg(levelFilter).color}`}>
                  {getLevelCfg(levelFilter).label}
                </span>
              )}
            </h6>
            {isAdmin && (
              <span className="text-muted fs-12">
                <i className="ri-shield-user-line me-1"></i>Admin : vous pouvez résoudre les alertes
              </span>
            )}
          </div>
          <div className="card-body">
            {loading ? (
              <div className="py-5"><LoadingSpinner text="Chargement des alertes…" /></div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={criticalCount === 0 && warningCount === 0 ? "ri-shield-check-line" : "ri-filter-line"}
                title={criticalCount === 0 && warningCount === 0 ? "Aucune alerte active" : "Aucune alerte pour ces filtres"}
                description={
                  criticalCount === 0 && warningCount === 0
                    ? "Tous les KPIs sont dans les seuils normaux."
                    : "Essayez de modifier les filtres."
                }
              />
            ) : (
              <>
                <div className="vstack gap-2">
                  {paginated.map(alert => (
                    <AlertCard key={alert.id} alert={alert} isAdmin={isAdmin}
                      onAck={handleAck} onResolve={handleResolve} />
                  ))}
                </div>
                <div className="mt-3">
                  <Pagination page={page} totalPages={totalPages} totalItems={filtered.length}
                    perPage={perPage} onPageChange={setPage} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* CTA Thresholds */}
        {isAdmin && (
          <div className="rounded-3 p-4 mt-3 d-flex align-items-center justify-content-between"
            style={{ background: "linear-gradient(135deg, #405189 0%, #3577f1 100%)" }}>
            <div className="text-white">
              <h6 className="mb-1 fw-semibold">
                <i className="ri-settings-4-line me-1"></i>Configurer les seuils d'alerte
              </h6>
              <p className="mb-0 fs-12 opacity-75">
                Définissez les valeurs warning et critical pour chaque KPI.
              </p>
            </div>
            <button className="btn btn-sm btn-light flex-shrink-0 ms-3"
              onClick={() => navigate("/admin/kpi-thresholds")}>
              <i className="ri-alarm-warning-line me-1"></i>KPI Thresholds
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
