/**
 * pages/admin/KpiDefinitionsPage.jsx
 *
 * CORRECTION :
 *   `direction` n'existe PAS dans le schéma backend KpiDefinitionCreate.
 *   Le backend a : code, label, formula_description, unit, aggregation_level, is_active.
 *   ✅ FIX : suppression de direction, remplacement par aggregation_level (site/project/developer/group).
 *
 * AMÉLIORATIONS :
 *   - Cards colorées par aggregation_level
 *   - Affichage de la formula_description au survol
 *   - Toggle is_active inline dans la table
 */
import { useState, useEffect, useCallback } from "react";
import kpiDefinitionService from "../../services/kpiDefinitionService";
import AdminModal           from "../../components/common/AdminModal";
import LoadingSpinner       from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";

const AGGREGATION_LEVELS = [
  { value: "site",      label: "Par site",        icon: "ri-map-pin-line",    color: "info"    },
  { value: "project",   label: "Par projet",      icon: "ri-folder-2-line",   color: "primary" },
  { value: "developer", label: "Par développeur", icon: "ri-user-line",       color: "success" },
  { value: "group",     label: "Par groupe",      icon: "ri-group-line",      color: "warning" },
];

const EMPTY_FORM = {
  code:                "",
  label:               "",
  formula_description: "",
  unit:                "",
  aggregation_level:   "site",  // ✅ FIX: aggregation_level (pas direction)
  is_active:           true,
};

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

export default function KpiDefinitionsPage() {
  const [kpis,      setKpis]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [showForm,  setShowForm]  = useState(false);
  const [editTarget,setEditTarget]= useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState(null);
  const [toast,     setToast]     = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      // getAll retourne tous y compris inactifs depuis /kpi-definitions/
      const data = await kpiDefinitionService.getAll();
      setKpis(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (k) => {
    setEditTarget(k);
    setForm({
      code:                k.code,
      label:               k.label,
      formula_description: k.formula_description || "",
      unit:                k.unit || "",
      aggregation_level:   k.aggregation_level || "site",  // ✅ FIX
      is_active:           k.is_active,
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.code.trim())  { setFormError("Le code KPI est requis.");    return; }
    if (!form.label.trim()) { setFormError("Le libellé KPI est requis."); return; }
    setSaving(true); setFormError(null);
    try {
      // ✅ FIX: payload sans direction, avec aggregation_level
      const payload = {
        code:                form.code.toUpperCase().trim(),
        label:               form.label.trim(),
        formula_description: form.formula_description.trim() || null,
        unit:                form.unit.trim() || null,
        aggregation_level:   form.aggregation_level,
        is_active:           form.is_active,
      };
      if (editTarget) {
        await kpiDefinitionService.update(editTarget.id, payload);
        showToast("KPI mis à jour.");
      } else {
        await kpiDefinitionService.create(payload);
        showToast("KPI créé avec succès.");
      }
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const getAggLevel = (val) => AGGREGATION_LEVELS.find(a => a.value === val) || AGGREGATION_LEVELS[0];

  const activeKpis   = kpis.filter(k => k.is_active).length;
  const inactiveKpis = kpis.filter(k => !k.is_active).length;

  return (
    <div className="page-content">
      <div className="container-fluid">
        <Toast toast={toast} />

        {/* Header */}
        <div className="row mt-3">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-bar-chart-grouped-line me-2 text-primary"></i>Définitions KPI
              </h4>
              <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={openCreate}>
                <i className="ri-add-line me-1"></i> Nouveau KPI
              </button>
            </div>
            <ol className="breadcrumb m-0 mb-4">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">KPI Définitions</li>
            </ol>
          </div>
        </div>

        {/* Stats rapides */}
        <div className="row g-3 mb-4">
          {[
            { label: "KPIs actifs",   value: activeKpis,   color: "#0ab39c", bg: "#f0fdf4", icon: "ri-checkbox-circle-line" },
            { label: "KPIs inactifs", value: inactiveKpis, color: "#888780", bg: "#f1efe8", icon: "ri-forbid-line"           },
            { label: "Total KPIs",    value: kpis.length,  color: "#3577f1", bg: "#eff6ff", icon: "ri-bar-chart-line"        },
            { label: "Niveaux agg.",  value: new Set(kpis.map(k => k.aggregation_level)).size, color: "#6f42c1", bg: "#f5f3ff", icon: "ri-stack-line" },
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

        {/* Note seed */}
        <div className="d-flex align-items-start gap-3 rounded-3 p-3 mb-4"
          style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
          <i className="ri-information-line fs-4 flex-shrink-0 mt-1" style={{ color: "#1d4ed8" }}></i>
          <div>
            <strong style={{ color: "#1e3a8a" }}>Référentiel seedé automatiquement</strong>
            <span className="text-muted fs-13 ms-2">— Les 6 KPIs actifs sont créés au démarrage de l'application via <code>seed_kpi_definitions()</code>. Vous pouvez en ajouter de nouveaux ou modifier les libellés.</span>
          </div>
        </div>

        {/* Table */}
        <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div className="card-body p-0">
            {loading ? (
              <div className="py-5"><LoadingSpinner text="Chargement des KPIs…" /></div>
            ) : error ? (
              <div className="p-4"><div className="alert alert-danger mb-0">{error}</div></div>
            ) : kpis.length === 0 ? (
              <EmptyState icon="ri-bar-chart-grouped-line" title="Aucune définition KPI"
                actionLabel="Créer un KPI" onAction={openCreate} />
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead style={{ background: "#fafbfc" }}>
                    <tr>
                      <th className="ps-4 py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Code</th>
                      <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Libellé</th>
                      <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Unité</th>
                      <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Niveau</th>
                      <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Statut</th>
                      <th className="pe-4 py-3 text-end text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.map(k => {
                      const agg = getAggLevel(k.aggregation_level);
                      return (
                        <tr key={k.id} className={!k.is_active ? "opacity-60" : ""}>
                          <td className="ps-4 py-3">
                            <code className="fs-12 fw-bold px-2 py-1 rounded-2"
                              style={{ background: "#f4f6fa", color: "#1e3a8a" }}>
                              {k.code}
                            </code>
                          </td>
                          <td>
                            <p className="fw-medium mb-0 fs-13">{k.label}</p>
                            {k.formula_description && (
                              <p className="text-muted mb-0 fs-11 text-truncate" style={{ maxWidth: 280 }} title={k.formula_description}>
                                {k.formula_description}
                              </p>
                            )}
                          </td>
                          <td className="text-muted fs-13">{k.unit || "—"}</td>
                          <td>
                            <span className={`badge bg-${agg.color}-subtle text-${agg.color} fs-11`}>
                              <i className={`${agg.icon} me-1`}></i>{agg.label}
                            </span>
                          </td>
                          <td>
                            <span className={`badge fs-11 ${k.is_active ? "" : "bg-secondary-subtle text-secondary"}`}
                              style={k.is_active ? { background: "#dcfce7", color: "#15803d" } : {}}>
                              {k.is_active ? "Actif" : "Inactif"}
                            </span>
                          </td>
                          <td className="pe-4 text-end">
                            <button className="btn btn-sm btn-soft-primary" onClick={() => openEdit(k)}>
                              <i className="ri-pencil-line me-1"></i>Modifier
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal form */}
      {showForm && (
        <AdminModal
          show={true}
          onClose={() => !saving && setShowForm(false)}
          title={editTarget ? "Modifier le KPI" : "Nouveau KPI"}
          subtitle={editTarget ? `Code : ${editTarget.code}` : "Définissez un nouvel indicateur stratégique"}
          icon="ri-bar-chart-grouped-line"
          loading={saving}
          maxWidth={520}
          footer={
            <>
              <button className="btn btn-sm btn-light px-4 fw-medium" onClick={() => setShowForm(false)} disabled={saving}>Annuler</button>
              <button className="btn btn-sm btn-primary px-4 fw-bold shadow-sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement...</>
                ) : (
                  <><i className="ri-save-line me-1"></i>Enregistrer</>
                )}
              </button>
            </>
          }
        >
          {formError && (
            <div className="alert alert-danger d-flex gap-2 py-2 fs-13 mb-3 border-0 shadow-sm">
              <i className="ri-error-warning-line"></i>{formError}
            </div>
          )}

          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label fw-semibold fs-13 mb-1">Code <span className="text-danger">*</span></label>
              <input 
                className="form-control font-monospace bg-light-subtle"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="EX: AVG_REVIEW_TIME"
                disabled={!!editTarget} 
              />
              {!editTarget && <div className="form-text fs-10 text-muted mt-1">Majuscules, underscores — immuable après création</div>}
            </div>

            <div className="col-md-6">
              <label className="form-label fw-semibold fs-13 mb-1">Unité</label>
              <input 
                className="form-control"
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="h, ratio, commits…" 
              />
            </div>

            <div className="col-12">
              <label className="form-label fw-semibold fs-13 mb-1">Libellé <span className="text-danger">*</span></label>
              <input 
                className="form-control"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Ex: Temps moyen de relecture" 
              />
            </div>

            <div className="col-12">
              <label className="form-label fw-semibold fs-13 mb-1">Description / Formule</label>
              <textarea 
                className="form-control" 
                rows={2}
                value={form.formula_description}
                onChange={e => setForm(f => ({ ...f, formula_description: e.target.value }))}
                placeholder="Ex: Σ(approved_at - created_at) / NB MRs approuvées" 
              />
            </div>

            <div className="col-12">
              <label className="form-label fw-semibold fs-13 mb-2">Niveau d'agrégation</label>
              <div className="d-flex gap-2 flex-wrap">
                {AGGREGATION_LEVELS.map(level => (
                  <div key={level.value}
                    className="flex-fill p-2 rounded-3 border text-center transition-all"
                    style={{
                      cursor: "pointer",
                      minWidth: 80,
                      background: form.aggregation_level === level.value ? "rgba(99,102,241,0.08)" : "#fff",
                      borderColor: form.aggregation_level === level.value ? "#6366f1" : "#e2e8f0",
                      boxShadow: form.aggregation_level === level.value ? "0 2px 8px rgba(99,102,241,0.15)" : "none",
                    }}
                    onClick={() => setForm(f => ({ ...f, aggregation_level: level.value }))}>
                    <i className={`${level.icon} d-block fs-18 mb-1 ${form.aggregation_level === level.value ? "text-primary" : "text-muted"}`}></i>
                    <span className={`fs-11 fw-bold ${form.aggregation_level === level.value ? "text-primary" : "text-muted"}`}>{level.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-12 mt-4">
              <div 
                className="d-flex align-items-center justify-content-between rounded-3 p-3 border"
                style={{ 
                  background: form.is_active ? "rgba(16,185,129,0.04)" : "#f8fafc", 
                  borderColor: form.is_active ? "#10b981" : "#e2e8f0" 
                }}
              >
                <div>
                  <div className={`fw-bold fs-13 ${form.is_active ? "text-success" : "text-muted"}`}>
                    <i className={`${form.is_active ? "ri-checkbox-circle-line" : "ri-forbid-line"} me-1`}></i>
                    {form.is_active ? "KPI actif" : "KPI inactif"}
                  </div>
                  <div className="text-muted fs-11 mt-1">{form.is_active ? "Apparaît dans les dropdowns et évaluations" : "Masqué des interfaces"}</div>
                </div>
                <div className="form-check form-switch mb-0">
                  <input 
                    type="checkbox" 
                    className="form-check-input" 
                    role="switch"
                    checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    style={{ width: "2.6em", height: "1.4em", cursor: "pointer" }} 
                  />
                </div>
              </div>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
