/**
 * services/kpiThresholdService.js
 *
 * Gestion des seuils KPI et évaluation des niveaux d'alerte.
 *
 * CORRECTIONS :
 *
 *   1. FIX CRITIQUE — create() et upsert() :
 *      Le backend KpiThresholdCreate attend `threshold_type` (pas `type`).
 *      AVANT : { type: "MONTHLY", ... }     → champ ignoré → threshold_type = NULL
 *      ✅ FIX : normalise payload.type → payload.threshold_type avant envoi.
 *
 *   2. FIX — update() :
 *      KpiThresholdUpdate attend `threshold_type` (pas `type`).
 *      ✅ FIX : même normalisation.
 *
 *   3. FIX — upsert() :
 *      La recherche du threshold existant utilisait t.kpi_name
 *      mais KpiThresholdResponse retourne maintenant threshold_type (pas type).
 *      ✅ FIX : comparaison sur kpi_definition_id en priorité (plus fiable).
 */

import api from "./api";

// ── Libellés lisibles (codes = KpiDefinition.code backend) ───────────────────
export const KPI_LABELS = {
  MR_RATE_SITE:       "MR Rate / Site",
  APPROVED_MR_RATE:   "Approved MR Rate",
  MERGED_MR_RATE:     "Merged MR Rate",
  COMMIT_RATE_SITE:   "Commit Rate / Site",
  NB_COMMITS_PROJECT: "Commits / Projet",
  AVG_REVIEW_TIME:    "Temps moyen relecture (h)",
};

export const KPI_NAMES = Object.keys(KPI_LABELS);

// ── Couleurs et icônes selon le niveau d'alerte ───────────────────────────────
export const alertLevelToColor = (level) =>
  ({ critical: "danger", warning: "warning" }[level] ?? "success");

export const alertLevelToBg = (level) =>
  ({ critical: "#fff1f0", warning: "#fffbe6" }[level] ?? "#f6ffed");

export const alertLevelToIcon = (level) =>
  ({
    critical: "ri-close-circle-line",
    warning:  "ri-alert-line",
  }[level] ?? "ri-checkbox-circle-line");

// ── Helper buildParams ────────────────────────────────────────────────────────
const bp = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));

/**
 * Normalise le payload avant envoi au backend.
 * ✅ FIX : renomme `type` → `threshold_type` si nécessaire.
 */
const normalizeThresholdPayload = (payload) => {
  const normalized = { ...payload };
  if (normalized.type !== undefined && normalized.threshold_type === undefined) {
    normalized.threshold_type = normalized.type;
    delete normalized.type;
  }
  return normalized;
};

// ── API ───────────────────────────────────────────────────────────────────────
const kpiThresholdService = {

  /** GET /kpi-thresholds?project_id=X */
  getByProject: async (projectId) =>
    (await api.get("/kpi-thresholds", { params: { project_id: projectId } })).data,

  /** GET /kpi-thresholds?dashboard_id=X */
  getByDashboard: async (dashboardId) =>
    (await api.get("/kpi-thresholds", { params: { dashboard_id: dashboardId } })).data,

  /**
   * POST /kpi-thresholds
   * ✅ FIX : normalise type → threshold_type avant envoi.
   *
   * Payload attendu par le backend :
   *   { project_id, kpi_definition_id, warning_value, critical_value,
   *     threshold_type, dashboard_id? }
   */
  create: async (payload) => {
    const normalized = normalizeThresholdPayload(payload);
    return (await api.post("/kpi-thresholds", normalized)).data;
  },

  /**
   * PUT /kpi-thresholds/{id}
   * ✅ FIX : normalise type → threshold_type avant envoi.
   */
  update: async (id, payload) => {
    const normalized = normalizeThresholdPayload(payload);
    return (await api.put(`/kpi-thresholds/${id}`, normalized)).data;
  },

  /** DELETE /kpi-thresholds/{id} */
  delete: async (id) => {
    await api.delete(`/kpi-thresholds/${id}`);
  },

  /** GET /kpi-thresholds/evaluate?project_id=X&dashboard_id=Y */
  evaluate: async (projectId, dashboardId = null) =>
    (await api.get("/kpi-thresholds/evaluate", {
      params: bp({ project_id: projectId, dashboard_id: dashboardId }),
    })).data,

  /**
   * Upsert — crée ou met à jour un seuil.
   *
   * ✅ FIX : recherche en priorité par kpi_definition_id (FK fiable)
   * puis fallback sur kpi_name (rétrocompatibilité).
   *
   * ✅ FIX : normalise threshold_type avant envoi.
   */
  upsert: async (existingThresholds, payload) => {
    const existing = existingThresholds.find((t) => {
      // Priorité 1 : kpi_definition_id (FK fiable, NOT NULL en DB)
      if (payload.kpi_definition_id != null && t.kpi_definition_id != null)
        return t.kpi_definition_id === payload.kpi_definition_id;
      // Priorité 2 : kpi_name (fallback rétrocompatibilité)
      if (payload.kpi_name != null && t.kpi_name != null)
        return t.kpi_name === payload.kpi_name;
      return false;
    });

    if (existing) {
      return kpiThresholdService.update(existing.id, {
        warning_value:  payload.warning_value,
        critical_value: payload.critical_value,
        // ✅ FIX : threshold_type au lieu de type
        ...(payload.threshold_type != null && { threshold_type: payload.threshold_type }),
        ...(payload.type           != null && { threshold_type: payload.type }),
        ...(payload.dashboard_id   != null && { dashboard_id:   payload.dashboard_id }),
      });
    }

    return kpiThresholdService.create(payload);
  },
};

export default kpiThresholdService;