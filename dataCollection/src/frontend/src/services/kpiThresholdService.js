/**
 * kpiThresholdService.js
 *
 * Service pour la gestion des seuils d'alerte KPI.
 * Backend : GET/POST/PUT/DELETE /api/kpi-thresholds
 *           GET /api/kpi-thresholds/evaluate
 *
 * KPIs valides :
 *   - mr_rate_per_site
 *   - approved_mr_rate
 *   - merged_mr_rate
 *   - commit_rate_per_site
 *   - nb_commits_per_project
 *   - avg_review_time_hours
 *
 * KpiAlertLevel retourné par /evaluate :
 *   { kpi_name, value, warning_value, critical_value, level, color }
 *   level : "ok" | "warning" | "critical"
 *   color : "green" | "yellow" | "red"
 */

import api from "./api";

// ─── Libellés lisibles pour l'UI ─────────────────────────────────────────────
export const KPI_LABELS = {
  mr_rate_per_site:      "MR Rate / Site",
  approved_mr_rate:      "Approved MR Rate",
  merged_mr_rate:        "Merged MR Rate",
  commit_rate_per_site:  "Commit Rate / Site",
  nb_commits_per_project:"Commits / Projet",
  avg_review_time_hours: "Temps moyen relecture (h)",
};

export const KPI_NAMES = Object.keys(KPI_LABELS);

// ─── Helpers alertes ─────────────────────────────────────────────────────────

/**
 * Retourne la classe Bootstrap correspondant au niveau d'alerte.
 * @param {"ok"|"warning"|"critical"} level
 */
export const alertLevelToColor = (level) => {
  switch (level) {
    case "critical": return "danger";
    case "warning":  return "warning";
    case "ok":
    default:         return "success";
  }
};

/**
 * Retourne l'icône Remix Icon correspondant au niveau d'alerte.
 * @param {"ok"|"warning"|"critical"} level
 */
export const alertLevelToIcon = (level) => {
  switch (level) {
    case "critical": return "ri-close-circle-line";
    case "warning":  return "ri-alert-line";
    case "ok":
    default:         return "ri-checkbox-circle-line";
  }
};

// ─── API calls ────────────────────────────────────────────────────────────────

const kpiThresholdService = {

  /**
   * Lister tous les seuils configurés pour un projet.
   * GET /kpi-thresholds?project_id={projectId}
   * @returns {Promise<KpiThresholdResponse[]>}
   */
  getByProject: async (projectId) => {
    const { data } = await api.get("/kpi-thresholds", {
      params: { project_id: projectId },
    });
    return data;
  },

  /**
   * Créer un nouveau seuil (admin uniquement).
   * POST /kpi-thresholds
   * @param {{ kpi_name, warning_value, critical_value, project_id }} payload
   * @returns {Promise<KpiThresholdResponse>}
   */
  create: async (payload) => {
    const { data } = await api.post("/kpi-thresholds", payload);
    return data;
  },

  /**
   * Mettre à jour un seuil existant (admin uniquement).
   * PUT /kpi-thresholds/{thresholdId}
   * @param {number} thresholdId
   * @param {{ warning_value?, critical_value? }} payload
   * @returns {Promise<KpiThresholdResponse>}
   */
  update: async (thresholdId, payload) => {
    const { data } = await api.put(`/kpi-thresholds/${thresholdId}`, payload);
    return data;
  },

  /**
   * Supprimer un seuil (admin uniquement).
   * DELETE /kpi-thresholds/{thresholdId}
   */
  delete: async (thresholdId) => {
    await api.delete(`/kpi-thresholds/${thresholdId}`);
  },

  /**
   * Évaluer les KPIs d'un projet par rapport aux seuils configurés.
   * GET /kpi-thresholds/evaluate?project_id={projectId}
   *
   * Retourne une liste de KpiAlertLevel :
   * { kpi_name, value, warning_value, critical_value, level, color }
   *
   * Utilisé par DashboardKPI.jsx pour colorier les cards 🟢🟡🔴
   *
   * @param {number} projectId
   * @returns {Promise<KpiAlertLevel[]>}
   */
  evaluate: async (projectId) => {
    const { data } = await api.get("/kpi-thresholds/evaluate", {
      params: { project_id: projectId },
    });
    return data;
  },

  /**
   * Upsert — crée ou met à jour selon l'existence du seuil.
   * Pratique pour le formulaire de configuration qui ne distingue pas
   * création / édition.
   *
   * @param {KpiThresholdResponse[]} existingThresholds   seuils déjà chargés
   * @param {{ kpi_name, warning_value, critical_value, project_id }} payload
   */
  upsert: async (existingThresholds, payload) => {
    const existing = existingThresholds.find(
      (t) => t.kpi_name === payload.kpi_name
    );
    if (existing) {
      return kpiThresholdService.update(existing.id, {
        warning_value:  payload.warning_value,
        critical_value: payload.critical_value,
      });
    }
    return kpiThresholdService.create(payload);
  },
};

export default kpiThresholdService;
