/**
 * pages/admin/KpiThresholdPage.jsx
 *
 * CORRECTIONS CRITIQUES :
 *   1. kpiThresholdService.getAll() n'existe pas → getByProject() + getByDashboard().
 *
 *   2. ThresholdModal.upsert() : signature (existingThresholds, payload) — 2 args requis.
 *
 *   3. handleEvaluate catch : reset alerts + alertFilter en cas d'erreur.
 *
 *   4. FIX — load() avait scopeId dans ses deps, déclenchant une boucle infinie :
 *      load() → setScopeId() → re-render → load() dépend de scopeId → load() re-exécuté…
 *      ✅ FIX : load() ne contient plus de side-effect setScopeId().
 *               La pré-sélection du premier projet est faite dans un useEffect séparé
 *               qui ne dépend que de [load] — s'exécute une seule fois au mount.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import kpiThresholdService  from "../../services/kpiThresholdService";
import kpiDefinitionService from "../../services/kpiDefinitionService";
import projectService       from "../../services/projectService";
import dashboardService     from "../../services/dashboardService";
import analyticsService     from "../../services/analyticsService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import Pagination     from "../../components/common/Pagination";

// ── Helpers ───────────────────────────────────────────────────────────────────
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

const LEVEL_CFG = {
  ok:       { color: "success",   bg: "#f0fdf4", border: "#bbf7d0", icon: "ri-checkbox-circle-line", label: "OK"       },
  warning:  { color: "warning",   bg: "#fffbeb", border: "#fcd34d", icon: "ri-alert-line",            label: "Warning"  },
  critical: { color: "danger",    bg: "#fff1f0", border: "#fecaca", icon: "ri-close-circle-line",     label: "Critical" },
  unknown:  { color: "secondary", bg: "#f8fafc", border: "#e9ecef", icon: "ri-question-line",         label: "—"        },
};

const KPI_SHORTCUTS = [
  { code: "MR_RATE_SITE",       label: "MR Rate / Site",        unit: "MR/dev",    dir: "higher" },
  { code: "APPROVED_MR_RATE",   label: "Approved MR Rate",      unit: "ratio",     dir: "higher" },
  { code: "MERGED_MR_RATE",     label: "Merged MR Rate",        unit: "ratio",     dir: "higher" },
  { code: "COMMIT_RATE_SITE",   label: "Commit Rate / Site",    unit: "commit/dev",dir: "higher" },
  { code: "NB_COMMITS_PROJECT", label: "NB Commits / Projet",   unit: "commits",   dir: "higher" },
  { code: "AVG_REVIEW_TIME",    label: "Temps moyen relecture", unit: "heures",    dir: "lower"  },
];

// ── ThresholdModal ─────────────────────────────────────────────────────────────
function ThresholdModal({ threshold, existingThresholds, kpiDefinitions, projects, dashboards, onClose, onSave }) {
  const isEdit = !!threshold?.id;
  const [form, setForm] = useState({
    kpi_definition_id: threshold?.kpi_definition_id || "",
    warning_value:     threshold?.warning_value  !== undefined ? String(threshold.warning_value)  : "",
    critical_value:    threshold?.critical_value !== undefined ? String(threshold.critical_value) : "",
    project_id:        threshold?.project_id    || "",
    dashboard_id:      threshold?.dashboard_id  || "",
    scope:             threshold?.dashboard_id ? "dashboard" : "project",
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && !loading) onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [loading, onClose]);

  const handle = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async () => {
    setError("");
    if (!form.kpi_definition_id)                return setError("Veuillez sélectionner un KPI.");
    if (form.warning_value  === "")             return setError("La valeur Warning est requise.");
    if (form.critical_value === "")             return setError("La valeur Critical est requise.");
    if (!form.project_id && !form.dashboard_id) return setError("Sélectionnez un projet ou un dashboard.");

    const wv = parseFloat(form.warning_value);
    const cv = parseFloat(form.critical_value);
    if (isNaN(wv) || isNaN(cv)) return setError("Les valeurs doivent être des nombres.");

    setLoading(true);
    try {
      const payload = {
        kpi_definition_id: parseInt(form.kpi_definition_id),
        warning_value:     wv,
        critical_value:    cv,
        project_id:        form.project_id   ? parseInt(form.project_id)   : null,
        dashboard_id:      form.dashboard_id ? parseInt(form.dashboard_id) : null,
      };
      // ✅ FIX: upsert(existingThresholds, payload) — 2 args requis
      await kpiThresholdService.upsert(existingThresholds, payload);
      onSave();
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  const selectedKpi = kpiDefinitions.find(k => String(k.id) === String(form.kpi_definition_id));

  return (
    <div className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,.22)" }}>

          <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
              style={{ width: 44, height: 44, background: "linear-gradient(135deg, #f7b84b, #f06548)" }}>
              <i className="ri-alarm-warning-line text-white fs-20"></i>
            </div>
            <div className="flex-grow-1">
              <h5 className="fw-semibold mb-0 fs-15">{isEdit ? "Modifier le seuil" : "Nouveau seuil KPI"}</h5>
              <p className="text-muted fs-12 mb-0">Définissez les valeurs Warning et Critical</p>
            </div>
            <button className="btn-close" onClick={onClose} disabled={loading} style={{ opacity: .4 }}></button>
          </div>

          <div className="px-4 py-4">
            {error && <div className="alert alert-danger d-flex gap-2 py-2 fs-13 mb-3"><i className="ri-error-warning-line"></i>{error}</div>}

            <div className="row g-3">
              {/* KPI */}
              <div className="col-12">
                <label className="form-label fw-medium fs-13">KPI <span className="text-danger">*</span></label>
                <select name="kpi_definition_id" className="form-select" value={form.kpi_definition_id}
                  onChange={handle} disabled={isEdit}>
                  <option value="">— Sélectionner un KPI —</option>
                  {kpiDefinitions.map(k => <option key={k.id} value={k.id}>{k.code} — {k.label}</option>)}
                </select>
                {selectedKpi && (
                  <div className="form-text mt-1 fs-12">
                    Unité : <strong>{selectedKpi.unit || "—"}</strong>
                    {selectedKpi.formula_description && <span className="ms-2 text-muted">· {selectedKpi.formula_description}</span>}
                  </div>
                )}
              </div>

              {/* Scope */}
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Périmètre <span className="text-danger">*</span></label>
                <div className="d-flex gap-2 mb-2">
                  {[
                    { key: "project",   label: "Projet",    icon: "ri-folder-2-line"   },
                    { key: "dashboard", label: "Dashboard", icon: "ri-layout-grid-line" },
                  ].map(scope => (
                    <div key={scope.key}
                      className="flex-fill p-2 rounded-3 border text-center"
                      style={{
                        cursor: "pointer",
                        background:   form.scope === scope.key ? "#eff6ff" : "#fff",
                        borderColor:  form.scope === scope.key ? "#93c5fd" : "#e9ecef",
                        transition:   "all .2s",
                      }}
                      onClick={() => setForm(f => ({ ...f, scope: scope.key, project_id: "", dashboard_id: "" }))}>
                      <i className={`${scope.icon} d-block fs-18 mb-1 ${form.scope === scope.key ? "text-primary" : "text-muted"}`}></i>
                      <span className={`fs-12 fw-semibold ${form.scope === scope.key ? "text-primary" : "text-muted"}`}>{scope.label}</span>
                    </div>
                  ))}
                </div>
                {form.scope === "project" && (
                  <select name="project_id" className="form-select" value={form.project_id} onChange={handle}>
                    <option value="">— Sélectionner un projet —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                {form.scope === "dashboard" && (
                  <select name="dashboard_id" className="form-select" value={form.dashboard_id} onChange={handle}>
                    <option value="">— Sélectionner un dashboard —</option>
                    {dashboards.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                )}
              </div>

              {/* Warning + Critical */}
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">
                  <span className="badge me-1" style={{ background: "#fef9c3", color: "#a16207", border: "1px solid #fcd34d" }}>Warning</span>
                  Valeur <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <input type="number" name="warning_value" className="form-control" step="any"
                    value={form.warning_value} onChange={handle} placeholder="ex: 0.5" />
                  {selectedKpi?.unit && <span className="input-group-text text-muted fs-12">{selectedKpi.unit}</span>}
                </div>
              </div>

              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">
                  <span className="badge me-1" style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" }}>Critical</span>
                  Valeur <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <input type="number" name="critical_value" className="form-control" step="any"
                    value={form.critical_value} onChange={handle} placeholder="ex: 0.2" />
                  {selectedKpi?.unit && <span className="input-group-text text-muted fs-12">{selectedKpi.unit}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2 px-4 py-3"
            style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-warning px-4 fw-semibold" onClick={submit} disabled={loading}>
              {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement…</> : <><i className="ri-save-line me-1"></i>{isEdit ? "Mettre à jour" : "Créer le seuil"}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function KpiThresholdPage() {
  // Données
  const [thresholds,     setThresholds]     = useState([]);
  const [kpiDefinitions, setKpiDefinitions] = useState([]);
  const [projects,       setProjects]       = useState([]);
  const [dashboards,     setDashboards]     = useState([]);
  const [loading,        setLoading]        = useState(true);

  // Scope courant pour charger les seuils
  const [scopeMode, setScopeMode] = useState("project");
  const [scopeId,   setScopeId]   = useState("");

  // Évaluation
  const [evaluateProjectId, setEvaluateProjectId] = useState("");
  const [alerts,            setAlerts]            = useState([]);
  const [alertFilter,       setAlertFilter]       = useState("all");
  const [evaluating,        setEvaluating]        = useState(false);
  const [evaluated,         setEvaluated]         = useState(false);

  // UI
  const [modalThreshold, setModalThreshold] = useState(null);
  const [deleteTarget,   setDeleteTarget]   = useState(null);
  const [deleteLoading,  setDeleteLoading]  = useState(false);
  const [search,         setSearch]         = useState("");
  const [page,           setPage]           = useState(1);
  const perPage = 10;

  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ✅ FIX : load() sans scopeId dans les deps — pas de side-effect setScopeId ici
  //          Retourne les projData pour que le useEffect de pré-sélection les lise
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kpiData, projData, dashData] = await Promise.all([
        kpiDefinitionService.getAll(),
        projectService.getAll(),
        dashboardService.getMyDashboards(),
      ]);
      setKpiDefinitions(Array.isArray(kpiData)  ? kpiData  : []);
      setProjects      (Array.isArray(projData)  ? projData : []);
      setDashboards    (Array.isArray(dashData)  ? dashData : []);
      return projData; // retourner les données pour la pré-sélection
    } catch {
      showToast("Erreur lors du chargement.", "danger");
      return [];
    } finally {
      setLoading(false);
    }
  }, [showToast]); // ✅ FIX : scopeId intentionnellement absent des deps

  // ✅ FIX : pré-sélection dans un useEffect séparé — s'exécute une seule fois au mount
  useEffect(() => {
    load().then(projData => {
      if (projData?.length) {
        setScopeId(String(projData[0].id));
      }
    });
  }, [load]); // [load] stable grâce à useCallback sans scopeId

  // ✅ FIX : loadThresholds ne dépend pas de load() — dépendances propres
  const loadThresholds = useCallback(async () => {
    if (!scopeId) { setThresholds([]); return; }
    try {
      const data = scopeMode === "project"
        ? await kpiThresholdService.getByProject(parseInt(scopeId))
        : await kpiThresholdService.getByDashboard(parseInt(scopeId));
      setThresholds(Array.isArray(data) ? data : []);
    } catch {
      setThresholds([]);
    }
  }, [scopeMode, scopeId]);

  useEffect(() => { loadThresholds(); }, [loadThresholds]);
  useEffect(() => { setPage(1); }, [search, scopeId]);

  const filteredThresholds = useMemo(() => {
    return thresholds.filter(t => {
      const kpi = kpiDefinitions.find(k => k.id === t.kpi_definition_id);
      const q   = search.toLowerCase();
      if (q && !(kpi?.code || "").toLowerCase().includes(q) && !(kpi?.label || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [thresholds, kpiDefinitions, search]);

  const totalPages = Math.ceil(filteredThresholds.length / perPage);
  const paginated  = filteredThresholds.slice((page - 1) * perPage, page * perPage);

  // ── Évaluation ─────────────────────────────────────────────────────────────
  const handleEvaluate = async () => {
    if (!evaluateProjectId) {
      showToast("Sélectionnez un projet d'abord.", "warning");
      return;
    }
    setEvaluating(true);
    try {
      const data = await kpiThresholdService.evaluate(parseInt(evaluateProjectId));
      setAlerts(Array.isArray(data) ? data : []);
      setAlertFilter("all");
      setEvaluated(true);
      showToast(`${Array.isArray(data) ? data.length : 0} KPI(s) analysés.`);
    } catch (err) {
      // ✅ FIX: reset propre en cas d'erreur
      setAlerts([]);
      setAlertFilter("all");
      setEvaluated(false);
      showToast(err.message || "Aucun snapshot KPI disponible.", "danger");
    } finally {
      setEvaluating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await kpiThresholdService.delete(deleteTarget.id);
      showToast("Seuil supprimé.");
      setDeleteTarget(null);
      await loadThresholds();
    } catch (err) {
      showToast(err.message || "Erreur lors de la suppression.", "danger");
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredAlerts = useMemo(() => {
    if (alertFilter === "all") return alerts;
    return alerts.filter(a => a.level === alertFilter);
  }, [alerts, alertFilter]);

  const alertCounts = useMemo(() => ({
    ok:       alerts.filter(a => a.level === "ok").length,
    warning:  alerts.filter(a => a.level === "warning").length,
    critical: alerts.filter(a => a.level === "critical").length,
  }), [alerts]);

  const getKpiInfo = (kpiDefId) => kpiDefinitions.find(k => k.id === kpiDefId);

  return (
    <div className="page-content">
      <div className="container-fluid">
        <Toast toast={toast} />

        {/* Header */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <div>
                <h4 className="mb-1 fw-semibold"><i className="ri-alarm-warning-line me-2 text-warning"></i>Seuils KPI</h4>
                <p className="text-muted fs-13 mb-0">Configurez les alertes Warning et Critical pour chaque indicateur</p>
              </div>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item">Administration</li>
                <li className="breadcrumb-item active">KPI Thresholds</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="row g-3 mb-4">
          {[
            { label: "Seuils configurés",  value: thresholds.length,                                                  color: "#f7b84b", bg: "#fffbeb", icon: "ri-alarm-warning-line" },
            { label: "KPIs couverts",      value: new Set(thresholds.map(t => t.kpi_definition_id)).size,             color: "#3577f1", bg: "#eff6ff", icon: "ri-bar-chart-line"     },
            { label: "Projets concernés",  value: new Set(thresholds.map(t => t.project_id).filter(Boolean)).size,    color: "#0ab39c", bg: "#f0fdf4", icon: "ri-folder-2-line"       },
            { label: "Dashboards couverts",value: new Set(thresholds.map(t => t.dashboard_id).filter(Boolean)).size,  color: "#6f42c1", bg: "#f5f3ff", icon: "ri-layout-grid-line"    },
          ].map((s, i) => (
            <div key={i} className="col-xl-3 col-sm-6">
              <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
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

        <div className="row">
          {/* Colonne liste seuils */}
          <div className="col-xl-8">

            {/* Sélecteur scope */}
            <div className="card border-0 mb-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
              <div className="card-body py-3">
                <div className="d-flex align-items-center gap-3 flex-wrap">
                  <div className="d-flex gap-2">
                    {["project", "dashboard"].map(mode => (
                      <button key={mode}
                        className={`btn btn-sm ${scopeMode === mode ? "btn-primary" : "btn-light"}`}
                        onClick={() => { setScopeMode(mode); setScopeId(""); setThresholds([]); }}>
                        <i className={`${mode === "project" ? "ri-folder-2-line" : "ri-layout-grid-line"} me-1`}></i>
                        {mode === "project" ? "Projet" : "Dashboard"}
                      </button>
                    ))}
                  </div>
                  <select className="form-select form-select-sm flex-grow-1" style={{ maxWidth: 280 }}
                    value={scopeId} onChange={e => setScopeId(e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {(scopeMode === "project" ? projects : dashboards).map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  {scopeId && (
                    <button className="btn btn-sm btn-warning ms-auto"
                      onClick={() => setModalThreshold({})}>
                      <i className="ri-add-line me-1"></i>Nouveau seuil
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
              <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
                <div className="d-flex align-items-center gap-2">
                  <div className="search-box flex-grow-1" style={{ maxWidth: 260 }}>
                    <input type="text" className="form-control form-control-sm"
                      placeholder="Rechercher un KPI…"
                      value={search} onChange={e => setSearch(e.target.value)} />
                    <i className="ri-search-line search-icon"></i>
                  </div>
                  <span className="text-muted fs-12 ms-auto">
                    {filteredThresholds.length} seuil{filteredThresholds.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              <div className="card-body p-0">
                {loading ? (
                  <div className="py-5"><LoadingSpinner text="Chargement…" /></div>
                ) : !scopeId ? (
                  <EmptyState icon="ri-alarm-warning-line" title="Sélectionnez un projet ou dashboard"
                    description="Choisissez le périmètre pour afficher et configurer les seuils KPI." compact />
                ) : filteredThresholds.length === 0 ? (
                  <EmptyState icon="ri-alarm-warning-line" title="Aucun seuil configuré"
                    description="Créez des seuils warning et critical pour déclencher des alertes automatiques."
                    actionLabel="Nouveau seuil" onAction={() => setModalThreshold({})} compact />
                ) : (
                  <>
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead style={{ background: "#fafbfc" }}>
                          <tr>
                            <th className="ps-4 py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>KPI</th>
                            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Warning</th>
                            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Critical</th>
                            <th className="pe-4 py-3 text-center text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map(t => {
                            const kpi = getKpiInfo(t.kpi_definition_id);
                            return (
                              <tr key={t.id}>
                                <td className="ps-4 py-3">
                                  <p className="fw-semibold mb-0 fs-13 font-monospace">{kpi?.code || `#${t.kpi_definition_id}`}</p>
                                  {kpi?.label && <p className="text-muted mb-0 fs-11">{kpi.label}</p>}
                                </td>
                                <td>
                                  <span className="badge fw-semibold fs-12"
                                    style={{ background: "#fef9c3", color: "#a16207", border: "1px solid #fcd34d" }}>
                                    <i className="ri-alert-line me-1"></i>{t.warning_value} {kpi?.unit || ""}
                                  </span>
                                </td>
                                <td>
                                  <span className="badge fw-semibold fs-12"
                                    style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" }}>
                                    <i className="ri-close-circle-line me-1"></i>{t.critical_value} {kpi?.unit || ""}
                                  </span>
                                </td>
                                <td className="pe-4 text-center">
                                  <div className="d-flex gap-1 justify-content-center">
                                    <button className="btn btn-sm btn-icon btn-soft-warning"
                                      onClick={() => setModalThreshold(t)}>
                                      <i className="ri-pencil-fill fs-14"></i>
                                    </button>
                                    <button className="btn btn-sm btn-icon btn-soft-danger"
                                      onClick={() => setDeleteTarget(t)}>
                                      <i className="ri-delete-bin-fill fs-14"></i>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-2" style={{ borderTop: "1px solid #f0f2f5" }}>
                      <Pagination page={page} totalPages={totalPages} totalItems={filteredThresholds.length} perPage={perPage} onPageChange={setPage} />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Shortcuts */}
            <div className="card border-0 mt-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
              <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
                <h6 className="mb-0 fw-semibold fs-13">
                  <i className="ri-flashlight-line me-2 text-warning"></i>Codes KPI officiels
                </h6>
              </div>
              <div className="card-body">
                <div className="row g-2">
                  {KPI_SHORTCUTS.map((kpi, i) => {
                    const kpiDef = kpiDefinitions.find(k => k.code === kpi.code);
                    return (
                      <div key={i} className="col-md-4">
                        <div className="rounded-3 p-3 h-100"
                          style={{ background: "#f8fafc", border: "1px solid #f0f2f5", cursor: "pointer", transition: "all .15s" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#bfdbfe"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#f0f2f5"; }}
                          onClick={() => kpiDef && setModalThreshold({ kpi_definition_id: kpiDef.id })}>
                          <div className="d-flex align-items-start justify-content-between mb-1">
                            <code className="fs-11 fw-bold text-primary">{kpi.code}</code>
                            <span className={`badge fs-10 ${kpi.dir === "lower" ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success"}`}>
                              {kpi.dir === "lower" ? "↓ min" : "↑ max"}
                            </span>
                          </div>
                          <p className="text-muted fs-12 mb-1 fw-medium">{kpi.label}</p>
                          <span className="badge bg-light text-muted border fs-10">{kpi.unit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Colonne évaluation */}
          <div className="col-xl-4">
            <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
              <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
                <h6 className="mb-0 fw-semibold"><i className="ri-play-circle-line me-2 text-success"></i>Évaluation temps réel</h6>
                <p className="text-muted fs-12 mb-0 mt-1">Testez les seuils sur le dernier snapshot KPI</p>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label fw-medium fs-13">Projet à évaluer</label>
                  <select className="form-select" value={evaluateProjectId}
                    onChange={e => { setEvaluateProjectId(e.target.value); setAlerts([]); setEvaluated(false); }}>
                    <option value="">— Sélectionner —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <button className="btn btn-success w-100 mb-3"
                  onClick={handleEvaluate}
                  disabled={evaluating || !evaluateProjectId}>
                  {evaluating
                    ? <><span className="spinner-border spinner-border-sm me-2"></span>Évaluation…</>
                    : <><i className="ri-play-circle-line me-2"></i>Lancer l'évaluation</>
                  }
                </button>

                {evaluated && (
                  <>
                    {alerts.length > 0 ? (
                      <>
                        <div className="d-flex gap-1 mb-3 flex-wrap">
                          {[
                            { key: "all",      label: `Tous (${alerts.length})`,             color: "secondary" },
                            { key: "critical", label: `Critical (${alertCounts.critical})`,  color: "danger"    },
                            { key: "warning",  label: `Warning (${alertCounts.warning})`,    color: "warning"   },
                            { key: "ok",       label: `OK (${alertCounts.ok})`,              color: "success"   },
                          ].map(f => (
                            <button key={f.key}
                              className={`btn btn-xs ${alertFilter === f.key ? `btn-${f.color}` : `btn-soft-${f.color}`}`}
                              style={{ fontSize: 11, padding: "3px 10px" }}
                              onClick={() => setAlertFilter(f.key)}>
                              {f.label}
                            </button>
                          ))}
                        </div>
                        <div className="vstack gap-2" style={{ maxHeight: 380, overflowY: "auto" }}>
                          {filteredAlerts.map((alert, i) => {
                            const cfg = LEVEL_CFG[alert.level] || LEVEL_CFG.unknown;
                            return (
                              <div key={i} className="rounded-3 p-3 border"
                                style={{ background: cfg.bg, borderColor: cfg.border }}>
                                <div className="d-flex align-items-center gap-2 mb-2">
                                  <span className={`badge text-${cfg.color} fs-10`}
                                    style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                                    <i className={`${cfg.icon} me-1`}></i>{cfg.label}
                                  </span>
                                  <code className="fs-11 text-muted">{alert.kpi_code || alert.kpi_name}</code>
                                </div>
                                <div className="d-flex gap-3 fs-12">
                                  <span>Valeur : <strong className={`text-${cfg.color}`}>
                                    {alert.value != null ? Number(alert.value).toFixed(2) : "—"}
                                  </strong></span>
                                  {alert.warning_value  != null && <span className="text-muted">W: {alert.warning_value}</span>}
                                  {alert.critical_value != null && <span className="text-muted">C: {alert.critical_value}</span>}
                                </div>
                              </div>
                            );
                          })}
                          {filteredAlerts.length === 0 && alertFilter !== "all" && (
                            <p className="text-muted fs-12 text-center py-2 mb-0">Aucun résultat pour ce filtre.</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-4">
                        <i className="ri-shield-check-line fs-1 d-block mb-2" style={{ color: "#0ab39c" }}></i>
                        <p className="fw-semibold mb-1 fs-14" style={{ color: "#0ab39c" }}>Tous les KPIs sont dans les seuils normaux !</p>
                        <p className="text-muted fs-12 mb-0">Aucune alerte détectée.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal threshold */}
      {modalThreshold !== null && (
        <ThresholdModal
          threshold={modalThreshold?.id ? modalThreshold : { kpi_definition_id: modalThreshold?.kpi_definition_id || "" }}
          existingThresholds={thresholds}   // ✅ FIX: passe existingThresholds
          kpiDefinitions={kpiDefinitions}
          projects={projects}
          dashboards={dashboards}
          onClose={() => setModalThreshold(null)}
          onSave={() => {
            setModalThreshold(null);
            showToast("Seuil enregistré.");
            loadThresholds();
          }}
        />
      )}

      {/* Confirm delete */}
      {deleteTarget && (
        <div className="modal fade show d-block"
          style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
          onClick={e => { if (e.target === e.currentTarget && !deleteLoading) setDeleteTarget(null); }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0" style={{ borderRadius: 20 }}>
              <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
                <div className="d-flex align-items-center justify-content-center rounded-circle bg-danger-subtle flex-shrink-0" style={{ width: 48, height: 48 }}>
                  <i className="ri-delete-bin-line text-danger fs-22"></i>
                </div>
                <div>
                  <h5 className="fw-semibold mb-0 fs-15">Supprimer ce seuil ?</h5>
                  <p className="text-muted fs-12 mb-0">{getKpiInfo(deleteTarget.kpi_definition_id)?.code || `#${deleteTarget.kpi_definition_id}`}</p>
                </div>
                <button className="btn-close ms-auto" onClick={() => setDeleteTarget(null)} disabled={deleteLoading} style={{ opacity: .4 }}></button>
              </div>
              <div className="px-4 py-4">
                <p className="text-muted fs-13 mb-0">Ce seuil sera supprimé définitivement. Les alertes déjà générées restent dans l'historique.</p>
              </div>
              <div className="d-flex justify-content-end gap-2 px-4 py-3"
                style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
                <button className="btn btn-sm btn-light px-4" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>Annuler</button>
                <button className="btn btn-sm btn-danger px-4" onClick={handleDelete} disabled={deleteLoading}>
                  {deleteLoading ? <><span className="spinner-border spinner-border-sm me-2"></span>Suppression…</> : <><i className="ri-delete-bin-line me-1"></i>Supprimer</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
