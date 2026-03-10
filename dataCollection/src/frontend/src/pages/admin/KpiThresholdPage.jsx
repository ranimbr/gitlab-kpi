/**
 * KpiThresholdPage.jsx
 * Route : /admin/kpi-thresholds  (admin uniquement)
 * Inspiration : Velzon Bootstrap — stat cards card-animate + progress bar + tableau
 */

import { useState, useEffect, useCallback } from "react";
import LoadingSpinner        from "../../components/common/LoadingSpinner";
import EmptyState            from "../../components/common/EmptyState";
import ConfirmModal          from "../../components/common/ConfirmModal";
import StatusBadge           from "../../components/common/StatusBadge";
import projectService        from "../../services/projectService";
import kpiThresholdService, {
  KPI_LABELS,
  KPI_NAMES,
  alertLevelToColor,
} from "../../services/kpiThresholdService";

// ─── Valeurs par défaut suggérées par KPI ─────────────────────────────────────
const KPI_DEFAULTS = {
  mr_rate_per_site:       { warning: 1.5,  critical: 1.0 },
  approved_mr_rate:       { warning: 0.6,  critical: 0.4 },
  merged_mr_rate:         { warning: 0.6,  critical: 0.4 },
  commit_rate_per_site:   { warning: 3.0,  critical: 1.5 },
  nb_commits_per_project: { warning: 50,   critical: 20  },
  avg_review_time_hours:  { warning: 48,   critical: 72  },
};

const EMPTY_FORM = {
  kpi_name:       KPI_NAMES[0] || "",
  warning_value:  "",
  critical_value: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  const icon =
    toast.type === "success"
      ? "ri-checkbox-circle-line text-success"
      : "ri-error-warning-line text-danger";
  return (
    <div
      className={`alert alert-${toast.type} border-0 d-flex align-items-center gap-2 position-fixed shadow`}
      style={{
        top: 20,
        right: 20,
        zIndex: 9999,
        minWidth: 300,
        borderRadius: 10,
        animation: "fadeIn .25s ease",
      }}
    >
      <i className={`${icon} fs-16`}></i>
      <span className="fs-13">{toast.msg}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatCard  (style Velzon card-animate)
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color, subtitle, onClick, active }) {
  return (
    <div className="col-xl-3 col-sm-6">
      <div
        className={`card card-animate${active ? ` border border-${color} border-2` : ""}`}
        style={{ cursor: onClick ? "pointer" : "default" }}
        onClick={onClick}
      >
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <p
                className="fw-medium text-muted mb-0 text-uppercase fs-11"
                style={{ letterSpacing: "0.6px" }}
              >
                {label}
              </p>
              <h2 className={`mt-4 ff-secondary fw-semibold text-${color} mb-1`}>{value}</h2>
              {subtitle && <p className="mb-0 text-muted fs-12">{subtitle}</p>}
            </div>
            <div className="avatar-sm flex-shrink-0">
              <span className={`avatar-title bg-${color}-subtle rounded-circle fs-2`}>
                <i className={`${icon} text-${color}`}></i>
              </span>
            </div>
          </div>
          {onClick && (
            <div className="mt-2">
              <span className={`badge bg-${color}-subtle text-${color} fs-11`}>
                {active ? "Filtre actif – cliquer pour retirer" : "Cliquer pour filtrer"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Formulaire — Créer / Modifier un seuil
// ─────────────────────────────────────────────────────────────────────────────
function ThresholdModal({ show, editTarget, availableKpis, onClose, onSave }) {
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [errors,     setErrors]     = useState({});
  const [saving,     setSaving]     = useState(false);

  // Init form quand le modal s'ouvre
  useEffect(() => {
    if (!show) return;
    if (editTarget) {
      setForm({
        kpi_name:       editTarget.kpi_name,
        warning_value:  editTarget.warning_value,
        critical_value: editTarget.critical_value,
      });
    } else {
      const first = availableKpis[0] || KPI_NAMES[0];
      const def   = KPI_DEFAULTS[first] || { warning: "", critical: "" };
      setForm({ kpi_name: first, warning_value: def.warning, critical_value: def.critical });
    }
    setErrors({});
  }, [show, editTarget]);

  // Quand on change de KPI, on préremplit les valeurs
  const handleKpiChange = (kpi) => {
    const def = KPI_DEFAULTS[kpi] || { warning: "", critical: "" };
    setForm({ kpi_name: kpi, warning_value: def.warning, critical_value: def.critical });
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    const w = parseFloat(form.warning_value);
    const c = parseFloat(form.critical_value);
    if (isNaN(w) || w <= 0) errs.warning_value  = "Valeur positive requise";
    if (isNaN(c) || c <= 0) errs.critical_value = "Valeur positive requise";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(form, editTarget);
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;
  const isEdit   = !!editTarget;
  const kpiList  = isEdit ? KPI_NAMES : availableKpis;

  return (
    <div
      className="modal fade show d-block"
      style={{
        background:     "rgba(30,34,45,.55)",
        backdropFilter: "blur(4px)",
        zIndex:         1055,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        style={{ maxWidth: 500 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 16 }}>

          {/* ── Header ── */}
          <div className="p-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-center gap-3">
              <div
                className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center"
                style={{
                  width: 48, height: 48,
                  background: "linear-gradient(135deg,#f7b84b,#f06548)",
                }}
              >
                <i className="ri-alarm-warning-line text-white fs-18"></i>
              </div>
              <div className="flex-grow-1">
                <h5 className="fw-semibold mb-0 fs-15">
                  {isEdit ? "Modifier le seuil" : "Nouveau seuil KPI"}
                </h5>
                <p className="text-muted fs-12 mb-0">
                  {isEdit
                    ? KPI_LABELS[editTarget.kpi_name] || editTarget.kpi_name
                    : "Définir les valeurs warning & critical"}
                </p>
              </div>
              <button className="btn-close opacity-50" onClick={onClose} disabled={saving} />
            </div>
          </div>

          {/* ── Body ── */}
          <div className="p-4">
            <div className="row g-3">

              {/* Sélecteur KPI */}
              <div className="col-12">
                <label className="form-label fw-medium fs-13">
                  KPI <span className="text-danger">*</span>
                </label>
                <select
                  className="form-select"
                  value={form.kpi_name}
                  onChange={(e) => handleKpiChange(e.target.value)}
                  disabled={isEdit}
                >
                  {kpiList.map((k) => (
                    <option key={k} value={k}>{KPI_LABELS[k] || k}</option>
                  ))}
                </select>
                {isEdit && (
                  <div className="form-text">
                    <i className="ri-information-line me-1"></i>Le nom du KPI ne peut pas être modifié.
                  </div>
                )}
              </div>

              {/* Warning */}
              <div className="col-6">
                <label className="form-label fw-medium fs-13">
                  🟡 Seuil Warning <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-warning-subtle border-warning-subtle">
                    <i className="ri-alert-line text-warning"></i>
                  </span>
                  <input
                    type="number" step="0.01" min="0"
                    className={`form-control ${errors.warning_value ? "is-invalid" : ""}`}
                    value={form.warning_value}
                    onChange={(e) => setForm((f) => ({ ...f, warning_value: e.target.value }))}
                    placeholder="ex: 48"
                  />
                  {errors.warning_value && (
                    <div className="invalid-feedback">{errors.warning_value}</div>
                  )}
                </div>
              </div>

              {/* Critical */}
              <div className="col-6">
                <label className="form-label fw-medium fs-13">
                  🔴 Seuil Critical <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-danger-subtle border-danger-subtle">
                    <i className="ri-close-circle-line text-danger"></i>
                  </span>
                  <input
                    type="number" step="0.01" min="0"
                    className={`form-control ${errors.critical_value ? "is-invalid" : ""}`}
                    value={form.critical_value}
                    onChange={(e) => setForm((f) => ({ ...f, critical_value: e.target.value }))}
                    placeholder="ex: 72"
                  />
                  {errors.critical_value && (
                    <div className="invalid-feedback">{errors.critical_value}</div>
                  )}
                </div>
              </div>

              {/* Aide logique */}
              <div className="col-12">
                <div className="rounded-3 p-3" style={{ background: "#f8f9fc", border: "1px solid #e9ecef" }}>
                  <p className="mb-1 fs-12 fw-semibold text-muted">
                    <i className="ri-information-line me-1"></i>Logique d'évaluation
                  </p>
                  <p className="mb-0 fs-12 text-muted">
                    <strong>avg_review_time_hours, mr_rate_per_site</strong> → valeur haute = pire
                    <br />
                    <strong>approved_mr_rate, merged_mr_rate, commit_rate_per_site</strong> → valeur basse = pire
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* ── Footer ── */}
          <div
            className="px-4 py-3 d-flex justify-content-end gap-2"
            style={{
              borderTop:    "1px solid #f1f3f7",
              background:   "#fafbfc",
              borderRadius: "0 0 16px 16px",
            }}
          >
            <button className="btn btn-light px-4" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button
              className="btn btn-warning text-white px-4"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement...</>
              ) : isEdit ? (
                <><i className="ri-save-line me-1"></i>Mettre à jour</>
              ) : (
                <><i className="ri-add-line me-1"></i>Créer le seuil</>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────
export default function KpiThresholdPage() {
  const [projects,     setProjects]     = useState([]);
  const [projectId,    setProjectId]    = useState(null);
  const [thresholds,   setThresholds]   = useState([]);
  const [alerts,       setAlerts]       = useState([]);   // résultats /evaluate
  const [loading,      setLoading]      = useState(false);
  const [evaluating,   setEvaluating]   = useState(false);
  const [showForm,     setShowForm]     = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [toast,        setToast]        = useState(null);
  const [alertFilter,  setAlertFilter]  = useState("all"); // "all"|"ok"|"warning"|"critical"

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Chargement des projets ──────────────────────────────────────────────────
  useEffect(() => {
    projectService
      .getAll()
      .then((data) => {
        setProjects(data || []);
        if (data?.length) setProjectId(data[0].id);
      })
      .catch(() => showToast("danger", "Erreur lors du chargement des projets."));
  }, [showToast]);

  // ── Chargement des seuils pour le projet sélectionné ───────────────────────
  const loadThresholds = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await kpiThresholdService.getByProject(projectId);
      setThresholds(data);
    } catch {
      showToast("danger", "Erreur lors du chargement des seuils.");
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    loadThresholds();
    setAlerts([]);
    setAlertFilter("all");
  }, [loadThresholds]);

  // ── Stats calculées à partir des résultats d'évaluation ────────────────────
  const nbOk       = alerts.filter((a) => a.level === "ok").length;
  const nbWarning  = alerts.filter((a) => a.level === "warning").length;
  const nbCritical = alerts.filter((a) => a.level === "critical").length;
  const nbUnknown  = alerts.filter((a) => a.level === "unknown").length;
  const nbTotal    = alerts.length;

  const nbConfigured = thresholds.length;
  const nbMissing    = KPI_NAMES.length - nbConfigured;

  // KPIs non encore configurés (pour quick-add et modal Nouveau)
  const configuredSet = new Set(thresholds.map((t) => t.kpi_name));
  const availableKpis = editTarget
    ? KPI_NAMES
    : KPI_NAMES.filter((k) => !configuredSet.has(k));

  // ── Sauvegarde (création ou modification) ──────────────────────────────────
  const handleSave = async (form, target) => {
    try {
      if (target) {
        await kpiThresholdService.update(target.id, {
          warning_value:  parseFloat(form.warning_value),
          critical_value: parseFloat(form.critical_value),
        });
        showToast("success", "Seuil mis à jour avec succès.");
      } else {
        await kpiThresholdService.create({
          kpi_name:       form.kpi_name,
          warning_value:  parseFloat(form.warning_value),
          critical_value: parseFloat(form.critical_value),
          project_id:     projectId,
        });
        showToast("success", "Seuil créé avec succès.");
      }
      setShowForm(false);
      setEditTarget(null);
      await loadThresholds();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      showToast("danger", detail || "Erreur lors de la sauvegarde.");
      throw err; // relance pour que le modal revienne en état normal
    }
  };

  // ── Suppression ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await kpiThresholdService.delete(deleteTarget.id);
      showToast("success", "Seuil supprimé.");
      setAlerts((prev) => prev.filter((a) => a.kpi_name !== deleteTarget.kpi_name));
      setDeleteTarget(null);
      await loadThresholds();
    } catch {
      showToast("danger", "Erreur lors de la suppression.");
    } finally {
      setDeleting(false);
    }
  };

  // ── Évaluation des KPIs ─────────────────────────────────────────────────────
  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      const data = await kpiThresholdService.evaluate(projectId);
      setAlerts(data);
      setAlertFilter("all");
      showToast("success", `Évaluation terminée — ${data.length} KPI(s) analysés.`);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      showToast("danger", detail || "Aucun snapshot KPI disponible pour ce projet.");
    } finally {
      setEvaluating(false);
    }
  };

  // ── Lignes du tableau filtrées par niveau ───────────────────────────────────
  const filteredThresholds =
    alertFilter === "all"
      ? thresholds
      : thresholds.filter((t) => {
          const a = alerts.find((al) => al.kpi_name === t.kpi_name);
          return a?.level === alertFilter;
        });

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="page-content">
      <div className="container-fluid">

        <Toast toast={toast} />

        {/* ── Breadcrumb ───────────────────────────────────────────────────── */}
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-alarm-warning-line me-2 text-warning"></i>
                Seuils d'alerte KPI
              </h4>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/dashboard">Dashboard</a></li>
                <li className="breadcrumb-item">Administration</li>
                <li className="breadcrumb-item active">KPI Thresholds</li>
              </ol>
            </div>
          </div>
        </div>

        {/* ── 4 Stat Cards (style Velzon card-animate) ─────────────────────── */}
        <div className="row">

          <StatCard
            label="Seuils configurés"
            value={nbConfigured}
            icon="ri-settings-4-line"
            color="primary"
            subtitle={`sur ${KPI_NAMES.length} KPIs disponibles`}
          />

          <StatCard
            label="OK"
            value={nbOk}
            icon="ri-checkbox-circle-line"
            color="success"
            subtitle={nbTotal ? `${Math.round((nbOk / nbTotal) * 100)} % des évalués` : "Pas encore évalué"}
            onClick={nbTotal ? () => setAlertFilter((f) => f === "ok" ? "all" : "ok") : undefined}
            active={alertFilter === "ok"}
          />

          <StatCard
            label="Warning"
            value={nbWarning}
            icon="ri-alert-line"
            color="warning"
            subtitle={nbTotal ? `${Math.round((nbWarning / nbTotal) * 100)} % des évalués` : "Pas encore évalué"}
            onClick={nbTotal ? () => setAlertFilter((f) => f === "warning" ? "all" : "warning") : undefined}
            active={alertFilter === "warning"}
          />

          <StatCard
            label="Critical"
            value={nbCritical}
            icon="ri-close-circle-line"
            color="danger"
            subtitle={nbTotal ? `${Math.round((nbCritical / nbTotal) * 100)} % des évalués` : "Pas encore évalué"}
            onClick={nbTotal ? () => setAlertFilter((f) => f === "critical" ? "all" : "critical") : undefined}
            active={alertFilter === "critical"}
          />

        </div>
        {/* ── fin stat cards ── */}

        {/* ── Progress bar globale (visible seulement après évaluation) ───── */}
        {nbTotal > 0 && (
          <div className="card mb-3">
            <div className="card-body py-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="fs-13 fw-semibold text-muted">
                  <i className="ri-bar-chart-grouped-line me-1"></i>
                  Vue d'ensemble — {nbTotal} KPI{nbTotal > 1 ? "s" : ""} évalué{nbTotal > 1 ? "s" : ""}
                </span>
                <button
                  className="btn btn-sm btn-ghost-secondary"
                  onClick={() => { setAlerts([]); setAlertFilter("all"); }}
                >
                  <i className="ri-close-line me-1"></i>Effacer l'évaluation
                </button>
              </div>

              <div className="progress rounded-pill" style={{ height: 14 }}>
                {nbOk > 0 && (
                  <div
                    className="progress-bar bg-success"
                    style={{ width: `${(nbOk / nbTotal) * 100}%` }}
                    title={`OK : ${nbOk}`}
                  />
                )}
                {nbWarning > 0 && (
                  <div
                    className="progress-bar bg-warning"
                    style={{ width: `${(nbWarning / nbTotal) * 100}%` }}
                    title={`Warning : ${nbWarning}`}
                  />
                )}
                {nbCritical > 0 && (
                  <div
                    className="progress-bar bg-danger"
                    style={{ width: `${(nbCritical / nbTotal) * 100}%` }}
                    title={`Critical : ${nbCritical}`}
                  />
                )}
                {nbUnknown > 0 && (
                  <div
                    className="progress-bar bg-secondary"
                    style={{ width: `${(nbUnknown / nbTotal) * 100}%` }}
                    title={`Inconnu : ${nbUnknown}`}
                  />
                )}
              </div>

              {/* Légende */}
              <div className="d-flex flex-wrap gap-3 mt-2">
                {[
                  { lbl: "OK",      cnt: nbOk,       color: "success" },
                  { lbl: "Warning", cnt: nbWarning,  color: "warning" },
                  { lbl: "Critical",cnt: nbCritical, color: "danger"  },
                  { lbl: "Inconnu", cnt: nbUnknown,  color: "secondary" },
                ]
                  .filter(({ cnt }) => cnt > 0)
                  .map(({ lbl, cnt, color }) => (
                    <span key={lbl} className="fs-12 text-muted">
                      <i className={`mdi mdi-circle text-${color} me-1`}></i>
                      {lbl} : <strong>{cnt}</strong>
                    </span>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Sélecteur projet + boutons actions ──────────────────────────── */}
        <div className="card mb-3">
          <div className="card-header border-0">
            <div className="row g-2 align-items-end">

              {/* Sélecteur projet */}
              <div className="col-md-4">
                <label className="form-label fw-semibold fs-13 mb-1">
                  <i className="ri-folder-line me-1 text-primary"></i>Projet GitLab
                </label>
                <select
                  className="form-select"
                  value={projectId || ""}
                  onChange={(e) => setProjectId(Number(e.target.value))}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Boutons */}
              <div className="col-md-auto d-flex gap-2">
                <button
                  className="btn btn-soft-info"
                  onClick={handleEvaluate}
                  disabled={!projectId || evaluating || thresholds.length === 0}
                  title={thresholds.length === 0 ? "Configurez d'abord au moins un seuil" : ""}
                >
                  {evaluating ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span>Évaluation en cours...</>
                  ) : (
                    <><i className="ri-bar-chart-grouped-line me-1"></i>Évaluer les KPIs</>
                  )}
                </button>

                <button
                  className="btn btn-warning text-white"
                  onClick={() => { setEditTarget(null); setShowForm(true); }}
                  disabled={!projectId || availableKpis.length === 0}
                  title={availableKpis.length === 0 ? "Tous les KPIs ont déjà un seuil" : ""}
                >
                  <i className="ri-add-line me-1"></i>Nouveau seuil
                </button>
              </div>

              {/* Indicateur couverture */}
              <div className="col-md-auto ms-auto">
                <span
                  className={`badge fs-12 py-2 px-3 ${
                    nbMissing === 0
                      ? "bg-success-subtle text-success"
                      : "bg-warning-subtle text-warning"
                  }`}
                >
                  <i className={`${nbMissing === 0 ? "ri-checkbox-circle-line" : "ri-alert-line"} me-1`}></i>
                  {nbMissing === 0
                    ? "Tous les KPIs sont couverts"
                    : `${nbMissing} KPI${nbMissing > 1 ? "s" : ""} sans seuil`}
                </span>
              </div>

            </div>
          </div>
        </div>

        {/* ── Cards résultats évaluation (affiché quand filtre = "all") ───── */}
        {nbTotal > 0 && alertFilter === "all" && (
          <div className="row mb-3">
            {alerts.map((a) => {
              const color = alertLevelToColor(a.level);
              const icon  =
                a.level === "ok"       ? "ri-checkbox-circle-line"
                : a.level === "warning"  ? "ri-alert-line"
                : a.level === "critical" ? "ri-close-circle-line"
                : "ri-question-line";

              return (
                <div key={a.kpi_name} className="col-xl-4 col-md-6 col-12">
                  <div className={`card card-animate border-start border-3 border-${color} mb-3`}>
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="flex-grow-1 me-3">
                          <p
                            className="fw-semibold mb-0 fs-11 text-uppercase text-muted"
                            style={{ letterSpacing: "0.5px" }}
                          >
                            {KPI_LABELS[a.kpi_name] || a.kpi_name}
                          </p>
                          <h3 className={`mt-2 fw-bold text-${color} mb-1`}>
                            {typeof a.value === "number" ? a.value.toFixed(2) : "—"}
                          </h3>
                          {a.warning_value != null && (
                            <p className="text-muted mb-0 fs-11">
                              <i className="ri-alert-line text-warning me-1"></i>W: {a.warning_value}
                              <span className="mx-2">|</span>
                              <i className="ri-close-circle-line text-danger me-1"></i>C: {a.critical_value}
                            </p>
                          )}
                        </div>
                        <div className="text-center flex-shrink-0">
                          <div className={`avatar-sm mb-1`}>
                            <span className={`avatar-title bg-${color}-subtle rounded-circle fs-2`}>
                              <i className={`${icon} text-${color}`}></i>
                            </span>
                          </div>
                          <StatusBadge type="threshold" value={a.level} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tableau principal des seuils ─────────────────────────────────── */}
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-transparent border-bottom d-flex align-items-center justify-content-between">
            <h6 className="mb-0 fw-semibold fs-14">
              <i className="ri-list-settings-line me-2 text-primary"></i>
              Seuils configurés
              {alertFilter !== "all" && (
                <span
                  className={`badge ms-2 fs-11 bg-${
                    alertFilter === "ok" ? "success" : alertFilter === "warning" ? "warning" : "danger"
                  }-subtle text-${
                    alertFilter === "ok" ? "success" : alertFilter === "warning" ? "warning" : "danger"
                  }`}
                >
                  Filtre : {alertFilter}
                </span>
              )}
            </h6>
            {alertFilter !== "all" && (
              <button
                className="btn btn-sm btn-soft-secondary"
                onClick={() => setAlertFilter("all")}
              >
                <i className="ri-close-line me-1"></i>Retirer le filtre
              </button>
            )}
          </div>

          <div className="card-body p-0">
            {loading ? (
              <LoadingSpinner text="Chargement des seuils..." />
            ) : thresholds.length === 0 ? (
              <EmptyState
                icon="ri-alarm-warning-line"
                title="Aucun seuil configuré"
                description="Cliquez sur « Nouveau seuil » pour définir les alertes KPI de ce projet."
                actionLabel="Créer le premier seuil"
                onAction={() => { setEditTarget(null); setShowForm(true); }}
              />
            ) : filteredThresholds.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <i className="ri-filter-line fs-2 d-block mb-2 opacity-40"></i>
                <p className="mb-0">Aucun KPI avec le statut « {alertFilter} » pour ce projet.</p>
                <button className="btn btn-sm btn-link mt-2" onClick={() => setAlertFilter("all")}>
                  Afficher tous les seuils
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle table-hover table-nowrap mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-4" style={{ width: "35%" }}>KPI</th>
                      <th className="text-center">🟡 Warning</th>
                      <th className="text-center">🔴 Critical</th>
                      <th className="text-center">Valeur actuelle</th>
                      <th className="text-center">Statut</th>
                      <th className="text-end pe-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredThresholds.map((t) => {
                      const alert = alerts.find((a) => a.kpi_name === t.kpi_name);
                      const color = alert ? alertLevelToColor(alert.level) : null;

                      return (
                        <tr
                          key={t.id}
                          className={
                            alert?.level === "critical"
                              ? "table-danger"
                              : alert?.level === "warning"
                              ? "table-warning"
                              : ""
                          }
                        >
                          {/* KPI name */}
                          <td className="ps-4">
                            <div className="d-flex align-items-center gap-3">
                              <div
                                className="rounded-2 bg-warning-subtle d-flex align-items-center justify-content-center flex-shrink-0"
                                style={{ width: 36, height: 36 }}
                              >
                                <i className="ri-bar-chart-2-line text-warning fs-16"></i>
                              </div>
                              <div>
                                <p className="fw-semibold mb-0 fs-13">
                                  {KPI_LABELS[t.kpi_name] || t.kpi_name}
                                </p>
                                <p className="text-muted mb-0 fs-11 font-monospace">{t.kpi_name}</p>
                              </div>
                            </div>
                          </td>

                          {/* Warning value */}
                          <td className="text-center">
                            <span className="badge bg-warning-subtle text-warning fw-semibold fs-13 px-3 py-2">
                              {t.warning_value}
                            </span>
                          </td>

                          {/* Critical value */}
                          <td className="text-center">
                            <span className="badge bg-danger-subtle text-danger fw-semibold fs-13 px-3 py-2">
                              {t.critical_value}
                            </span>
                          </td>

                          {/* Valeur actuelle */}
                          <td className="text-center">
                            {alert ? (
                              <span className={`fw-bold text-${color} fs-14`}>
                                {typeof alert.value === "number"
                                  ? alert.value.toFixed(2)
                                  : "—"}
                              </span>
                            ) : (
                              <span className="text-muted fs-12">
                                <i className="ri-time-line me-1"></i>—
                              </span>
                            )}
                          </td>

                          {/* Statut */}
                          <td className="text-center">
                            {alert ? (
                              <StatusBadge type="threshold" value={alert.level} />
                            ) : (
                              <span className="badge bg-light text-secondary fs-11">
                                <i className="ri-question-line me-1"></i>Non évalué
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="text-end pe-4">
                            <div className="d-flex gap-1 justify-content-end">
                              <button
                                className="btn btn-sm btn-soft-primary btn-icon"
                                title="Modifier"
                                onClick={() => { setEditTarget(t); setShowForm(true); }}
                              >
                                <i className="ri-pencil-fill"></i>
                              </button>
                              <button
                                className="btn btn-sm btn-soft-danger btn-icon"
                                title="Supprimer"
                                onClick={() => setDeleteTarget(t)}
                              >
                                <i className="ri-delete-bin-fill"></i>
                              </button>
                            </div>
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

        {/* ── Quick-add : KPIs sans seuil ─────────────────────────────────── */}
        {!loading && availableKpis.length > 0 && (
          <div
            className="card border-0 shadow-sm mt-3"
            style={{ borderLeft: "4px solid #f7b84b" }}
          >
            <div className="card-body py-3">
              <p className="fw-semibold mb-2 fs-13 text-warning">
                <i className="ri-alert-line me-1"></i>
                {availableKpis.length} KPI{availableKpis.length > 1 ? "s" : ""} sans seuil — configurez-les rapidement :
              </p>
              <div className="d-flex flex-wrap gap-2">
                {availableKpis.map((k) => (
                  <button
                    key={k}
                    className="btn btn-sm btn-outline-warning"
                    onClick={() => {
                      // Pré-sélectionner ce KPI dans le formulaire
                      setEditTarget(null);
                      setShowForm(true);
                    }}
                  >
                    <i className="ri-add-line me-1"></i>
                    {KPI_LABELS[k] || k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>{/* /container-fluid */}

      {/* ── Modal formulaire ─────────────────────────────────────────────── */}
      <ThresholdModal
        show={showForm}
        editTarget={editTarget}
        availableKpis={availableKpis}
        onClose={() => { setShowForm(false); setEditTarget(null); }}
        onSave={handleSave}
      />

      {/* ── Modal confirmation suppression ──────────────────────────────── */}
      <ConfirmModal
        show={!!deleteTarget}
        title="Supprimer ce seuil ?"
        message={
          deleteTarget
            ? `Le seuil pour « ${KPI_LABELS[deleteTarget.kpi_name] || deleteTarget.kpi_name} » sera définitivement supprimé.`
            : ""
        }
        confirmLabel="Supprimer"
        confirmColor="danger"
        icon="ri-delete-bin-line"
        iconColor="danger"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        loading={deleting}
      />

    </div>
  );
}
