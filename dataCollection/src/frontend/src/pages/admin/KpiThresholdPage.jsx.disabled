/**
 * pages/admin/KpiThresholdPage.jsx
 *
 * SENIOR++++ ELITE OVERHAUL (v3):
 *   1. "Atlassian Design System" inspired thresholds manager.
 *   2. Integrated Performance Testing Console.
 *   3. High-density configuration matrix.
 *   4. Visual range indicators for thresholds.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import kpiThresholdService  from "../../services/kpiThresholdService";
import kpiDefinitionService from "../../services/kpiDefinitionService";
import projectService       from "../../services/projectService";
import dashboardService     from "../../services/dashboardService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import Pagination     from "../../components/common/Pagination";
import AdminModal     from "../../components/common/AdminModal";
import ConfirmModal   from "../../components/common/ConfirmModal";
import StatusBadge    from "../../components/common/StatusBadge";

// ── Config niveaux ────────────────────────────────────────────────────────────
const LEVEL_CFG = {
  ok:       { color: "success",   icon: "ri-checkbox-circle-line", label: "Normal" },
  warning:  { color: "warning",   icon: "ri-alert-line",            label: "Warning" },
  critical: { color: "danger",    icon: "ri-alarm-warning-fill",    label: "Critical" },
  unknown:  { color: "secondary", icon: "ri-question-line",         label: "N/A" },
};

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

  const handle = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async () => {
    setError("");
    if (!form.kpi_definition_id) return setError("Sélectionnez un KPI.");
    
    const wv = parseFloat(form.warning_value);
    const cv = parseFloat(form.critical_value);
    if (isNaN(wv) || isNaN(cv)) return setError("Valeurs numériques requises.");

    setLoading(true);
    try {
      const payload = {
        kpi_definition_id: parseInt(form.kpi_definition_id),
        warning_value: wv,
        critical_value: cv,
        project_id: form.project_id ? parseInt(form.project_id) : null,
        dashboard_id: form.dashboard_id ? parseInt(form.dashboard_id) : null,
      };
      await kpiThresholdService.upsert(existingThresholds, payload);
      onSave();
    } catch (err) {
      setError(err.message || "Erreur de sauvegarde");
    } finally {
      setLoading(false);
    }
  };

  const selectedKpi = kpiDefinitions.find(k => String(k.id) === String(form.kpi_definition_id));

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title={isEdit ? "Configuration du Seuil" : "Nouveau Seuil KPI"}
      icon="ri-settings-5-line"
      loading={loading}
      maxWidth={580}
      footer={
        <div className="d-flex gap-2 w-100 justify-content-end">
           <button className="btn btn-white border px-4" onClick={onClose}>Annuler</button>
           <button className="btn btn-primary px-4 fw-bold shadow-sm" onClick={submit} disabled={loading}>
              <i className="ri-save-line me-1"></i> Sauvegarder
           </button>
        </div>
      }
    >
      <div className="vstack gap-4">
         {error && <div className="alert alert-danger-soft border-danger-subtle d-flex align-items-center gap-2 py-2 fs-13 mb-0">
            <i className="ri-error-warning-fill"></i> {error}
         </div>}

         {/* 1. KPI Selection */}
         <div>
            <label className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-2">Indicateur Cible</label>
            <select name="kpi_definition_id" className="form-select fs-14 py-2 border-0 bg-light-subtle" 
                    value={form.kpi_definition_id} onChange={handle} disabled={isEdit}>
               <option value="">Sélectionner un indicateur...</option>
               {kpiDefinitions.map(k => <option key={k.id} value={k.id}>{k.code} — {k.label}</option>)}
            </select>
            {selectedKpi && (
               <div className="mt-2 p-3 rounded-3 bg-primary-subtle border border-primary-subtle border-opacity-10">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                     <span className="fs-12 fw-bold text-primary">Unité: {selectedKpi.unit || "N/A"}</span>
                     <span className="badge bg-white text-primary border fs-10">Actif</span>
                  </div>
                  <p className="fs-11 text-muted mb-0">{selectedKpi.formula_description}</p>
               </div>
            )}
         </div>

         {/* 2. Scope Selection */}
         <div>
            <label className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-2">Périmètre d'Application</label>
            <div className="row g-2 mb-3">
               {[
                 { key: "project",   label: "Projet Unitaire", icon: "ri-folder-2-line" },
                 { key: "dashboard", label: "Vue Dashboard",  icon: "ri-layout-grid-line" }
               ].map(s => (
                 <div key={s.key} className="col-6">
                    <div className={`p-3 rounded-4 border text-center cursor-pointer transition-all ${form.scope === s.key ? 'border-primary bg-primary-subtle text-primary ring-1' : 'bg-white border-light text-muted'}`}
                         onClick={() => setForm(f => ({ ...f, scope: s.key, project_id: "", dashboard_id: "" }))}>
                       <i className={`${s.icon} fs-20 d-block mb-1`}></i>
                       <span className="fs-11 fw-bold text-uppercase">{s.label}</span>
                    </div>
                 </div>
               ))}
            </div>
            {form.scope === "project" ? (
               <select name="project_id" className="form-select fs-14 py-2 border-0 bg-light-subtle" value={form.project_id} onChange={handle}>
                  <option value="">Sélectionner le projet...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
               </select>
            ) : (
               <select name="dashboard_id" className="form-select fs-14 py-2 border-0 bg-light-subtle" value={form.dashboard_id} onChange={handle}>
                  <option value="">Sélectionner le dashboard...</option>
                  {dashboards.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
               </select>
            )}
         </div>

         {/* 3. Range Definition */}
         <div className="row g-3">
            <div className="col-6">
               <div className="p-3 rounded-4 bg-warning-subtle border-start border-4 border-warning">
                  <label className="fs-10 fw-bold text-uppercase text-warning-emphasis mb-2 d-block">Zone Warning</label>
                  <div className="input-group input-group-sm">
                     <input type="number" name="warning_value" className="form-control border-0 bg-white" step="any" value={form.warning_value} onChange={handle} placeholder="0.00" />
                     <span className="input-group-text border-0 bg-white text-muted fs-11">{selectedKpi?.unit || ""}</span>
                  </div>
               </div>
            </div>
            <div className="col-6">
               <div className="p-3 rounded-4 bg-danger-subtle border-start border-4 border-danger">
                  <label className="fs-10 fw-bold text-uppercase text-danger-emphasis mb-2 d-block">Zone Critique</label>
                  <div className="input-group input-group-sm">
                     <input type="number" name="critical_value" className="form-control border-0 bg-white" step="any" value={form.critical_value} onChange={handle} placeholder="0.00" />
                     <span className="input-group-text border-0 bg-white text-muted fs-11">{selectedKpi?.unit || ""}</span>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </AdminModal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function KpiThresholdPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.SUPER_ADMIN;

  const [thresholds,     setThresholds]     = useState([]);
  const [kpiDefinitions, setKpiDefinitions] = useState([]);
  const [projects,       setProjects]       = useState([]);
  const [dashboards,     setDashboards]     = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [scopeMode,      setScopeMode]      = useState("project");
  const [scopeId,        setScopeId]        = useState("");
  const [search,         setSearch]         = useState("");
  const [page,           setPage]           = useState(1);
  const perPage = 10;

  // Evaluation state
  const [evalProjectId, setEvalProjectId] = useState("");
  const [evalResults,   setEvalResults]   = useState([]);
  const [evaluating,    setEvaluating]    = useState(false);

  // UI
  const [modalThreshold, setModalThreshold] = useState(null);
  const [deleteTarget,   setDeleteTarget]   = useState(null);
  const [toast,          setToast]          = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [kData, pData, dData] = await Promise.all([
        kpiDefinitionService.getAll(),
        projectService.getAll(),
        dashboardService.getMyDashboards()
      ]);
      setKpiDefinitions(Array.isArray(kData) ? kData : []);
      setProjects(Array.isArray(pData) ? pData : []);
      setDashboards(Array.isArray(dData) ? dData : []);
      if (pData?.length && !scopeId) setScopeId(String(pData[0].id));
    } catch (err) {
      showToast("Erreur de chargement", "danger");
    } finally {
      setLoading(false);
    }
  }, [scopeId, showToast]);

  const loadThresholds = useCallback(async () => {
    if (!scopeId) return;
    try {
      const data = scopeMode === "project" 
        ? await kpiThresholdService.getByProject(parseInt(scopeId))
        : await kpiThresholdService.getByDashboard(parseInt(scopeId));
      setThresholds(Array.isArray(data) ? data : []);
    } catch {
      setThresholds([]);
    }
  }, [scopeMode, scopeId]);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadThresholds(); }, [loadThresholds]);

  const handleEvaluate = async () => {
    if (!evalProjectId) return showToast("Sélectionnez un projet", "warning");
    setEvaluating(true);
    try {
      const results = await kpiThresholdService.evaluate(parseInt(evalProjectId));
      setEvalResults(Array.isArray(results) ? results : []);
      showToast("Analyse terminée.");
    } catch (err) {
      showToast(err.message || "Échec de l'analyse", "danger");
    } finally {
      setEvaluating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await kpiThresholdService.delete(deleteTarget.id);
      showToast("Configuration supprimée.");
      setDeleteTarget(null);
      loadThresholds();
    } catch (err) {
      showToast("Erreur lors de la suppression", "danger");
    }
  };

  const filtered = useMemo(() => {
    return thresholds.filter(t => {
      const kpi = kpiDefinitions.find(k => k.id === t.kpi_definition_id);
      const q = search.toLowerCase();
      return (kpi?.code?.toLowerCase().includes(q) || kpi?.label?.toLowerCase().includes(q));
    });
  }, [thresholds, kpiDefinitions, search]);

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
                <i className="ri-settings-4-fill me-2 text-primary"></i>Seuils d'Alerte
              </h4>
              <div className="d-flex gap-2">
                <button className="btn btn-white border shadow-sm fs-13 fw-bold px-4" onClick={() => navigate("/admin/audit-log")}>
                  <i className="ri-history-line me-2"></i> Historique Audit
                </button>
                <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={() => setModalThreshold({})}>
                  <i className="ri-add-line me-2"></i> Nouvelle Règle
                </button>
              </div>
            </div>
            <ol className="breadcrumb m-0 mb-4">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Gouvernance KPI</li>
            </ol>
          </div>
        </div>

      <div className="row g-4">
         {/* ── Main Config Panel ── */}
         <div className="col-xl-8">
            <div className="card border-0 shadow-sm rounded-4 overflow-hidden h-100">
               <div className="card-header bg-white border-bottom-light p-4">
                  <div className="row g-3 align-items-center">
                     <div className="col-auto">
                        <div className="btn-group btn-group-sm p-1 bg-light rounded-pill">
                           {["project", "dashboard"].map(m => (
                             <button key={m} className={`btn rounded-pill px-3 fs-11 fw-bold text-uppercase ls-1 ${scopeMode === m ? 'btn-white shadow-sm text-primary' : 'btn-transparent text-muted'}`}
                                     onClick={() => { setScopeMode(m); setScopeId(""); }}>
                                {m}
                             </button>
                           ))}
                        </div>
                     </div>
                     <div className="col">
                        <select className="form-select form-select-sm border-0 bg-light fs-13 rounded-3" 
                                value={scopeId} onChange={e => setScopeId(e.target.value)}>
                           <option value="">Sélectionner un périmètre...</option>
                           {(scopeMode === "project" ? projects : dashboards).map(item => (
                             <option key={item.id} value={item.id}>{item.name}</option>
                           ))}
                        </select>
                     </div>
                     <div className="col-auto ms-auto">
                        <div className="search-box">
                           <input type="text" className="form-control form-control-sm border-0 bg-light rounded-pill fs-13" 
                                  placeholder="Rechercher KPI..." value={search} onChange={e => setSearch(e.target.value)} />
                           <i className="ri-search-line search-icon text-muted"></i>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="card-body p-0">
                  <div className="table-responsive">
                     <table className="table align-middle table-hover mb-0">
                        <thead className="bg-light-subtle">
                           <tr>
                              <th className="ps-4 py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Indicateur KPI</th>
                              <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Warning</th>
                              <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Critical</th>
                              <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold text-center">Score Relatif</th>
                              <th className="pe-4 py-3 text-end fs-11 text-uppercase text-muted ls-1 fw-bold">Actions</th>
                           </tr>
                        </thead>
                        <tbody>
                           {loading ? (
                              <tr><td colSpan="5" className="py-5 text-center"><LoadingSpinner /></td></tr>
                           ) : paginated.length > 0 ? (
                              paginated.map(t => {
                                 const kpi = kpiDefinitions.find(k => k.id === t.kpi_definition_id);
                                 return (
                                    <tr key={t.id}>
                                       <td className="ps-4">
                                          <div className="d-flex align-items-center gap-3">
                                             <div className="avatar-xs rounded bg-primary-subtle d-flex align-items-center justify-content-center" style={{ width: 36, height: 36 }}>
                                                <i className="ri-bar-chart-fill text-primary fs-18"></i>
                                             </div>
                                             <div>
                                                <div className="fw-bold text-dark fs-14">{kpi?.code}</div>
                                                <div className="fs-11 text-muted">{kpi?.label}</div>
                                             </div>
                                          </div>
                                       </td>
                                       <td>
                                          <div className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-3 py-2 rounded-pill fs-12">
                                             <i className="ri-alert-line me-1"></i> {t.warning_value} <small className="opacity-75">{kpi?.unit}</small>
                                          </div>
                                       </td>
                                       <td>
                                          <div className="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle px-3 py-2 rounded-pill fs-12">
                                             <i className="ri-error-warning-fill me-1"></i> {t.critical_value} <small className="opacity-75">{kpi?.unit}</small>
                                          </div>
                                       </td>
                                       <td className="text-center">
                                          <div className="d-flex align-items-center justify-content-center gap-2">
                                             <div className="progress rounded-pill bg-light" style={{ width: 80, height: 4 }}>
                                                <div className="progress-bar bg-primary" style={{ width: '65%' }}></div>
                                             </div>
                                             <span className="fs-10 text-muted fw-bold">N/A</span>
                                          </div>
                                       </td>
                                       <td className="pe-4 text-end">
                                          <div className="d-flex justify-content-end gap-1">
                                             <button className="btn btn-icon btn-sm btn-ghost-primary rounded-circle" onClick={() => setModalThreshold(t)}>
                                                <i className="ri-pencil-fill"></i>
                                             </button>
                                             <button className="btn btn-icon btn-sm btn-ghost-danger rounded-circle" onClick={() => setDeleteTarget(t)}>
                                                <i className="ri-delete-bin-fill"></i>
                                             </button>
                                          </div>
                                       </td>
                                    </tr>
                                 );
                              })
                           ) : (
                              <tr><td colSpan="5" className="py-5 text-center"><EmptyState title="Aucune règle configurée" /></td></tr>
                           )}
                        </tbody>
                     </table>
                  </div>
               </div>
               <div className="card-footer bg-white border-top-light py-3 px-4">
                  <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} size="sm" />
               </div>
            </div>
         </div>

         {/* ── Sidebar Console ── */}
         <div className="col-xl-4">
            <div className="vstack gap-4">
               {/* Console d'Analyse */}
               <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
                  <div className="card-header bg-primary border-0 p-4">
                     <h6 className="text-white mb-1 fw-bold d-flex align-items-center gap-2">
                        <i className="ri-terminal-box-line"></i> Console de Validation
                     </h6>
                     <p className="text-white text-opacity-75 fs-12 mb-0">Tester les seuils sur l'activité réelle</p>
                  </div>
                  <div className="card-body p-4">
                     <div className="mb-4">
                        <label className="fs-11 fw-bold text-uppercase text-muted ls-1 d-block mb-2">Projet Source</label>
                        <select className="form-select border-0 bg-light fs-13 rounded-3 py-2" 
                                value={evalProjectId} onChange={e => setEvalProjectId(e.target.value)}>
                           <option value="">Sélectionner un projet...</option>
                           {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                     </div>
                     <button className="btn btn-primary w-100 fw-bold py-3 shadow-sm rounded-3 mb-4" 
                             onClick={handleEvaluate} disabled={evaluating || !evalProjectId}>
                        {evaluating ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="ri-play-circle-line me-2"></i>}
                        Lancer la Simulation
                     </button>

                     {evalResults.length > 0 && (
                        <div className="vstack gap-2" style={{ maxHeight: 400, overflowY: "auto" }}>
                           {evalResults.map((res, i) => {
                             const cfg = LEVEL_CFG[res.level] || LEVEL_CFG.unknown;
                             return (
                               <div key={i} className={`p-3 rounded-4 border-start border-4 border-${cfg.color} bg-${cfg.color}-subtle bg-opacity-10 mb-2`}>
                                  <div className="d-flex justify-content-between align-items-start mb-1">
                                     <span className="fs-12 fw-bold text-dark">{res.kpi_code || res.kpi_name}</span>
                                     <span className={`badge bg-${cfg.color}-subtle text-${cfg.color} fs-10 text-uppercase`}>{cfg.label}</span>
                                  </div>
                                  <div className="d-flex align-items-center gap-3">
                                     <span className={`fs-16 fw-bold text-${cfg.color}`}>{res.value?.toFixed(2)}</span>
                                     <div className="ms-auto fs-10 text-muted fw-medium">W: {res.warning_value} | C: {res.critical_value}</div>
                                  </div>
                               </div>
                             );
                           })}
                        </div>
                     )}
                  </div>
               </div>

               {/* Quick Tips */}
               <div className="card border-0 shadow-sm rounded-4 bg-indigo text-white p-4 overflow-hidden position-relative">
                  <i className="ri-lightbulb-flash-line position-absolute opacity-10" style={{ fontSize: 120, right: -20, bottom: -20 }}></i>
                  <h6 className="fw-bold mb-2">Conseil d'Expert</h6>
                  <p className="fs-12 mb-0 opacity-75">
                     Les seuils configurés au niveau "Dashboard" surchargent les seuils par défaut des projets individuels inclus dans la vue.
                  </p>
               </div>
            </div>
         </div>
      </div>

      {/* Modals */}
      {modalThreshold && (
        <ThresholdModal
          threshold={modalThreshold.id ? modalThreshold : { kpi_definition_id: modalThreshold.kpi_definition_id || "" }}
          existingThresholds={thresholds}
          kpiDefinitions={kpiDefinitions}
          projects={projects}
          dashboards={dashboards}
          onClose={() => setModalThreshold(null)}
          onSave={() => { setModalThreshold(null); loadThresholds(); showToast("Sauvegardé avec succès."); }}
        />
      )}

      <ConfirmModal
        show={!!deleteTarget}
        title="Supprimer la règle ?"
        message="Cette action est irréversible. Les alertes en cours basées sur ce seuil ne seront plus mises à jour."
        confirmLabel="Confirmer la suppression"
        confirmColor="danger"
        loading={false}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {toast && <div className={`alert alert-${toast.type} position-fixed top-0 end-0 m-4 shadow-lg border-0 rounded-4 px-4 py-3`} style={{ zIndex: 9999 }}>{toast.msg}</div>}

      <style>{`
        .bg-indigo { background: linear-gradient(135deg, #4b38b3 0%, #3577f1 100%); }
        .ls-1 { letter-spacing: 0.05em; }
        .border-bottom-light { border-bottom: 1px solid #f1f3f5; }
        .ring-1 { box-shadow: 0 0 0 2px rgba(53, 119, 241, 0.2); }
      `}</style>
      </div>
    </div>
  );
}
